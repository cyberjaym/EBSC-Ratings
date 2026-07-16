"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { DEFAULT_THEME, resolveTheme } from "@/lib/theme";

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
  // fetches the current theme to merge into, and returns nothing if RLS
  // would reject the caller anyway.
  const { data, error } = await supabase.from("tenants").select("id, theme").eq("id", tenantId).maybeSingle();
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
