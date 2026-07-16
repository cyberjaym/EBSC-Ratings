import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { addPlayer } from "./actions";

const PLATFORM_SUBDOMAIN = "admin";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hdrs = await headers();
  const subdomain = hdrs.get("x-tenant-subdomain") || "";

  // Relies on RLS, not application logic, to decide what "platform admin"
  // sees: platform_admins_select only returns a row at all if the caller
  // actually is one (see db/02_policies.sql).
  const { data: selfAsPlatformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isPlatformAdmin = !!selfAsPlatformAdmin;

  if (subdomain === PLATFORM_SUBDOMAIN) {
    if (!isPlatformAdmin) {
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

  // tenants_select RLS (is_platform_admin() or is_member(id)) means this
  // returns null both when the subdomain doesn't exist AND when it exists
  // but this user isn't a member — the two cases are indistinguishable by
  // design, so no subdomain enumeration is possible.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("subdomain", subdomain)
    .maybeSingle();

  if (!tenant) {
    return (
      <Shell title="EBSC Ratings" email={user.email}>
        No league found at this address, or you don&apos;t have access to it.
      </Shell>
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership && !isPlatformAdmin) {
    return (
      <Shell title={tenant.name} email={user.email}>
        You don&apos;t have a role in this league.
      </Shell>
    );
  }

  const role = isPlatformAdmin ? "platform_admin" : membership!.role;

  // Every one of these three queries is scoped entirely by RLS — this page
  // issues the same players/select for every role and simply gets back a
  // different set of rows depending on who's asking.
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, division")
    .order("last_name");

  return (
    <Shell title={tenant.name} email={user.email} role={role}>
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
        <form action={addPlayer.bind(null, tenant.id)} style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input name="firstName" placeholder="First name" required style={{ padding: 6 }} />
          <input name="lastName" placeholder="Last name" required style={{ padding: 6 }} />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
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
          <h1 style={{ fontSize: 18, margin: 0 }}>{title}</h1>
          <div style={{ fontSize: 12, color: "#666" }}>
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
