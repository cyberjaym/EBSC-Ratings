import { NextResponse } from "next/server";
import { currentSubdomain, getTenantBySubdomain } from "@/lib/tenant";
import { resolveTheme } from "@/lib/theme";

// PWA manifest, generated per-request from the tenant resolved by
// proxy.ts. Replaces the old static manifest.json (which baked in one
// hardcoded name/icon for the whole app) — every league gets its own
// installable-app identity from the same deployment.
export async function GET() {
  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  const theme = resolveTheme(tenant?.theme);
  const name = tenant?.name || "EBSC Ratings";
  // A league admin uploads one logo image, not a set of pre-sized icons,
  // so a custom logo is reused at both sizes — the browser scales it.
  // Only the no-custom-logo default gets real distinct 192/512 assets.
  const icon192 = theme.logoUrl || "/icon-192.png";
  const icon512 = theme.logoUrl || "/icon-512.png";

  return NextResponse.json(
    {
      name,
      short_name: name,
      start_url: "/",
      display: "standalone",
      background_color: theme.backgroundColor,
      theme_color: theme.backgroundColor,
      icons: [
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
