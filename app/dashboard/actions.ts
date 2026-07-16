"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

// Deliberately relies on RLS, not an app-level role check, to decide
// whether this succeeds — if the caller isn't a league_admin of tenantId,
// players_write's WITH CHECK rejects the insert regardless of what this
// function assumes about who's allowed to call it.
export async function addPlayer(tenantId: string, formData: FormData) {
  const supabase = await createClient();
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const division = String(formData.get("division") || "").trim();
  if (!firstName || !lastName) throw new Error("First and last name are required");

  // Custom player fields are template-driven, not hardcoded — whatever
  // this tenant has configured under player_fields (see /dashboard/settings)
  // becomes an input here, named "custom_<field name>", and gets collected
  // into players.custom_data rather than requiring a schema/code change.
  const { data: playerFields } = await supabase.from("player_fields").select("name").eq("tenant_id", tenantId);
  const customData: Record<string, string> = {};
  for (const f of playerFields || []) {
    const value = String(formData.get(`custom_${f.name}`) || "").trim();
    if (value) customData[f.name] = value;
  }

  const { error } = await supabase
    .from("players")
    .insert({ tenant_id: tenantId, first_name: firstName, last_name: lastName, division: division || null, custom_data: customData });
  if (error) throw error;

  await logAudit(supabase, tenantId, "ADD_PLAYER", { firstName, lastName, division, customData });
  revalidatePath("/dashboard");
}
