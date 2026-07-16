"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../draft.module.css";

interface Team { id: string; name: string }
interface DraftablePlayer { id: string; first_name: string; last_name: string; birthdate: string | null; avgRating: number | null }
interface PreAssign { id: string; player_id: string; team_id: string; player: { first_name: string; last_name: string } }

function fmtAge(birthdate: string | null): string {
  if (!birthdate) return "?";
  const years = (Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 3600 * 1000);
  return `${Math.round(years)}y`;
}

export default function SetupClient({
  orderedTeams,
  draftable,
  preAssigns,
  setTeamOrderAction,
  addPreAssignAction,
  removePreAssignAction,
}: {
  orderedTeams: Team[];
  draftable: DraftablePlayer[];
  preAssigns: PreAssign[];
  setTeamOrderAction: (order: string[]) => Promise<void>;
  addPreAssignAction: (playerId: string, teamId: string) => Promise<void>;
  removePreAssignAction: (playerId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function handleDrop(toIndex: number) {
    const fromIndex = dragIndex.current;
    dragIndex.current = null;
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === toIndex) return;
    const ids = orderedTeams.map((t) => t.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    run(() => setTeamOrderAction(ids));
  }

  function moveOneStep(index: number, direction: -1 | 1) {
    const j = index + direction;
    if (j < 0 || j >= orderedTeams.length) return;
    const ids = orderedTeams.map((t) => t.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => setTeamOrderAction(ids));
  }

  const filtered = draftable.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <section style={{ marginBottom: 24 }}>
        <div className={styles.cardTitle}>Teams &amp; draft order ({orderedTeams.length})</div>
        <p className={styles.muted}>Drag to reorder — team #1 picks first in round 1.</p>
        <div className={styles.stack} style={{ marginTop: 8 }}>
          {orderedTeams.map((t, i) => (
            <div
              key={t.id}
              className={`${styles.teamRow} ${dragOverIndex === i ? styles.playerRowSelected : ""}`}
              draggable
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
              onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
            >
              <span aria-hidden style={{ opacity: 0.5, cursor: "grab" }}>⠿</span>
              <span className={styles.teamOrder}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{t.name}</span>
              <button type="button" className={styles.btn} onClick={() => moveOneStep(i, -1)} disabled={i === 0} title="Move up">
                &uarr;
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => moveOneStep(i, 1)}
                disabled={i === orderedTeams.length - 1}
                title="Move down"
              >
                &darr;
              </button>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div className={styles.cardTitle}>
          Pre-draft assignments ({preAssigns.length}) &middot; {draftable.length} in pool
        </div>
        <p className={styles.muted}>Select a player, then click a team to assign them before the draft starts.</p>

        <div className={styles.stack} style={{ marginBottom: 12 }}>
          {preAssigns.map((pk) => (
            <div key={pk.id} className={styles.row} style={{ fontSize: 12 }}>
              <span style={{ flex: 1 }}>
                {pk.player.first_name} {pk.player.last_name} &rarr; {orderedTeams.find((t) => t.id === pk.team_id)?.name}
              </span>
              <button type="button" className={styles.btn} onClick={() => run(() => removePreAssignAction(pk.player_id))}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <input
          className={styles.input}
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div className={styles.scroll} style={{ maxHeight: 260 }}>
          <div className={styles.stack}>
            {filtered.map((p) => (
              <div
                key={p.id}
                className={`${styles.playerRow} ${selectedPlayerId === p.id ? styles.playerRowSelected : ""}`}
                onClick={() => setSelectedPlayerId(p.id === selectedPlayerId ? null : p.id)}
              >
                <div style={{ flex: 1 }}>
                  <div className={styles.playerName}>
                    {p.first_name} {p.last_name}
                  </div>
                  <div className={styles.playerMeta}>{fmtAge(p.birthdate)}</div>
                </div>
                {p.avgRating != null && <span className={styles.ratingBadge}>★{p.avgRating.toFixed(1)}</span>}
                {selectedPlayerId === p.id && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                    {orderedTeams.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={styles.btn}
                        style={{ fontSize: 10 }}
                        onClick={() => { run(() => addPreAssignAction(p.id, t.id)); setSelectedPlayerId(null); }}
                      >
                        &rarr; {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && <p className={styles.muted}>No players match.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
