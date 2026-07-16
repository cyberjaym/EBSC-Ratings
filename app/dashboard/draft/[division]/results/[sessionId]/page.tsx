import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getDraftTeams, getSessionPicks } from "@/lib/draft-data";

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
    <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 16px" }}>
      <Link href={`/dashboard/draft/${encodeURIComponent(division)}`} style={{ fontSize: 12 }}>
        &larr; Back
      </Link>
      <h1 style={{ fontSize: 18, color: "var(--accent)" }}>
        {division} — {new Date(session.created_at).toLocaleDateString()} ({session.status})
      </h1>
      <a href={`/dashboard/draft/${encodeURIComponent(division)}/results/${sessionId}/export`} style={{ fontSize: 12 }}>
        Download CSV
      </a>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
        {teams.map((t) => {
          const roster = byTeam[t.id] || [];
          return (
            <div key={t.id} style={{ background: "#1118", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 15, color: "var(--accent)", marginBottom: 6 }}>
                {t.name} ({roster.length})
              </div>
              {roster.map((pk) => (
                <div key={pk.id} style={{ fontSize: 12, padding: "2px 0" }}>
                  {pk.type === "pre" ? "⭐" : pk.type === "admin" ? "🛡️" : `R${pk.round}`} {pk.player.first_name} {pk.player.last_name}
                </div>
              ))}
              {roster.length === 0 && <div style={{ fontSize: 11, opacity: 0.5 }}>No players</div>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
