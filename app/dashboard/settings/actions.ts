"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { DEFAULT_THEME, resolveTheme } from "@/lib/theme";
import { resolveSettings } from "@/lib/settings";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Client-side <input accept> and the storage bucket's own file_size_limit/
// allowed_mime_types (db/04_theming.sql) both constrain this too — this is
// defense in depth, not the only check, since a client can send anything.
function assertValidImage(file: File) {
  if (file.size === 0) throw new Error("No file selected");
  if (file.size > MAX_BYTES) throw new Error("Image must be 2MB or smaller");
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Image must be PNG, JPEG, or WebP");
}

async function getTenantRowForWrite(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  // tenants_update RLS (league_admin of this tenant, or platform admin) is
  // what actually enforces who may call these actions — this select just
  // fetches the current theme/settings to merge into, and returns nothing
  // if RLS would reject the caller anyway.
  const { data, error } = await supabase.from("tenants").select("id, theme, settings").eq("id", tenantId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("League not found, or you don't have access to it");
  return data;
}

export async function updateBranding(tenantId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const accentColor = String(formData.get("accentColor") || DEFAULT_THEME.accentColor);
  const backgroundColor = String(formData.get("backgroundColor") || DEFAULT_THEME.backgroundColor);
  if (!name) throw new Error("League name is required");

  const tenant = await getTenantRowForWrite(supabase, tenantId);
  const theme = { ...resolveTheme(tenant.theme), accentColor, backgroundColor };

  const { error } = await supabase.from("tenants").update({ name, theme }).eq("id", tenantId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "UPDATE_BRANDING", { name, accentColor, backgroundColor });
  revalidatePath("/", "layout");
}

async function uploadTenantImage(tenantId: string, file: File, filenamePrefix: string) {
  assertValidImage(file);
  const supabase = await createClient();
  const tenant = await getTenantRowForWrite(supabase, tenantId);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${tenantId}/${filenamePrefix}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("tenant-assets").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: publicUrl } = supabase.storage.from("tenant-assets").getPublicUrl(path);
  return { supabase, tenant, publicUrl: publicUrl.publicUrl };
}

export async function updateLogo(tenantId: string, formData: FormData) {
  const file = formData.get("logo") as File;
  const { supabase, tenant, publicUrl } = await uploadTenantImage(tenantId, file, "logo");
  const theme = { ...resolveTheme(tenant.theme), logoUrl: publicUrl };

  const { error } = await supabase.from("tenants").update({ theme }).eq("id", tenantId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "UPDATE_LOGO", { logoUrl: publicUrl });
  revalidatePath("/", "layout");
}

export async function updateBackground(tenantId: string, formData: FormData) {
  const file = formData.get("background") as File;
  const { supabase, tenant, publicUrl } = await uploadTenantImage(tenantId, file, "background");
  const theme = { ...resolveTheme(tenant.theme), backgroundImageUrl: publicUrl };

  const { error } = await supabase.from("tenants").update({ theme }).eq("id", tenantId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "UPDATE_BACKGROUND", { backgroundImageUrl: publicUrl });
  revalidatePath("/", "layout");
}

// ── Templates: divisions / skill fields / custom player fields ──
// Each of these three tables (db/00_schema.sql) is identical in shape
// (tenant_id, name, sort_order) and identically RLS-scoped (db/02_policies.sql:
// league_admin of tenant_id, or platform admin) — one generic pair of
// actions covers all three rather than tripling near-identical code.
type NamedFieldTable = "divisions" | "skill_fields" | "player_fields";

async function addNamedField(table: NamedFieldTable, action: string, tenantId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name is required");

  const { error } = await supabase.from(table).insert({ tenant_id: tenantId, name });
  if (error) throw error;

  await logAudit(supabase, tenantId, action, { name });
  revalidatePath("/dashboard/settings");
}

async function removeNamedField(table: NamedFieldTable, action: string, tenantId: string, id: string) {
  const supabase = await createClient();
  const { data: row } = await supabase.from(table).select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from(table).delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw error;

  await logAudit(supabase, tenantId, action, { name: row?.name, id });
  revalidatePath("/dashboard/settings");
}

export async function addDivision(tenantId: string, formData: FormData) {
  await addNamedField("divisions", "ADD_DIVISION", tenantId, formData);
}
export async function removeDivision(tenantId: string, id: string) {
  await removeNamedField("divisions", "REMOVE_DIVISION", tenantId, id);
}
export async function addSkillField(tenantId: string, formData: FormData) {
  await addNamedField("skill_fields", "ADD_SKILL_FIELD", tenantId, formData);
}
export async function removeSkillField(tenantId: string, id: string) {
  await removeNamedField("skill_fields", "REMOVE_SKILL_FIELD", tenantId, id);
}
export async function addPlayerField(tenantId: string, formData: FormData) {
  await addNamedField("player_fields", "ADD_PLAYER_FIELD", tenantId, formData);
}
export async function removePlayerField(tenantId: string, id: string) {
  await removeNamedField("player_fields", "REMOVE_PLAYER_FIELD", tenantId, id);
}

// ── Templates: comms policy doc + schedule defaults ──
// Prep for the Comms Copilot / Schedule Maker feature modules — no reader
// yet, just tenant-scoped config storage and an editing UI.
export async function updatePolicyDoc(tenantId: string, formData: FormData) {
  const supabase = await createClient();
  const tenant = await getTenantRowForWrite(supabase, tenantId);
  const policyDoc = String(formData.get("policyDoc") || "");
  const settings = { ...resolveSettings(tenant.settings), policyDoc };

  const { error } = await supabase.from("tenants").update({ settings }).eq("id", tenantId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "UPDATE_POLICY_DOC", { length: policyDoc.length });
  revalidatePath("/dashboard/settings");
}

export async function updateScheduleDefaults(tenantId: string, formData: FormData) {
  const supabase = await createClient();
  const tenant = await getTenantRowForWrite(supabase, tenantId);
  const scheduleDefaults = {
    gamesPerWeek: Number(formData.get("gamesPerWeek")) || 1,
    gameLengthMinutes: Number(formData.get("gameLengthMinutes")) || 60,
    restDaysBetweenGames: Number(formData.get("restDaysBetweenGames")) || 0,
  };
  const settings = { ...resolveSettings(tenant.settings), scheduleDefaults };

  const { error } = await supabase.from("tenants").update({ settings }).eq("id", tenantId);
  if (error) throw error;

  await logAudit(supabase, tenantId, "UPDATE_SCHEDULE_DEFAULTS", scheduleDefaults);
  revalidatePath("/dashboard/settings");
}
