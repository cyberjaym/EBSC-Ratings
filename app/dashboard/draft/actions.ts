"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function createDraftSession(tenantId: string, division: string) {
  const supabase = await createClient();
  const { data: teams } = await supabase.from("teams").select("id").eq("tenant_id", tenantId).eq("division", division).order("created_at");
  const { error } = await supabase.from("draft_sessions").insert({
    tenant_id: tenantId,
    division,
    status: "setup",
    team_order: (teams || []).map((t) => t.id),
  });
  if (error) throw error;
  await logAudit(supabase, tenantId, "DRAFT_SESSION_CREATED", { division });
  revalidatePath(`/dashboard/draft/${encodeURIComponent(division)}`);
}
