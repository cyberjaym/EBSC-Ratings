"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../draft.module.css";

interface Team { id: string; name: string }
interface DraftablePlayer { id: string; first_name: string; last_name: string; birthdate: string | null; avgRating: number | null }
interface DraftOrderSlot { pickNum: number; round: number; teamId: string }
interface PickRow {
  id: string; player_id: string; team_id: string; pick_num: number | null; round: number | null;
  type: "pre" | "draft" | "admin"; player: { first_name: string; last_name: string };
}

function fmtAge(birthdate: string | null): string {
  if (!birthdate) return "?";
  const years = (Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 3600 * 1000);
  return `${Math.round(years)}y`;
}

export default function LiveDraftClient({
  session,
  teams,
  draftable,
  picks,
  draftPlayerAction,
  undoAction,
  skipAction,
  autoCompleteAction,
  finalizeAction,
  adminAssignAction,
}: {
  session: { current_pick: number; draft_order: DraftOrderSlot[] };
  teams: Team[];
  draftable: DraftablePlayer[];
  picks: PickRow[];
  draftPlayerAction: (playerId: string) => Promise<void>;
  undoAction: () => Promise<void>;
  skipAction: () => Promise<void>;
  autoCompleteAction: () => Promise<void>;
  finalizeAction: () => Promise<void>;
  adminAssignAction: (playerId: string, teamId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"rank" | "name">("rank");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignPickerFor, setAssignPickerFor] = useState<string | null>(null);

  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const order = session.draft_order;
  const isDone = session.current_pick >= order.length;
  const curSlot = order[session.current_pick];

  const rosterByTeam = useMemo(() => {
    const map: Record<string, PickRow[]> = {};
    for (const pk of picks) (map[pk.team_id] ??= []).push(pk);
    return map;
  }, [picks]);

  const visible = useMemo(() => {
    let list = draftable;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q));
    }
    if (sort === "name") list = [...list].sort((a, b) => a.last_name.localeCompare(b.last_name));
    return list;
  }, [draftable, search, sort]);

  const selected = draftable.find((p) => p.id === selectedId) || null;

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      setSelectedId(null);
      setAssignPickerFor(null);
      router.refresh();
    });
  }

  return (
    <div>
      {!isDone ? (
        <div className={styles.clockCard} style={{ marginBottom: 16 }}>
          <div className={styles.clockLabel}>On the clock</div>
          <div className={styles.clockTeam}>{teamsById[curSlot.teamId]?.name}</div>
          <div className={styles.clockMeta}>
            Round {curSlot.round} &middot; Pick {curSlot.pickNum} of {order.length}
          </div>
        </div>
      ) : (
        <div className={styles.card} style={{ marginBottom: 16, textAlign: "center" }}>
          <div className={styles.heading} style={{ fontSize: 20 }}>
            🏆 All picks complete
          </div>
          <button type="button" className={`${styles.btn} ${styles.btnGold}`} style={{ marginTop: 8 }} onClick={() => run(finalizeAction)}>
            Finalize Draft
          </button>
        </div>
      )}

      <div className={styles.row} style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" className={`${styles.btn} ${styles.btnOutline}`} disabled={isPending} onClick={() => run(undoAction)}>
          &#8630; Undo last pick
        </button>
        {!isDone && (
          <>
            <button type="button" className={`${styles.btn} ${styles.btnOutline}`} disabled={isPending} onClick={() => run(skipAction)}>
              Skip pick
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnOutline}`} disabled={isPending} onClick={() => run(autoCompleteAction)}>
              ⚡ Auto-draft rest
            </button>
          </>
        )}
        {isPending && <span className={styles.muted}>Saving...</span>}
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Player pool ({visible.length})</div>
          <div className={styles.row} style={{ marginBottom: 8 }}>
            <input
              className={styles.input}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className={styles.select} style={{ width: 110 }} value={sort} onChange={(e) => setSort(e.target.value as "rank" | "name")}>
              <option value="rank">By rank</option>
              <option value="name">By name</option>
            </select>
          </div>

          {selected && (
            <div className={styles.card} style={{ marginBottom: 8, background: "var(--card3)" }}>
              <div className={styles.heading} style={{ fontSize: 16 }}>
                {selected.first_name} {selected.last_name}
              </div>
              <div className={styles.muted}>
                {fmtAge(selected.birthdate)} {selected.avgRating != null && `· ★${selected.avgRating.toFixed(1)}`}
              </div>
            </div>
          )}

          <div className={styles.scroll}>
            <div className={styles.stack}>
              {visible.map((p) => (
                <div
                  key={p.id}
                  className={`${styles.playerRow} ${selectedId === p.id ? styles.playerRowSelected : ""}`}
                  onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                >
                  <span className={styles.playerRank}>{fmtAge(p.birthdate)}</span>
                  <div style={{ flex: 1 }}>
                    <div className={styles.playerName}>
                      {p.first_name} {p.last_name}
                    </div>
                  </div>
                  {p.avgRating != null && <span className={styles.ratingBadge}>★{p.avgRating.toFixed(1)}</span>}
                </div>
              ))}
              {visible.length === 0 && <p className={styles.muted}>No players match.</p>}
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGold}`}
              disabled={!selected || isDone || isPending}
              onClick={() => selected && run(() => draftPlayerAction(selected.id))}
              style={{ flex: 1 }}
            >
              ⚽ Draft Selected
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPurple}`}
              disabled={!selected || isDone}
              onClick={() => selected && setAssignPickerFor(assignPickerFor === selected.id ? null : selected.id)}
              title="Admin assign — out of draft order"
            >
              🛡️
            </button>
          </div>
          {selected && assignPickerFor === selected.id && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  style={{ fontSize: 10 }}
                  onClick={() => run(() => adminAssignAction(selected.id, t.id))}
                >
                  &rarr; {t.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Team rosters</div>
          <div className={styles.scroll}>
            <div className={styles.stack}>
              {teams.map((t) => {
                const roster = rosterByTeam[t.id] || [];
                const isOnClock = !isDone && curSlot.teamId === t.id;
                return (
                  <div key={t.id} className={styles.rosterCard} style={isOnClock ? { outline: "2px solid var(--gold)" } : undefined}>
                    <div className={styles.rosterHeader}>
                      <div className={styles.rosterName}>
                        {t.name}
                        {isOnClock ? " 🟡" : ""}
                      </div>
                      <div className={styles.rosterMeta}>{roster.length} players</div>
                    </div>
                    {roster.map((pk) => (
                      <div key={pk.id} className={styles.rosterPlayerRow}>
                        <span className={styles.mono} style={{ fontSize: 9, opacity: 0.7 }}>
                          {pk.type === "pre" ? "⭐" : pk.type === "admin" ? "🛡️" : `R${pk.round}`}
                        </span>
                        <span>
                          {pk.player.first_name} {pk.player.last_name}
                        </span>
                      </div>
                    ))}
                    {roster.length === 0 && <div className={styles.muted} style={{ padding: "6px 12px" }}>No players yet</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
