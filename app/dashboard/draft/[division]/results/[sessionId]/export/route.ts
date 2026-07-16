import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { getDraftTeams, getSessionPicks } from "@/lib/draft-data";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_request: Request, { params }: { params: Promise<{ division: string; sessionId: string }> }) {
  const { division: divisionParam, sessionId } = await params;
  const division = decodeURIComponent(divisionParam);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) return new NextResponse("Not found", { status: 404 });

  const [role, platformAdmin] = await Promise.all([getMembershipRole(tenant.id, user.id), isPlatformAdmin(user.id)]);
  if (role !== "league_admin" && !platformAdmin) return new NextResponse("Forbidden", { status: 403 });

  // Same RLS-backed access check as everywhere else: if this session isn't
  // this tenant's, the select just returns nothing.
  const { data: session } = await supabase.from("draft_sessions").select("id").eq("id", sessionId).eq("tenant_id", tenant.id).maybeSingle();
  if (!session) return new NextResponse("Not found", { status: 404 });

  const teams = await getDraftTeams(tenant.id, division);
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const picks = await getSessionPicks(sessionId);

  const rows = [["Team", "First Name", "Last Name", "Birthdate", "Type", "Round", "Pick"]];
  for (const pk of picks) {
    rows.push([
      teamsById[pk.team_id] || "",
      pk.player.first_name,
      pk.player.last_name,
      pk.player.birthdate || "",
      pk.type,
      String(pk.round ?? ""),
      String(pk.pick_num ?? ""),
    ]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${division.replace(/[^a-zA-Z0-9]/g, "_")}_draft_results.csv"`,
    },
  });
}
