import type { Metadata } from "next";
import { currentSubdomain, getTenantBySubdomain } from "@/lib/tenant";
import { resolveTheme } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  const theme = resolveTheme(tenant?.theme);

  return {
    title: tenant?.name || "EBSC Ratings",
    description: "Youth sports league management",
    manifest: "/api/manifest",
    icons: { icon: theme.logoUrl || "/icon-192.png" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  const theme = resolveTheme(tenant?.theme);

  return (
    <html lang="en">
      <head>
        {/* Tenant theme as CSS custom properties — the one thing every
            page needs, so it lives here rather than per-page. Changing a
            tenant's theme row takes effect on the next request; nothing
            to rebuild or redeploy. */}
        <style>{`:root {
          --accent: ${theme.accentColor};
          --bg: ${theme.backgroundColor};
        }`}</style>
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "var(--bg)",
          color: "#e8edf5",
          minHeight: "100vh",
          ...(theme.backgroundImageUrl
            ? { backgroundImage: `url(${theme.backgroundImageUrl})`, backgroundSize: "cover", backgroundAttachment: "fixed" }
            : {}),
        }}
      >
        {children}
      </body>
    </html>
  );
}
