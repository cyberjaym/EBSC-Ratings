import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getLatestDraftSession } from "@/lib/draft-data";

export default async function DraftIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) redirect("/dashboard");

  const [role, platformAdmin] = await Promise.all([getMembershipRole(tenant.id, user.id), isPlatformAdmin(user.id)]);
  if (role !== "league_admin" && !platformAdmin) redirect("/dashboard");

  const { data: divisions } = await supabase.from("divisions").select("name").eq("tenant_id", tenant.id).order("name");

  const rows = await Promise.all(
    (divisions || []).map(async (d) => ({ name: d.name, session: await getLatestDraftSession(tenant.id, d.name) }))
  );

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <Link href="/dashboard" style={{ fontSize: 12 }}>
        &larr; Back to dashboard
      </Link>
      <h1 style={{ fontSize: 18, color: "var(--accent)" }}>Draft</h1>
      {rows.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          No divisions configured yet — add some under{" "}
          <Link href="/dashboard/settings">League settings &amp; branding</Link> first.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {rows.map(({ name, session }) => (
          <Link
            key={name}
            href={`/dashboard/draft/${encodeURIComponent(name)}`}
            style={{ display: "flex", justifyContent: "space-between", background: "#1118", padding: "10px 14px", borderRadius: 8, textDecoration: "none", color: "inherit" }}
          >
            <span>{name}</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              {!session ? "Not started" : session.status === "setup" ? "In setup" : session.status === "draft" ? "Draft in progress" : "Finalized"}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
