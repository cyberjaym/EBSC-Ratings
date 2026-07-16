import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { resolveTheme } from "@/lib/theme";
import { updateBranding, updateLogo, updateBackground } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) redirect("/dashboard");

  const [role, platformAdmin] = await Promise.all([
    getMembershipRole(tenant.id, user.id),
    isPlatformAdmin(user.id),
  ]);
  if (role !== "league_admin" && !platformAdmin) redirect("/dashboard");

  const theme = resolveTheme(tenant.theme);

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <Link href="/dashboard" style={{ fontSize: 12 }}>
        &larr; Back to dashboard
      </Link>
      <h1 style={{ fontSize: 18, color: "var(--accent)" }}>League settings &amp; branding</h1>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Changes here apply immediately — no rebuild or redeploy, for you or any other league on this platform.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Name &amp; colors</h2>
        <form action={updateBranding.bind(null, tenant.id)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12 }}>
            League name (shown in the header)
            <input name="name" defaultValue={tenant.name} required style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Accent color
            <input name="accentColor" type="color" defaultValue={theme.accentColor} style={{ display: "block", marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Background color
            <input name="backgroundColor" type="color" defaultValue={theme.backgroundColor} style={{ display: "block", marginTop: 4 }} />
          </label>
          <button type="submit" style={{ padding: 8, cursor: "pointer" }}>
            Save
          </button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Logo</h2>
        {theme.logoUrl && <img src={theme.logoUrl} alt="Current logo" style={{ maxHeight: 60, marginBottom: 8 }} />}
        <form action={updateLogo.bind(null, tenant.id)} style={{ display: "flex", gap: 8 }}>
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            Upload
          </button>
        </form>
        <p style={{ fontSize: 11, opacity: 0.6 }}>PNG, JPEG, or WebP, 2MB max. Used as the favicon and PWA home-screen icon.</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Background image</h2>
        {theme.backgroundImageUrl && (
          <img src={theme.backgroundImageUrl} alt="Current background" style={{ maxHeight: 60, marginBottom: 8 }} />
        )}
        <form action={updateBackground.bind(null, tenant.id)} style={{ display: "flex", gap: 8 }}>
          <input name="background" type="file" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            Upload
          </button>
        </form>
        <p style={{ fontSize: 11, opacity: 0.6 }}>PNG, JPEG, or WebP, 2MB max.</p>
      </section>
    </main>
  );
}
