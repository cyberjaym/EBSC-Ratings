import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getLatestDraftSession, getDraftTeams, getRankedDraftablePlayers, getSessionPicks } from "@/lib/draft-data";
import { createDraftSession } from "../actions";
import {
  addTeam,
  moveTeam,
  addPreAssign,
  removePreAssign,
  startDraft,
  draftPlayer,
  adminAssign,
  undoLastPick,
  skipPick,
  autoCompleteRest,
  finalizeDraft,
  uploadRosterCsv,
} from "./actions";

function fmtAge(birthdate: string | null): string {
  if (!birthdate) return "?";
  const years = (Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 3600 * 1000);
  return `${Math.round(years)}y`;
}

export default async function DraftDivisionPage({ params }: { params: Promise<{ division: string }> }) {
  const { division: divisionParam } = await params;
  const division = decodeURIComponent(divisionParam);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) redirect("/dashboard");

  const [role, platformAdmin] = await Promise.all([getMembershipRole(tenant.id, user.id), isPlatformAdmin(user.id)]);
  if (role !== "league_admin" && !platformAdmin) redirect("/dashboard");

  const session = await getLatestDraftSession(tenant.id, division);
  const teams = await getDraftTeams(tenant.id, division);
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <Link href="/dashboard/draft" style={{ fontSize: 12 }}>
        &larr; All divisions
      </Link>
      <h1 style={{ fontSize: 20, color: "var(--accent)" }}>{division} Draft</h1>

      {(!session || session.status === "done") && (
        <NoActiveSession tenantId={tenant.id} division={division} lastSession={session?.status === "done" ? session : null} />
      )}
      {session && session.status === "setup" && (
        <SetupPhase tenantId={tenant.id} division={division} session={session} teams={teams} />
      )}
      {session && session.status === "draft" && (
        <DraftPhase tenantId={tenant.id} division={division} session={session} teamsById={teamsById} />
      )}
    </main>
  );
}

function NoActiveSession({ tenantId, division, lastSession }: { tenantId: string; division: string; lastSession: { id: string } | null }) {
  return (
    <div style={{ marginTop: 20 }}>
      {lastSession ? (
        <>
          <p style={{ fontSize: 13, opacity: 0.8 }}>The most recent draft for this division is finalized.</p>
          <Link href={`/dashboard/draft/${encodeURIComponent(division)}/results/${lastSession.id}`} style={{ fontSize: 13 }}>
            View results &rarr;
          </Link>
        </>
      ) : (
        <p style={{ fontSize: 13, opacity: 0.8 }}>No draft has been run for this division yet.</p>
      )}
      <form action={createDraftSession.bind(null, tenantId, division)} style={{ marginTop: 12 }}>
        <button type="submit" style={{ padding: "8px 16px", cursor: "pointer", background: "var(--accent)", border: "none", borderRadius: 6 }}>
          {lastSession ? "Start New Draft" : "Start Draft Setup"}
        </button>
      </form>
    </div>
  );
}

async function SetupPhase({
  tenantId,
  division,
  session,
  teams,
}: {
  tenantId: string;
  division: string;
  session: { id: string; team_order: string[] };
  teams: { id: string; name: string }[];
}) {
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const orderedTeamIds = (session.team_order || []).filter((id) => teamsById[id]);
  const draftable = await getRankedDraftablePlayers(tenantId, division);
  const picks = await getSessionPicks(session.id);
  const preAssigns = picks.filter((p) => p.type === "pre");

  return (
    <div style={{ marginTop: 20 }}>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15 }}>Teams &amp; draft order ({orderedTeamIds.length})</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {orderedTeamIds.map((teamId, i) => (
            <div key={teamId} style={{ display: "flex", alignItems: "center", gap: 8, background: "#1118", padding: "6px 10px", borderRadius: 6 }}>
              <span style={{ width: 20, fontSize: 12, opacity: 0.6 }}>#{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{teamsById[teamId]?.name}</span>
              <form action={moveTeam.bind(null, tenantId, division, session.id, teamId, "up")}>
                <button type="submit" disabled={i === 0} style={{ cursor: "pointer" }}>
                  &uarr;
                </button>
              </form>
              <form action={moveTeam.bind(null, tenantId, division, session.id, teamId, "down")}>
                <button type="submit" disabled={i === orderedTeamIds.length - 1} style={{ cursor: "pointer" }}>
                  &darr;
                </button>
              </form>
            </div>
          ))}
        </div>
        <form action={addTeam.bind(null, tenantId, division, session.id)} style={{ display: "flex", gap: 8 }}>
          <input name="name" placeholder="New team name..." required style={{ padding: 6, flex: 1 }} />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            Add team
          </button>
        </form>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15 }}>Upload roster (CSV)</h2>
        <form action={uploadRosterCsv.bind(null, tenantId, division)} style={{ display: "flex", gap: 8 }}>
          <input name="roster" type="file" accept=".csv,.txt" required />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            Import
          </button>
        </form>
        <p style={{ fontSize: 11, opacity: 0.6 }}>First Name / Last Name columns required; Division and Birthdate optional. Duplicates (same name) are skipped.</p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15 }}>
          Pre-draft assignments ({preAssigns.length}) &middot; {draftable.length} still in pool
        </h2>
        <p style={{ fontSize: 11, opacity: 0.6 }}>Assign a player straight to a team before the draft starts — they're removed from the draft pool.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {preAssigns.map((pk) => (
            <div key={pk.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1 }}>
                {pk.player.first_name} {pk.player.last_name} &rarr; {teamsById[pk.team_id]?.name}
              </span>
              <form action={removePreAssign.bind(null, tenantId, division, session.id, pk.player_id)}>
                <button type="submit" style={{ cursor: "pointer" }}>
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
        {draftable.length > 0 && orderedTeamIds.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 12 }}>Assign a player...</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
              {draftable.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ flex: 1 }}>
                    {p.first_name} {p.last_name} ({fmtAge(p.birthdate)})
                  </span>
                  {orderedTeamIds.map((teamId) => (
                    <form key={teamId} action={addPreAssign.bind(null, tenantId, division, session.id, p.id, teamId)}>
                      <button type="submit" style={{ cursor: "pointer", fontSize: 11 }}>
                        &rarr; {teamsById[teamId]?.name}
                      </button>
                    </form>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section>
        <form action={startDraft.bind(null, tenantId, division, session.id)} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 260 }}>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="timerEnabled" /> Timer per pick
          </label>
          <label style={{ fontSize: 12 }}>
            Seconds per pick
            <input name="timerSeconds" type="number" defaultValue={60} min={10} style={{ display: "block", width: "100%", padding: 6, marginTop: 4 }} />
          </label>
          <button
            type="submit"
            disabled={orderedTeamIds.length < 2}
            style={{ padding: 10, cursor: "pointer", background: "var(--accent)", border: "none", borderRadius: 6 }}
          >
            Start Draft &rarr;
          </button>
          {orderedTeamIds.length < 2 && <p style={{ fontSize: 11, opacity: 0.6 }}>Add at least 2 teams first.</p>}
        </form>
      </section>
    </div>
  );
}

async function DraftPhase({
  tenantId,
  division,
  session,
  teamsById,
}: {
  tenantId: string;
  division: string;
  session: { id: string; current_pick: number; draft_order: { pickNum: number; round: number; teamId: string }[] };
  teamsById: Record<string, { id: string; name: string }>;
}) {
  const order = session.draft_order || [];
  const isDone = session.current_pick >= order.length;
  const curSlot = order[session.current_pick];
  const [draftable, picks] = await Promise.all([getRankedDraftablePlayers(tenantId, division), getSessionPicks(session.id)]);

  const rosterByTeam: Record<string, typeof picks> = {};
  for (const pk of picks) (rosterByTeam[pk.team_id] ??= []).push(pk);

  return (
    <div style={{ marginTop: 20 }}>
      {!isDone ? (
        <div style={{ background: "#1118", padding: 14, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase" }}>On the clock</div>
          <div style={{ fontSize: 22, color: "var(--accent)" }}>{teamsById[curSlot.teamId]?.name}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Round {curSlot.round} &middot; Pick {curSlot.pickNum} of {order.length}
          </div>
        </div>
      ) : (
        <div style={{ background: "#1118", padding: 14, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 16, color: "var(--accent)" }}>All picks complete</div>
          <form action={finalizeDraft.bind(null, tenantId, division, session.id)} style={{ marginTop: 8 }}>
            <button type="submit" style={{ padding: "8px 16px", cursor: "pointer", background: "var(--accent)", border: "none", borderRadius: 6 }}>
              Finalize Draft
            </button>
          </form>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <form action={undoLastPick.bind(null, tenantId, division, session.id)}>
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            &#8630; Undo last pick
          </button>
        </form>
        {!isDone && (
          <>
            <form action={skipPick.bind(null, tenantId, division, session.id)}>
              <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
                Skip pick
              </button>
            </form>
            <form action={autoCompleteRest.bind(null, tenantId, division, session.id)}>
              <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
                Auto-draft rest
              </button>
            </form>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section>
          <h2 style={{ fontSize: 14 }}>Player pool ({draftable.length})</h2>
          <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {draftable.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, background: "#1118", padding: "6px 10px", borderRadius: 6 }}>
                <span style={{ flex: 1 }}>
                  {p.first_name} {p.last_name} ({fmtAge(p.birthdate)}){p.avgRating != null && ` ★${p.avgRating.toFixed(1)}`}
                </span>
                {!isDone && (
                  <form action={draftPlayer.bind(null, tenantId, division, session.id, p.id)}>
                    <button type="submit" style={{ cursor: "pointer", background: "var(--accent)", border: "none", borderRadius: 4, padding: "4px 8px" }}>
                      Draft
                    </button>
                  </form>
                )}
                {!isDone && (
                  <details style={{ display: "inline" }}>
                    <summary style={{ cursor: "pointer", fontSize: 11 }}>Assign to...</summary>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {Object.values(teamsById).map((t) => (
                        <form key={t.id} action={adminAssign.bind(null, tenantId, division, session.id, p.id, t.id)}>
                          <button type="submit" style={{ fontSize: 10, cursor: "pointer" }}>
                            {t.name}
                          </button>
                        </form>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
            {draftable.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>No players left in the pool.</p>}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14 }}>Team rosters</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
            {Object.values(teamsById).map((t) => {
              const roster = rosterByTeam[t.id] || [];
              return (
                <div key={t.id} style={{ background: "#1118", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 13, color: "var(--accent)", marginBottom: 4 }}>
                    {t.name} ({roster.length})
                  </div>
                  {roster.map((pk) => (
                    <div key={pk.id} style={{ fontSize: 11, opacity: 0.85 }}>
                      {pk.type === "pre" ? "⭐" : pk.type === "admin" ? "🛡️" : `R${pk.round}`} {pk.player.first_name} {pk.player.last_name}
                    </div>
                  ))}
                  {roster.length === 0 && <div style={{ fontSize: 11, opacity: 0.5 }}>No players yet</div>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
