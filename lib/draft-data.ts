import { createClient } from "@/lib/supabase/server";
import { buildSnakeOrder, type DraftOrderSlot } from "@/lib/draft";

// The most recent session for this division. A 'done' session is treated
// like "no active draft" by callers — old completed sessions stay in
// history untouched rather than being silently reused.
export async function getLatestDraftSession(tenantId: string, division: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("draft_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("division", division)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getCompletedSessions(tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("draft_sessions")
    .select("id, division, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "done")
    .order("created_at", { ascending: false });
  return data || [];
}

export async function getDraftTeams(tenantId: string, division: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name, created_at")
    .eq("tenant_id", tenantId)
    .eq("division", division)
    .order("created_at");
  return data || [];
}

// Undrafted players in this division, ranked the same way the original
// tool ranked its pool: average rating ascending (1 = best, unrated last),
// then older first, then last name — used both for display and as the
// "best available" pick in auto-complete.
export async function getRankedDraftablePlayers(tenantId: string, division: string) {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, birthdate")
    .eq("tenant_id", tenantId)
    .eq("division", division)
    .is("team_id", null);

  const ids = (players || []).map((p) => p.id);
  const { data: ratings } = ids.length
    ? await supabase.from("ratings").select("player_id, overall").in("player_id", ids)
    : { data: [] as { player_id: string; overall: number | null }[] };

  const byPlayer: Record<string, number[]> = {};
  for (const r of ratings || []) {
    if (r.overall == null) continue;
    (byPlayer[r.player_id] ??= []).push(r.overall);
  }

  return (players || [])
    .map((p) => {
      const list = byPlayer[p.id];
      const avgRating = list && list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
      return { ...p, avgRating };
    })
    .sort((a, b) => {
      const ar = a.avgRating ?? 99, br = b.avgRating ?? 99;
      if (ar !== br) return ar - br;
      const aAge = a.birthdate ? new Date(a.birthdate).getTime() : 0;
      const bAge = b.birthdate ? new Date(b.birthdate).getTime() : 0;
      if (aAge !== bAge) return aAge - bAge; // smaller timestamp = older = drafted first
      return a.last_name.localeCompare(b.last_name);
    });
}

export interface DraftPickRow {
  id: string;
  player_id: string;
  team_id: string;
  pick_num: number | null;
  round: number | null;
  type: "pre" | "draft" | "admin";
  created_at: string;
  player: { first_name: string; last_name: string; birthdate: string | null };
}

export async function getSessionPicks(sessionId: string): Promise<DraftPickRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("draft_picks")
    .select("id, player_id, team_id, pick_num, round, type, created_at, player:players(first_name, last_name, birthdate)")
    .eq("draft_session_id", sessionId)
    .order("created_at");
  // Supabase's nested-select typing returns an array for the relation even
  // for a to-one join; normalize it to a single object for callers.
  return (data || []).map((row: any) => ({ ...row, player: Array.isArray(row.player) ? row.player[0] : row.player }));
}

export function computeDraftOrder(teamOrder: string[], draftableCount: number): DraftOrderSlot[] {
  const rounds = teamOrder.length ? Math.ceil(draftableCount / teamOrder.length) : 0;
  return buildSnakeOrder(teamOrder, rounds);
}
