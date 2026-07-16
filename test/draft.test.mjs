import assert from "node:assert/strict";

// lib/draft.ts is plain TS with no JSX/decorators — Node's built-in type
// stripping (--experimental-strip-types, Node 22.6+) can run it directly,
// same as the other lib/*.mjs helpers being imported without a build step.
const { buildSnakeOrder, parseCsv, autoMapHeaders } = await import("../lib/draft.ts");

let failed = 0, passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; console.log(`  \x1b[31m✗ FAIL\x1b[0m ${name}${extra ? ` — ${extra}` : ""}`); }
}

// ── buildSnakeOrder ──
{
  const order = buildSnakeOrder(["A", "B", "C"], 3);
  check("3 teams x 3 rounds = 9 picks", order.length === 9, `got ${order.length}`);
  check("round 1 goes A,B,C (forward)", order.slice(0, 3).map(o => o.teamId).join(",") === "A,B,C");
  check("round 2 reverses to C,B,A (snake)", order.slice(3, 6).map(o => o.teamId).join(",") === "C,B,A");
  check("round 3 goes forward again A,B,C", order.slice(6, 9).map(o => o.teamId).join(",") === "A,B,C");
  check("pickNum is sequential 1..9", order.every((o, i) => o.pickNum === i + 1));
  check("round numbers correct", order[0].round === 1 && order[3].round === 2 && order[8].round === 3);
}

// ── parseCsv ──
{
  const { headers, rows } = parseCsv("First Name,Last Name,Division\nAlice,Anderson,U9\nBob,Baker,U10");
  check("parses headers", headers.join(",") === "First Name,Last Name,Division", headers.join(","));
  check("parses 2 rows", rows.length === 2, `got ${rows.length}`);
  check("row values map to headers", rows[0]["First Name"] === "Alice" && rows[0]["Division"] === "U9");
}
{
  // quoted field containing the delimiter itself
  const { rows } = parseCsv('First Name,Notes\nAlice,"Anderson, Jr."');
  check("quoted comma inside a field doesn't split it", rows[0]["Notes"] === "Anderson, Jr.", rows[0]["Notes"]);
}
{
  const { rows } = parseCsv("A\tB\nfoo\tbar");
  check("tab-separated input is detected and parsed", rows[0]["A"] === "foo" && rows[0]["B"] === "bar");
}
{
  const { headers, rows } = parseCsv("   \n\n");
  check("blank input yields no headers/rows", headers.length === 0 && rows.length === 0);
}

// ── autoMapHeaders ──
{
  const map = autoMapHeaders(["First Name", "Last Name", "DOB", "Age Group"]);
  check("maps 'First Name' -> firstName", map.firstName === "First Name");
  check("maps 'Last Name' -> lastName", map.lastName === "Last Name");
  check("maps 'DOB' -> birthdate", map.birthdate === "DOB");
  check("maps 'Age Group' -> division (contains 'age')", map.division === "Age Group");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
