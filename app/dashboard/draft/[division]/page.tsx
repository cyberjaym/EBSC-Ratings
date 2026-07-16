import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getLatestDraftSession, getDraftTeams, getRankedDraftablePlayers, getSessionPicks } from "@/lib/draft-data";
import { createDraftSession } from "../actions";
import {
  addTeam,
  setTeamOrder,
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
import SetupClient from "./SetupClient";
import LiveDraftClient from "./LiveDraftClient";
import styles from "../draft.module.css";

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
    <div className={styles.theme}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/dashboard/draft" className={styles.backLink}>
          &larr; All divisions
        </Link>
        <h1 className={styles.heading} style={{ fontSize: 26, margin: "4px 0 16px" }}>
          {division} Draft
        </h1>

        {(!session || session.status === "done") && (
          <NoActiveSession tenantId={tenant.id} division={division} lastSession={session?.status === "done" ? session : null} />
        )}
        {session && session.status === "setup" && (
          <SetupPhase tenantId={tenant.id} division={division} session={session} teams={teams} />
        )}
        {session && session.status === "draft" && (
          <DraftPhase tenantId={tenant.id} division={division} session={session} teams={teams} teamsById={teamsById} />
        )}
      </div>
    </div>
  );
}

function NoActiveSession({ tenantId, division, lastSession }: { tenantId: string; division: string; lastSession: { id: string } | null }) {
  return (
    <div>
      {lastSession ? (
        <>
          <p className={styles.muted}>The most recent draft for this division is finalized.</p>
          <Link href={`/dashboard/draft/${encodeURIComponent(division)}/results/${lastSession.id}`} style={{ fontSize: 13, color: "var(--gold)" }}>
            View results &rarr;
          </Link>
        </>
      ) : (
        <p className={styles.muted}>No draft has been run for this division yet.</p>
      )}
      <form action={createDraftSession.bind(null, tenantId, division)} style={{ marginTop: 12 }}>
        <button type="submit" className={`${styles.btn} ${styles.btnGold}`}>
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
  const orderedTeams = (session.team_order || []).map((id) => teamsById[id]).filter(Boolean);
  const draftable = await getRankedDraftablePlayers(tenantId, division);
  const picks = await getSessionPicks(session.id);
  const preAssigns = picks.filter((p) => p.type === "pre");

  return (
    <div>
      <div className={styles.grid2} style={{ marginBottom: 20 }}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Add team</div>
          <form action={addTeam.bind(null, tenantId, division, session.id)} className={styles.row}>
            <input name="name" className={styles.input} placeholder="Team name..." required />
            <button type="submit" className={`${styles.btn} ${styles.btnOutline}`}>
              Add
            </button>
          </form>
        </section>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Upload roster (CSV)</div>
          <form action={uploadRosterCsv.bind(null, tenantId, division)} className={styles.row}>
            <input name="roster" type="file" accept=".csv,.txt" required className={styles.input} style={{ padding: 4 }} />
            <button type="submit" className={`${styles.btn} ${styles.btnOutline}`}>
              Import
            </button>
          </form>
          <p className={styles.muted}>First/Last Name columns required. Duplicates skipped.</p>
        </section>
      </div>

      <div className={styles.card}>
        <SetupClient
          orderedTeams={orderedTeams}
          draftable={draftable}
          preAssigns={preAssigns}
          setTeamOrderAction={setTeamOrder.bind(null, tenantId, division, session.id)}
          addPreAssignAction={addPreAssign.bind(null, tenantId, division, session.id)}
          removePreAssignAction={removePreAssign.bind(null, tenantId, division, session.id)}
        />
      </div>

      <section className={styles.card} style={{ marginTop: 20 }}>
        <form action={startDraft.bind(null, tenantId, division, session.id)} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 260 }}>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="timerEnabled" /> Timer per pick
          </label>
          <label style={{ fontSize: 12 }}>
            Seconds per pick
            <input name="timerSeconds" type="number" defaultValue={60} min={10} className={styles.input} style={{ marginTop: 4 }} />
          </label>
          <button type="submit" disabled={orderedTeams.length < 2} className={`${styles.btn} ${styles.btnGold}`}>
            Start Draft &rarr;
          </button>
          {orderedTeams.length < 2 && <p className={styles.muted}>Add at least 2 teams first.</p>}
        </form>
      </section>
    </div>
  );
}

async function DraftPhase({
  tenantId,
  division,
  session,
  teams,
}: {
  tenantId: string;
  division: string;
  session: { id: string; current_pick: number; draft_order: { pickNum: number; round: number; teamId: string }[] };
  teams: { id: string; name: string }[];
  teamsById: Record<string, { id: string; name: string }>;
}) {
  const [draftable, picks] = await Promise.all([getRankedDraftablePlayers(tenantId, division), getSessionPicks(session.id)]);

  return (
    <LiveDraftClient
      session={session}
      teams={teams}
      draftable={draftable}
      picks={picks}
      draftPlayerAction={draftPlayer.bind(null, tenantId, division, session.id)}
      undoAction={undoLastPick.bind(null, tenantId, division, session.id)}
      skipAction={skipPick.bind(null, tenantId, division, session.id)}
      autoCompleteAction={autoCompleteRest.bind(null, tenantId, division, session.id)}
      finalizeAction={finalizeDraft.bind(null, tenantId, division, session.id)}
      adminAssignAction={adminAssign.bind(null, tenantId, division, session.id)}
    />
  );
}
