import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const PLATFORM_SUBDOMAIN = "admin";

export async function currentSubdomain(): Promise<string> {
  const hdrs = await headers();
  return hdrs.get("x-tenant-subdomain") || "";
}

// Public by design (see db/04_theming.sql, tenants_select_public) — a
// league's name/logo/colors need to render on its own login page before
// anyone has signed in. Returns null for the reserved "admin" subdomain,
// no subdomain at all, or a subdomain with no matching tenant.
export async function getTenantBySubdomain(subdomain: string) {
  if (!subdomain || subdomain === PLATFORM_SUBDOMAIN) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, subdomain, theme")
    .eq("subdomain", subdomain)
    .maybeSingle();
  return data;
}

// Membership row for this tenant is only visible to the user themselves,
// their tenant's league_admin, or a platform admin (memberships_select in
// db/02_policies.sql) — a non-member querying their own user_id just gets
// 0 rows back, so this naturally returns undefined for "no access" too.
export async function getMembershipRole(tenantId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role as string | undefined;
}

// platform_admins_select only returns a row at all if the caller actually
// is one — a non-admin querying their own user_id gets 0 rows, which reads
// the same as "not a platform admin" without any extra branching.
export async function isPlatformAdmin(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}
