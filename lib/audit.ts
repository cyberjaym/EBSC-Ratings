import type { SupabaseClient } from "@supabase/supabase-js";

// Every admin-level mutation should call this. Uses the caller's own
// authenticated client, so the audit_log RLS policy (is_platform_admin() or
// is_member(tenant_id)) applies exactly as it does to any other write —
// there's no separate trusted path that could log actions for a tenant the
// actor doesn't belong to.
export async function logAudit(
  supabase: SupabaseClient,
  tenantId: string,
  action: string,
  detail: Record<string, unknown> = {}
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("logAudit called without an authenticated user");

  const { error } = await supabase
    .from("audit_log")
    .insert({ tenant_id: tenantId, actor_user_id: user.id, action, detail });
  if (error) throw error;
}
