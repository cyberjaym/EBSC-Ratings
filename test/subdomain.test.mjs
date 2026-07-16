import assert from "node:assert/strict";
import { extractSubdomain } from "../lib/subdomain.mjs";

const ROOT = "lvh.me:3000";
const cases = [
  ["tenanta.lvh.me:3000", ROOT, "tenanta"],
  ["tenantb.lvh.me:3000", ROOT, "tenantb"],
  ["admin.lvh.me:3000", ROOT, "admin"],
  ["lvh.me:3000", ROOT, ""], // bare root domain — no tenant
  ["www.lvh.me:3000", ROOT, ""], // www is not a tenant
  ["evil.com", ROOT, ""], // unrelated host — no tenant, not a crash
  ["notlvh.me:3000", ROOT, ""], // similar-looking but not a subdomain of root
  ["a.b.lvh.me:3000", ROOT, "a.b"], // nested subdomain preserved as-is
];

let failed = 0;
for (const [host, root, expected] of cases) {
  const actual = extractSubdomain(host, root);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗ FAIL\x1b[0m"} extractSubdomain(${JSON.stringify(host)}) => ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
}

console.log(`\n${cases.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
