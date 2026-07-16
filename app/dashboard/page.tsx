import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin, PLATFORM_SUBDOMAIN } from "@/lib/tenant";
import { logout } from "../login/actions";
import { addPlayer } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subdomain = await currentSubdomain();
  const platformAdmin = await isPlatformAdmin(user.id);

  if (subdomain === PLATFORM_SUBDOMAIN) {
    if (!platformAdmin) {
      return <Shell title="Platform Admin" email={user.email}>You are not a platform admin.</Shell>;
    }
    const { data: tenants } = await supabase.from("tenants").select("id, name, subdomain").order("name");
    return (
      <Shell title="Platform Admin — All Tenants" email={user.email}>
        <ul>
          {(tenants || []).map((t) => (
            <li key={t.id}>
              {t.name} — <code>{t.subdomain}</code>
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  if (!subdomain) {
    return (
      <Shell title="EBSC Ratings" email={user.email}>
        No league subdomain in this URL. Visit your league at{" "}
        <code>yourleague.{process.env.NEXT_PUBLIC_ROOT_DOMAIN}</code>.
      </Shell>
    );
  }

  // tenants_select RLS means this returns null both when the subdomain
  // doesn't exist AND when this specific query happened to race some other
  // failure — but since tenants_select_public makes the row itself always
  // readable now, "not found" here really does mean "no such league."
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) {
    return (
      <Shell title="EBSC Ratings" email={user.email}>
        No league found at this address.
      </Shell>
    );
  }

  const membershipRole = await getMembershipRole(tenant.id, user.id);
  if (!membershipRole && !platformAdmin) {
    return (
      <Shell title={tenant.name} email={user.email}>
        You don&apos;t have a role in this league.
      </Shell>
    );
  }

  const role = platformAdmin ? "platform_admin" : membershipRole!;

  // Every one of these three queries is scoped entirely by RLS — this page
  // issues the same players/select for every role and simply gets back a
  // different set of rows depending on who's asking.
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, division")
    .order("last_name");

  // Template-driven, not hardcoded: whatever divisions/custom fields this
  // tenant has configured under /dashboard/settings is what shows up here.
  const [{ data: divisions }, { data: playerFields }] =
    role === "league_admin"
      ? await Promise.all([
          supabase.from("divisions").select("name").eq("tenant_id", tenant.id).order("name"),
          supabase.from("player_fields").select("name").eq("tenant_id", tenant.id).order("name"),
        ])
      : [{ data: [] }, { data: [] }];

  return (
    <Shell title={tenant.name} email={user.email} role={role}>
      {role === "league_admin" && (
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/dashboard/settings" style={{ fontSize: 12 }}>
            League settings &amp; branding
          </Link>
          <Link href="/dashboard/draft" style={{ fontSize: 12 }}>
            Draft
          </Link>
        </div>
      )}

      <h2 style={{ fontSize: 15, marginTop: 24 }}>Players ({(players || []).length})</h2>
      <ul>
        {(players || []).map((p) => (
          <li key={p.id}>
            {p.first_name} {p.last_name}
            {p.division ? ` — ${p.division}` : ""}
          </li>
        ))}
      </ul>

      {role === "league_admin" && (
        <form
          action={addPlayer.bind(null, tenant.id)}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, maxWidth: 320 }}
        >
          <input name="firstName" placeholder="First name" required style={{ padding: 6 }} />
          <input name="lastName" placeholder="Last name" required style={{ padding: 6 }} />
          {(divisions || []).length > 0 && (
            <select name="division" defaultValue="" style={{ padding: 6 }}>
              <option value="">No division</option>
              {(divisions || []).map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {(playerFields || []).map((f) => (
            <input key={f.name} name={`custom_${f.name}`} placeholder={f.name} style={{ padding: 6 }} />
          ))}
          <button
            type="submit"
            style={{ padding: "6px 12px", cursor: "pointer", background: "var(--accent)", border: "none", borderRadius: 6 }}
          >
            Add player
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({
  title,
  email,
  role,
  children,
}: {
  title: string;
  email?: string;
  role?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0, color: "var(--accent)" }}>{title}</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {email}
            {role ? ` · ${role}` : ""}
          </div>
        </div>
        <form action={logout}>
          <button type="submit" style={{ fontSize: 12, cursor: "pointer" }}>
            Sign out
          </button>
        </form>
      </div>
      {children}
    </main>
  );
}
