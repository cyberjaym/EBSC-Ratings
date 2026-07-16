"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { parseCsv, autoMapHeaders } from "@/lib/draft";
import { computeDraftOrder, getRankedDraftablePlayers } from "@/lib/draft-data";

function revalidate(division: string) {
  revalidatePath(`/dashboard/draft/${encodeURIComponent(division)}`);
}

async function requireSession(tenantId: string, sessionId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("draft_sessions").select("*").eq("id", sessionId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Draft session not found, or you don't have access to it");
  return { supabase, session: data };
}

export async function addTeam(tenantId: string, division: string, sessionId: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Team name is required");
  const { supabase, session } = await requireSession(tenantId, sessionId);

  const { data: team, error } = await supabase.from("teams").insert({ tenant_id: tenantId, name, division }).select().single();
  if (error) throw error;

  const teamOrder = [...(session.team_order || []), team.id];
  await supabase.from("draft_sessions").update({ team_order: teamOrder }).eq("id", sessionId);

  await logAudit(supabase, tenantId, "ADD_TEAM", { name, division });
  revalidate(division);
}

// Backs both drag-and-drop (client computes the full new order on drop)
// and simple up/down controls (client computes a one-step swap) — either
// way this just persists whatever order the client already settled on.
export async function setTeamOrder(tenantId: string, division: string, sessionId: string, order: string[]) {
  const { supabase } = await requireSession(tenantId, sessionId);
  const { error } = await supabase.from("draft_sessions").update({ team_order: order }).eq("id", sessionId);
  if (error) throw error;
  revalidate(division);
}

export async function addPreAssign(tenantId: string, division: string, sessionId: string, playerId: string, teamId: string) {
  const { supabase } = await requireSession(tenantId, sessionId);

  const { error: pickError } = await supabase
    .from("draft_picks")
    .insert({ tenant_id: tenantId, draft_session_id: sessionId, player_id: playerId, team_id: teamId, type: "pre" });
  if (pickError) throw pickError;

  const { error: playerError } = await supabase.from("players").update({ team_id: teamId }).eq("id", playerId);
  if (playerError) throw playerError;

  await logAudit(supabase, tenantId, "PRE_ASSIGN", { playerId, teamId, division });
  revalidate(division);
}

export async function removePreAssign(tenantId: string, division: string, sessionId: string, playerId: string) {
  const { supabase } = await requireSession(tenantId, sessionId);

  const { error: delError } = await supabase
    .from("draft_picks")
    .delete()
    .eq("draft_session_id", sessionId)
    .eq("player_id", playerId)
    .eq("type", "pre");
  if (delError) throw delError;

  const { error: playerError } = await supabase.from("players").update({ team_id: null }).eq("id", playerId);
  if (playerError) throw playerError;

  await logAudit(supabase, tenantId, "REMOVE_PRE_ASSIGN", { playerId, division });
  revalidate(division);
}

export async function startDraft(tenantId: string, division: string, sessionId: string, formData: FormData) {
  const { supabase, session } = await requireSession(tenantId, sessionId);
  const timerEnabled = formData.get("timerEnabled") === "on";
  const timerSeconds = Number(formData.get("timerSeconds")) || 60;

  const teamOrder: string[] = session.team_order || [];
  if (teamOrder.length < 2) throw new Error("Add at least 2 teams before starting the draft");

  const draftable = await getRankedDraftablePlayers(tenantId, division);
  const draftOrder = computeDraftOrder(teamOrder, draftable.length);

  const { error } = await supabase
    .from("draft_sessions")
    .update({ status: "draft", draft_order: draftOrder, current_pick: 0, timer_enabled: timerEnabled, timer_seconds: timerSeconds })
    .eq("id", sessionId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "DRAFT_STARTED", { division, teams: teamOrder.length, draftablePlayers: draftable.length });
  revalidate(division);
}

export async function draftPlayer(tenantId: string, division: string, sessionId: string, playerId: string) {
  const { supabase, session } = await requireSession(tenantId, sessionId);
  if (session.status !== "draft") throw new Error("Draft is not in progress");
  const order = session.draft_order as { pickNum: number; round: number; teamId: string }[];
  if (session.current_pick >= order.length) throw new Error("Draft has no picks remaining");
  const slot = order[session.current_pick];

  const { error: pickError } = await supabase.from("draft_picks").insert({
    tenant_id: tenantId, draft_session_id: sessionId, player_id: playerId, team_id: slot.teamId,
    pick_num: slot.pickNum, round: slot.round, type: "draft",
  });
  if (pickError) throw pickError;

  const { error: playerError } = await supabase.from("players").update({ team_id: slot.teamId }).eq("id", playerId);
  if (playerError) throw playerError;

  const { error: sessError } = await supabase.from("draft_sessions").update({ current_pick: session.current_pick + 1 }).eq("id", sessionId);
  if (sessError) throw sessError;

  await logAudit(supabase, tenantId, "DRAFT_PICK", { playerId, teamId: slot.teamId, round: slot.round, pickNum: slot.pickNum });
  revalidate(division);
}

export async function adminAssign(tenantId: string, division: string, sessionId: string, playerId: string, teamId: string) {
  const { supabase } = await requireSession(tenantId, sessionId);

  const { error: pickError } = await supabase.from("draft_picks").insert({
    tenant_id: tenantId, draft_session_id: sessionId, player_id: playerId, team_id: teamId, type: "admin",
  });
  if (pickError) throw pickError;

  const { error: playerError } = await supabase.from("players").update({ team_id: teamId }).eq("id", playerId);
  if (playerError) throw playerError;

  await logAudit(supabase, tenantId, "ADMIN_ASSIGN", { playerId, teamId, division });
  revalidate(division);
}

export async function undoLastPick(tenantId: string, division: string, sessionId: string) {
  const { supabase, session } = await requireSession(tenantId, sessionId);

  const { data: last } = await supabase
    .from("draft_picks")
    .select("*")
    .eq("draft_session_id", sessionId)
    .in("type", ["draft", "admin"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return;

  const { error: delError } = await supabase.from("draft_picks").delete().eq("id", last.id);
  if (delError) throw delError;

  const { error: playerError } = await supabase.from("players").update({ team_id: null }).eq("id", last.player_id);
  if (playerError) throw playerError;

  if (last.type === "draft") {
    await supabase.from("draft_sessions").update({ current_pick: Math.max(0, session.current_pick - 1) }).eq("id", sessionId);
  }

  await logAudit(supabase, tenantId, "UNDO_PICK", { playerId: last.player_id, type: last.type });
  revalidate(division);
}

export async function skipPick(tenantId: string, division: string, sessionId: string) {
  const { supabase, session } = await requireSession(tenantId, sessionId);
  if (session.current_pick >= (session.draft_order as unknown[]).length) return;

  const { error } = await supabase.from("draft_sessions").update({ current_pick: session.current_pick + 1 }).eq("id", sessionId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "SKIP_PICK", { division, pickIndex: session.current_pick });
  revalidate(division);
}

export async function autoCompleteRest(tenantId: string, division: string, sessionId: string) {
  const { supabase, session } = await requireSession(tenantId, sessionId);
  const order = session.draft_order as { pickNum: number; round: number; teamId: string }[];
  let currentPick = session.current_pick;
  let autoPicked = 0;

  while (currentPick < order.length) {
    const draftable = await getRankedDraftablePlayers(tenantId, division);
    if (!draftable.length) { currentPick = order.length; break; }
    const slot = order[currentPick];
    const player = draftable[0];

    const { error: pickError } = await supabase.from("draft_picks").insert({
      tenant_id: tenantId, draft_session_id: sessionId, player_id: player.id, team_id: slot.teamId,
      pick_num: slot.pickNum, round: slot.round, type: "draft",
    });
    if (pickError) throw pickError;
    await supabase.from("players").update({ team_id: slot.teamId }).eq("id", player.id);
    currentPick++;
    autoPicked++;
  }

  await supabase.from("draft_sessions").update({ current_pick: currentPick }).eq("id", sessionId);
  await logAudit(supabase, tenantId, "AUTO_COMPLETE_DRAFT", { division, autoPicked });
  revalidate(division);
}

export async function finalizeDraft(tenantId: string, division: string, sessionId: string) {
  const { supabase } = await requireSession(tenantId, sessionId);
  const { error } = await supabase.from("draft_sessions").update({ status: "done" }).eq("id", sessionId);
  if (error) throw error;
  await logAudit(supabase, tenantId, "DRAFT_FINALIZED", { division });
  revalidate(division);
}

export async function uploadRosterCsv(tenantId: string, division: string, formData: FormData) {
  const file = formData.get("roster") as File;
  if (!file || file.size === 0) throw new Error("No file selected");
  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  const map = autoMapHeaders(headers);
  if (!map.firstName || !map.lastName) throw new Error("Couldn't find First Name / Last Name columns in that file");

  const supabase = await createClient();
  const { data: existing } = await supabase.from("players").select("first_name, last_name").eq("tenant_id", tenantId).eq("division", division);
  const existingKeys = new Set((existing || []).map((p) => `${p.first_name.toLowerCase()}|${p.last_name.toLowerCase()}`));

  const toInsert = [];
  for (const row of rows) {
    const firstName = row[map.firstName]?.trim();
    const lastName = row[map.lastName]?.trim();
    if (!firstName || !lastName) continue;
    const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    toInsert.push({
      tenant_id: tenantId,
      division,
      first_name: firstName,
      last_name: lastName,
      birthdate: map.birthdate ? row[map.birthdate]?.trim() || null : null,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from("players").insert(toInsert);
    if (error) throw error;
  }

  await logAudit(supabase, tenantId, "ROSTER_CSV_IMPORT", { division, imported: toInsert.length, skipped: rows.length - toInsert.length });
  revalidate(division);
}
