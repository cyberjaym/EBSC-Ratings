// Same proof as test/tenant-isolation.test.mjs, but end-to-end over real
// HTTP against a live Supabase project: real auth.admin.createUser() calls,
// real signInWithPassword() JWTs, real PostgREST requests enforcing the
// RLS policies in db/02_policies.sql. This is what actually runs in
// production — the local Postgres test proves the policies are correct in
// isolation, this proves the deployed auth + API + DB chain enforces them.
//
// Prereqs: db/00_schema.sql and db/02_policies.sql already applied to this
// project via the Supabase SQL Editor (db/01_local_auth_stub.sql is NOT
// applied here — real Supabase provides auth.uid()/auth.jwt() natively).
//
// Usage: node test/live-auth-isolation.test.mjs
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const TENANT_A_SUBDOMAIN = "livetesta";
const TENANT_B_SUBDOMAIN = "livetestb";
const TEST_PASSWORD = "Test-Isolation-Proof-1234!";

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; console.log(`  \x1b[31m✗ FAIL\x1b[0m ${name}${extra ? ` — ${extra}` : ""}`); }
}

function isRlsError(error) {
  // PostgREST surfaces RLS rejections as Postgres error 42501, or as an
  // empty affected-rows result for UPDATE/DELETE (not always a thrown error).
  return !!error && (error.code === "42501" || /row-level security/i.test(error.message || ""));
}

async function getOrCreateUser(email) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find(u => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function clientAs(email) {
  const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw error;
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function main() {
  console.log("Provisioning test users via Admin API...");
  const emails = {
    platformAdmin: "live.platform.admin@example.com",
    adminA: "live.admin.a@example.com",
    adminB: "live.admin.b@example.com",
    coachA: "live.coach.a@example.com",
    coachA2: "live.coach.a2@example.com",
    parentA: "live.parent.a@example.com",
    parentB: "live.parent.b@example.com",
  };
  const ids = {};
  for (const [key, email] of Object.entries(emails)) ids[key] = await getOrCreateUser(email);

  // profiles rows (service role bypasses RLS — same trust boundary as a
  // Postgres trigger on auth.users would have)
  for (const [key, email] of Object.entries(emails)) {
    const { error } = await admin.from("profiles").upsert({ id: ids[key], email, display_name: key }, { onConflict: "id" });
    if (error) throw error;
  }

  console.log("Seeding tenants A/B (service role)...");
  // Clean any previous run's tenant rows (cascade removes all children).
  await admin.from("tenants").delete().in("subdomain", [TENANT_A_SUBDOMAIN, TENANT_B_SUBDOMAIN]);

  const { data: tenants, error: tErr } = await admin.from("tenants")
    .insert([
      { name: "Live Test Tenant A", subdomain: TENANT_A_SUBDOMAIN },
      { name: "Live Test Tenant B", subdomain: TENANT_B_SUBDOMAIN },
    ]).select();
  if (tErr) throw tErr;
  const tenantA = tenants.find(t => t.subdomain === TENANT_A_SUBDOMAIN).id;
  const tenantB = tenants.find(t => t.subdomain === TENANT_B_SUBDOMAIN).id;

  await admin.from("platform_admins").upsert({ user_id: ids.platformAdmin });

  await admin.from("memberships").insert([
    { user_id: ids.adminA, tenant_id: tenantA, role: "league_admin" },
    { user_id: ids.adminB, tenant_id: tenantB, role: "league_admin" },
    { user_id: ids.coachA, tenant_id: tenantA, role: "coach" },
    { user_id: ids.coachA2, tenant_id: tenantA, role: "coach" },
    { user_id: ids.parentA, tenant_id: tenantA, role: "parent" },
    { user_id: ids.parentB, tenant_id: tenantB, role: "parent" },
  ]);

  const { data: teams } = await admin.from("teams").insert([
    { tenant_id: tenantA, name: "A Sharks", division: "U9" },
    { tenant_id: tenantA, name: "A Falcons", division: "U9" },
    { tenant_id: tenantB, name: "B Sharks", division: "U9" },
  ]).select();
  const teamA1 = teams.find(t => t.name === "A Sharks").id;
  const teamA2 = teams.find(t => t.name === "A Falcons").id;
  const teamB1 = teams.find(t => t.name === "B Sharks").id;

  await admin.from("coach_teams").insert([
    { user_id: ids.coachA, team_id: teamA1, tenant_id: tenantA },
    { user_id: ids.coachA2, team_id: teamA2, tenant_id: tenantA },
  ]);

  const { data: players } = await admin.from("players").insert([
    { tenant_id: tenantA, first_name: "Alice", last_name: "Anderson", division: "U9", team_id: teamA1 },
    { tenant_id: tenantA, first_name: "Cara", last_name: "Chen", division: "U9", team_id: teamA2 },
    { tenant_id: tenantB, first_name: "Bob", last_name: "Baker", division: "U9", team_id: teamB1 },
  ]).select();
  const playerA = players.find(p => p.first_name === "Alice").id;
  const playerA2 = players.find(p => p.first_name === "Cara").id;
  const playerB = players.find(p => p.first_name === "Bob").id;

  await admin.from("parent_players").insert([
    { user_id: ids.parentA, player_id: playerA, tenant_id: tenantA },
    { user_id: ids.parentB, player_id: playerB, tenant_id: tenantB },
  ]);

  await admin.from("ratings").insert([
    { tenant_id: tenantA, player_id: playerA, overall: 2, rated_by: ids.coachA, notes: "Tenant A private note" },
    { tenant_id: tenantB, player_id: playerB, overall: 3, rated_by: ids.adminB, notes: "Tenant B private note" },
  ]);

  console.log("\n== Cross-tenant isolation (league_admin), over live HTTP ==");
  {
    const asAdminA = await clientAs(emails.adminA);

    const { data: r1 } = await asAdminA.from("players").select("id");
    check("Admin A sees only tenant A players", r1.length === 2 && r1.every(row => [playerA, playerA2].includes(row.id)), `saw ${r1?.length}`);

    const { data: r2 } = await asAdminA.from("players").select("id").eq("tenant_id", tenantB);
    check("Admin A querying tenant B players directly returns 0 rows", r2.length === 0, `saw ${r2?.length}`);

    const { data: r3 } = await asAdminA.from("ratings").select("id").eq("tenant_id", tenantB);
    check("Admin A cannot read tenant B ratings (private notes)", r3.length === 0);

    const { data: r4 } = await asAdminA.from("players").update({ last_name: "HACKED" }).eq("id", playerB).select();
    check("Admin A UPDATE against tenant B player affects 0 rows", (r4 || []).length === 0);

    const { data: r5 } = await asAdminA.from("teams").delete().eq("id", teamB1).select();
    check("Admin A DELETE against tenant B team affects 0 rows", (r5 || []).length === 0);

    const { error: e6 } = await asAdminA.from("ratings").insert({ tenant_id: tenantB, player_id: playerB, overall: 1, rated_by: ids.adminA, notes: "cross-tenant write attempt" });
    check("Admin A INSERT rating into tenant B is rejected by RLS", isRlsError(e6), e6?.message);

    const { error: e7 } = await asAdminA.from("memberships").insert({ user_id: ids.adminA, tenant_id: tenantB, role: "league_admin" });
    check("Admin A cannot grant themselves league_admin on tenant B (privilege escalation blocked)", isRlsError(e7), e7?.message);
  }

  console.log("\n== Cross-tenant isolation (parent), over live HTTP ==");
  {
    const asParentA = await clientAs(emails.parentA);
    const { data: r1 } = await asParentA.from("players").select("id");
    check("Parent A sees only their own child, not tenant-mates or tenant B", r1.length === 1 && r1[0].id === playerA, `saw ${JSON.stringify(r1)}`);

    const { data: r2 } = await asParentA.from("ratings").select("id").eq("tenant_id", tenantB);
    check("Parent A cannot read tenant B ratings", r2.length === 0);
  }

  console.log("\n== In-tenant role scoping (coach limited to own team), over live HTTP ==");
  {
    const asCoachA = await clientAs(emails.coachA);
    const { data: r1 } = await asCoachA.from("players").select("id");
    check("Coach A (Sharks) sees only their own team's player, not Falcons' Cara", r1.length === 1 && r1[0].id === playerA, `saw ${JSON.stringify(r1)}`);

    const { error: e2 } = await asCoachA.from("ratings").insert({ tenant_id: tenantA, player_id: playerA2, overall: 2, rated_by: ids.coachA });
    check("Coach A cannot rate a player on a team they don't coach (same tenant)", isRlsError(e2), e2?.message);
  }

  console.log("\n== Platform admin (cross-tenant by design), over live HTTP ==");
  {
    const asPlatformAdmin = await clientAs(emails.platformAdmin);
    const { data: r1 } = await asPlatformAdmin.from("players").select("tenant_id");
    const tenantsSeen = new Set((r1 || []).map(row => row.tenant_id));
    check("Platform admin sees players from both tenant A and tenant B", tenantsSeen.has(tenantA) && tenantsSeen.has(tenantB));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
