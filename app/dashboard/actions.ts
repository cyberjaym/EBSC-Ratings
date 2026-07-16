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
  if (!firstName || !lastName) throw new Error("First and last name are required");

  const { error } = await supabase
    .from("players")
    .insert({ tenant_id: tenantId, first_name: firstName, last_name: lastName });
  if (error) throw error;

  await logAudit(supabase, tenantId, "ADD_PLAYER", { firstName, lastName });
  revalidatePath("/dashboard");
}
