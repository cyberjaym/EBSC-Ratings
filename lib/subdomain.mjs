// Pure host-header parsing, no I/O — kept separate from
// lib/supabase/middleware.ts so it's unit-testable without a live Supabase
// connection (see test/subdomain.test.mjs).
export function extractSubdomain(host, rootDomain) {
  const bare = host.replace(/:\d+$/, "");
  const rootBare = rootDomain.replace(/:\d+$/, "");
  if (bare === rootBare || bare === `www.${rootBare}`) return "";
  if (!bare.endsWith(`.${rootBare}`)) return "";
  return bare.slice(0, -(rootBare.length + 1));
}
