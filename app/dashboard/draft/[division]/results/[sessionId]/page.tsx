import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getDraftTeams, getSessionPicks } from "@/lib/draft-data";
import styles from "../../../draft.module.css";

export default async function DraftResultsPage({
  params,
}: {
  params: Promise<{ division: string; sessionId: string }>;
}) {
  const { division: divisionParam, sessionId } = await params;
  const division = decodeURIComponent(divisionParam);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) redirect("/dashboard");

  const [role, platformAdmin] = await Promise.all([getMembershipRole(tenant.id, user.id), isPlatformAdmin(user.id)]);
  if (role !== "league_admin" && !platformAdmin) redirect("/dashboard");

  const { data: session } = await supabase.from("draft_sessions").select("id, status, created_at").eq("id", sessionId).eq("tenant_id", tenant.id).maybeSingle();
  if (!session) redirect(`/dashboard/draft/${encodeURIComponent(division)}`);

  const teams = await getDraftTeams(tenant.id, division);
  const picks = await getSessionPicks(sessionId);
  const byTeam: Record<string, typeof picks> = {};
  for (const pk of picks) (byTeam[pk.team_id] ??= []).push(pk);

  return (
    <div className={styles.theme}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Link href={`/dashboard/draft/${encodeURIComponent(division)}`} className={styles.backLink}>
          &larr; Back
        </Link>
        <h1 className={styles.heading} style={{ fontSize: 24, margin: "4px 0 4px" }}>
          {division} — {new Date(session.created_at).toLocaleDateString()} ({session.status})
        </h1>
        <a href={`/dashboard/draft/${encodeURIComponent(division)}/results/${sessionId}/export`} style={{ fontSize: 12, color: "var(--gold)" }}>
          Download CSV
        </a>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
          {teams.map((t) => {
            const roster = byTeam[t.id] || [];
            return (
              <div key={t.id} className={styles.rosterCard}>
                <div className={styles.rosterHeader}>
                  <div className={styles.rosterName}>{t.name}</div>
                  <div className={styles.rosterMeta}>{roster.length} players</div>
                </div>
                {roster.map((pk) => (
                  <div key={pk.id} className={styles.rosterPlayerRow}>
                    <span>{pk.type === "pre" ? "⭐" : pk.type === "admin" ? "🛡️" : `R${pk.round}`}</span>
                    <span>
                      {pk.player.first_name} {pk.player.last_name}
                    </span>
                  </div>
                ))}
                {roster.length === 0 && <div className={styles.muted} style={{ padding: "6px 12px" }}>No players</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
