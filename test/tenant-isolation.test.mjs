// Automated proof of tenant isolation and role scoping, run against the
// RLS policies in db/02_policies.sql on a real (local) Postgres instance —
// not mocked. Every query below goes through the same `authenticated`
// Postgres role and auth.uid() mechanism that Supabase uses in production,
// via the auth stub in db/01_local_auth_stub.sql.
//
// Usage: PGPASSWORD=localdev node test/tenant-isolation.test.mjs
import pg from "pg";

const { Client } = pg;

const ADMIN_A = "10000000-0000-0000-0000-00000000000a";
const ADMIN_B = "10000000-0000-0000-0000-00000000000b";
const COACH_A = "10000000-0000-0000-0000-0000000000ca";
const COACH_A2 = "10000000-0000-0000-0000-0000000000c2"; // second coach, own team, tenant A
const PARENT_A = "10000000-0000-0000-0000-0000000000da";
const PARENT_B = "10000000-0000-0000-0000-0000000000db";
const PLATFORM_ADMIN = "10000000-0000-0000-0000-000000000001";

const TENANT_A = "00000000-0000-0000-0000-00000000000a";
const TENANT_B = "00000000-0000-0000-0000-00000000000b";
const PLAYER_A = "30000000-0000-0000-0000-00000000000a"; // Alice, team A1, tenant A
const PLAYER_B = "30000000-0000-0000-0000-00000000000b"; // Bob, tenant B
const TEAM_A2 = "20000000-0000-0000-0000-00000000000c"; // second team in tenant A, NOT Coach A's

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; console.log(`  \x1b[31m✗ FAIL\x1b[0m ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function asUser(client, userId) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId })}'`);
}
async function endAs(client) {
  await client.query("rollback"); // never persist test-user side effects; also resets role/claims
}

// Postgres aborts the whole transaction after any error, so an *expected*
// RLS rejection would otherwise poison every later assertion in the same
// asUser() block. Run risky statements inside a savepoint so a rejection
// only unwinds that one statement.
async function expectRejected(client, sql) {
  await client.query("savepoint sp");
  try {
    await client.query(sql);
    await client.query("release savepoint sp");
    return false; // did not throw — not rejected
  } catch (e) {
    await client.query("rollback to savepoint sp");
    return /row-level security/i.test(e.message);
  }
}

async function main() {
  const client = new Client({
    host: "127.0.0.1", port: 5432, user: "postgres", password: "localdev", database: "ebsc_test",
  });
  await client.connect();

  // Extra fixtures for in-tenant role-scoping checks (beyond the base seed).
  await client.query(`insert into teams (id, tenant_id, name, division) values ('${TEAM_A2}', '${TENANT_A}', 'A Falcons', 'U9') on conflict (id) do nothing`);
  await client.query(`insert into profiles (id, email, display_name) values ('${COACH_A2}', 'coach.a2@example.com', 'Coach A2') on conflict (id) do nothing`);
  await client.query(`insert into memberships (user_id, tenant_id, role) values ('${COACH_A2}', '${TENANT_A}', 'coach') on conflict do nothing`);
  await client.query(`insert into coach_teams (user_id, team_id, tenant_id) values ('${COACH_A2}', '${TEAM_A2}', '${TENANT_A}') on conflict do nothing`);
  const extraPlayer = "30000000-0000-0000-0000-00000000000c";
  await client.query(`insert into players (id, tenant_id, first_name, last_name, division, team_id) values ('${extraPlayer}', '${TENANT_A}', 'Cara', 'Chen', 'U9', '${TEAM_A2}') on conflict (id) do nothing`);

  console.log("\n== Cross-tenant isolation (league_admin) ==");
  {
    await asUser(client, ADMIN_A);
    const r = await client.query("select id from players");
    check("Admin A sees only tenant A players", r.rows.length === 2 && r.rows.every(row => [PLAYER_A, extraPlayer].includes(row.id)), `saw ${r.rows.length} rows`);

    const r2 = await client.query(`select id from players where tenant_id = '${TENANT_B}'`);
    check("Admin A querying tenant B players directly returns 0 rows", r2.rows.length === 0, `saw ${r2.rows.length} rows`);

    const r3 = await client.query(`select id from ratings where tenant_id = '${TENANT_B}'`);
    check("Admin A cannot read tenant B ratings (private notes)", r3.rows.length === 0);

    const r4 = await client.query(`update players set last_name = 'HACKED' where id = '${PLAYER_B}' returning id`);
    check("Admin A UPDATE against tenant B player affects 0 rows", r4.rowCount === 0);

    const r5 = await client.query(`delete from teams where tenant_id = '${TENANT_B}' returning id`);
    check("Admin A DELETE against tenant B team affects 0 rows", r5.rowCount === 0);

    const insertBlocked = await expectRejected(client,
      `insert into ratings (tenant_id, player_id, overall, rated_by, notes) values ('${TENANT_B}', '${PLAYER_B}', 1, '${ADMIN_A}', 'attempted cross-tenant write')`);
    check("Admin A INSERT rating into tenant B is rejected by RLS", insertBlocked);

    const escalationBlocked = await expectRejected(client,
      `insert into memberships (user_id, tenant_id, role) values ('${ADMIN_A}', '${TENANT_B}', 'league_admin')`);
    check("Admin A cannot grant themselves league_admin on tenant B (privilege escalation blocked)", escalationBlocked);

    await endAs(client);
  }

  console.log("\n== Cross-tenant isolation (parent) ==");
  {
    await asUser(client, PARENT_A);
    const r = await client.query("select id from players");
    check("Parent A sees only their own child, not tenant-mates or tenant B", r.rows.length === 1 && r.rows[0].id === PLAYER_A, `saw ${r.rows.length} rows`);

    const r2 = await client.query(`select id from ratings where tenant_id = '${TENANT_B}'`);
    check("Parent A cannot read tenant B ratings", r2.rows.length === 0);
    await endAs(client);
  }

  console.log("\n== In-tenant role scoping (coach limited to own team) ==");
  {
    await asUser(client, COACH_A);
    const r = await client.query("select id from players");
    check("Coach A (Sharks) sees only their own team's player, not Falcons' Cara", r.rows.length === 1 && r.rows[0].id === PLAYER_A, `saw ${JSON.stringify(r.rows)}`);

    const insertBlocked = await expectRejected(client,
      `insert into ratings (tenant_id, player_id, overall, rated_by) values ('${TENANT_A}', '${extraPlayer}', 2, '${COACH_A}')`);
    check("Coach A cannot rate a player on a team they don't coach (same tenant)", insertBlocked);
    await endAs(client);
  }

  console.log("\n== Platform admin (cross-tenant by design) ==");
  {
    await asUser(client, PLATFORM_ADMIN);
    const r = await client.query("select tenant_id from players order by tenant_id");
    const tenantsSeen = new Set(r.rows.map(row => row.tenant_id));
    check("Platform admin sees players from both tenant A and tenant B", tenantsSeen.has(TENANT_A) && tenantsSeen.has(TENANT_B));
    await endAs(client);
  }

  console.log("\n== Unauthenticated (no claims set) ==");
  {
    await client.query("begin");
    await client.query("set local role authenticated");
    // deliberately no request.jwt.claims set — auth.uid() is null
    const r = await client.query("select id from players");
    check("No JWT/claims set => auth.uid() is null => 0 rows visible anywhere", r.rows.length === 0, `saw ${r.rows.length} rows`);

    // Tenant branding (name/theme/subdomain) is the one thing that's
    // deliberately public — a league's login page needs to show its own
    // name/logo/colors before anyone signs in. Confirm that's visible with
    // no auth at all, while everything else stays locked (checked above).
    const rTenants = await client.query("select id, subdomain from tenants order by subdomain");
    check("Public branding: tenants readable with no auth at all", rTenants.rows.length === 2 &&
      rTenants.rows.some(r => r.subdomain === "tenanta") && rTenants.rows.some(r => r.subdomain === "tenantb"),
      `saw ${JSON.stringify(rTenants.rows)}`);

    await client.query("rollback");
  }

  await client.end();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
