import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentSubdomain, getTenantBySubdomain, getMembershipRole, isPlatformAdmin } from "@/lib/tenant";
import { resolveTheme } from "@/lib/theme";
import { resolveSettings } from "@/lib/settings";
import {
  updateBranding,
  updateLogo,
  updateBackground,
  addDivision,
  removeDivision,
  addSkillField,
  removeSkillField,
  addPlayerField,
  removePlayerField,
  updatePolicyDoc,
  updateScheduleDefaults,
} from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const subdomain = await currentSubdomain();
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) redirect("/dashboard");

  const [role, platformAdmin] = await Promise.all([
    getMembershipRole(tenant.id, user.id),
    isPlatformAdmin(user.id),
  ]);
  if (role !== "league_admin" && !platformAdmin) redirect("/dashboard");

  const theme = resolveTheme(tenant.theme);
  const settings = resolveSettings(tenant.settings);

  const [{ data: divisions }, { data: skillFields }, { data: playerFields }] = await Promise.all([
    supabase.from("divisions").select("id, name").eq("tenant_id", tenant.id).order("name"),
    supabase.from("skill_fields").select("id, name").eq("tenant_id", tenant.id).order("name"),
    supabase.from("player_fields").select("id, name").eq("tenant_id", tenant.id).order("name"),
  ]);

  return (
    <main style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <Link href="/dashboard" style={{ fontSize: 12 }}>
        &larr; Back to dashboard
      </Link>
      <h1 style={{ fontSize: 18, color: "var(--accent)" }}>League settings &amp; branding</h1>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Changes here apply immediately — no rebuild or redeploy, for you or any other league on this platform.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Name &amp; colors</h2>
        <form action={updateBranding.bind(null, tenant.id)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12 }}>
            League name (shown in the header)
            <input name="name" defaultValue={tenant.name} required style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Accent color
            <input name="accentColor" type="color" defaultValue={theme.accentColor} style={{ display: "block", marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Background color
            <input name="backgroundColor" type="color" defaultValue={theme.backgroundColor} style={{ display: "block", marginTop: 4 }} />
          </label>
          <button type="submit" style={{ padding: 8, cursor: "pointer" }}>
            Save
          </button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Logo</h2>
        {theme.logoUrl && <img src={theme.logoUrl} alt="Current logo" style={{ maxHeight: 60, marginBottom: 8 }} />}
        <form action={updateLogo.bind(null, tenant.id)} style={{ display: "flex", gap: 8 }}>
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            Upload
          </button>
        </form>
        <p style={{ fontSize: 11, opacity: 0.6 }}>PNG, JPEG, or WebP, 2MB max. Used as the favicon and PWA home-screen icon.</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Background image</h2>
        {theme.backgroundImageUrl && (
          <img src={theme.backgroundImageUrl} alt="Current background" style={{ maxHeight: 60, marginBottom: 8 }} />
        )}
        <form action={updateBackground.bind(null, tenant.id)} style={{ display: "flex", gap: 8 }}>
          <input name="background" type="file" accept="image/png,image/jpeg,image/webp" required />
          <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
            Upload
          </button>
        </form>
        <p style={{ fontSize: 11, opacity: 0.6 }}>PNG, JPEG, or WebP, 2MB max.</p>
      </section>

      <h1 style={{ fontSize: 18, color: "var(--accent)", marginTop: 40 }}>Templates</h1>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        What this league collects and uses — the core app reads these rather than anything hardcoded per league.
      </p>

      <NamedFieldSection
        title="Divisions"
        hint="Age/division groups players are assigned to."
        tenantId={tenant.id}
        items={divisions || []}
        addAction={addDivision}
        removeAction={removeDivision}
      />
      <NamedFieldSection
        title="Skill rating fields"
        hint="Sub-ratings collected when evaluating a player, alongside the overall rating."
        tenantId={tenant.id}
        items={skillFields || []}
        addAction={addSkillField}
        removeAction={removeSkillField}
      />
      <NamedFieldSection
        title="Custom player fields"
        hint="Extra fields collected per player (e.g. Jersey Number, Parent Email)."
        tenantId={tenant.id}
        items={playerFields || []}
        addAction={addPlayerField}
        removeAction={removePlayerField}
      />

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14 }}>Comms policy doc</h2>
        <p style={{ fontSize: 11, opacity: 0.6 }}>
          Paste your league&apos;s policy text here — this is what the Parent Comms Copilot will ground its replies
          in once that module ships. Not used anywhere yet.
        </p>
        <form action={updatePolicyDoc.bind(null, tenant.id)}>
          <textarea
            name="policyDoc"
            defaultValue={settings.policyDoc}
            rows={6}
            style={{ width: "100%", padding: 8, fontFamily: "inherit", fontSize: 13 }}
          />
          <button type="submit" style={{ padding: 8, cursor: "pointer", marginTop: 8 }}>
            Save
          </button>
        </form>
      </section>

      <section style={{ marginTop: 24, marginBottom: 40 }}>
        <h2 style={{ fontSize: 14 }}>Default schedule rules</h2>
        <p style={{ fontSize: 11, opacity: 0.6 }}>
          Starting defaults for the Schedule Maker once that module ships. Not used anywhere yet.
        </p>
        <form action={updateScheduleDefaults.bind(null, tenant.id)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12 }}>
            Games per week
            <input
              name="gamesPerWeek"
              type="number"
              min={1}
              defaultValue={settings.scheduleDefaults.gamesPerWeek}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Game length (minutes)
            <input
              name="gameLengthMinutes"
              type="number"
              min={1}
              defaultValue={settings.scheduleDefaults.gameLengthMinutes}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Rest days between games
            <input
              name="restDaysBetweenGames"
              type="number"
              min={0}
              defaultValue={settings.scheduleDefaults.restDaysBetweenGames}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <button type="submit" style={{ padding: 8, cursor: "pointer" }}>
            Save
          </button>
        </form>
      </section>
    </main>
  );
}

function NamedFieldSection({
  title,
  hint,
  tenantId,
  items,
  addAction,
  removeAction,
}: {
  title: string;
  hint: string;
  tenantId: string;
  items: { id: string; name: string }[];
  addAction: (tenantId: string, formData: FormData) => Promise<void>;
  removeAction: (tenantId: string, id: string) => Promise<void>;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14 }}>{title}</h2>
      <p style={{ fontSize: 11, opacity: 0.6 }}>{hint}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {items.map((item) => (
          <form key={item.id} action={removeAction.bind(null, tenantId, item.id)} style={{ display: "inline" }}>
            <button
              type="submit"
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 20,
                border: "1px solid #444",
                background: "none",
                color: "inherit",
                cursor: "pointer",
              }}
              title="Remove"
            >
              {item.name} &times;
            </button>
          </form>
        ))}
        {items.length === 0 && <span style={{ fontSize: 12, opacity: 0.5 }}>None yet</span>}
      </div>
      <form action={addAction.bind(null, tenantId)} style={{ display: "flex", gap: 8 }}>
        <input name="name" placeholder="Add new..." required style={{ padding: 6, flex: 1 }} />
        <button type="submit" style={{ padding: "6px 12px", cursor: "pointer" }}>
          Add
        </button>
      </form>
    </section>
  );
}
