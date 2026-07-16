import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getLatestDraftSession } from "@/lib/draft-data";
import styles from "./draft.module.css";

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
    <div className={styles.theme}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <Link href="/dashboard" className={styles.backLink}>
          &larr; Back to dashboard
        </Link>
        <h1 className={styles.heading} style={{ fontSize: 26, margin: "4px 0 16px" }}>
          Draft
        </h1>
        {rows.length === 0 && (
          <p className={styles.muted}>
            No divisions configured yet — add some under{" "}
            <Link href="/dashboard/settings" style={{ color: "var(--gold)" }}>
              League settings &amp; branding
            </Link>{" "}
            first.
          </p>
        )}
        <div className={styles.stack}>
          {rows.map(({ name, session }) => (
            <Link key={name} href={`/dashboard/draft/${encodeURIComponent(name)}`} className={styles.card} style={{ display: "flex", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
              <span style={{ fontSize: 14 }}>{name}</span>
              <span className={`${styles.badge} ${session?.status === "done" ? styles.badgeGreen : styles.badgeGold}`}>
                {!session ? "Not started" : session.status === "setup" ? "In setup" : session.status === "draft" ? "In progress" : "Finalized"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
