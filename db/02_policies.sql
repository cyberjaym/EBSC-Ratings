-- Row Level Security: the actual tenant-isolation enforcement.
-- Every policy below scopes by tenant via helper functions in the `app`
-- schema. The helper functions are SECURITY DEFINER so they can read
-- memberships/coach_teams/parent_players without those tables' own RLS
-- policies recursing into themselves — this is the standard, documented
-- pattern for this problem (both here and on real Supabase).

create schema if not exists app;

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function app.role_in_tenant(t uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from memberships where user_id = auth.uid() and tenant_id = t limit 1
$$;

create or replace function app.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships where user_id = auth.uid() and tenant_id = t)
$$;

create or replace function app.coach_team_ids(t uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select team_id from coach_teams where user_id = auth.uid() and tenant_id = t
$$;

create or replace function app.parent_player_ids(t uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select player_id from parent_players where user_id = auth.uid() and tenant_id = t
$$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ── tenants ──────────────────────────────────────────────────────────
alter table tenants enable row level security;

create policy tenants_select on tenants for select using (
  app.is_platform_admin() or app.is_member(id)
);
create policy tenants_update on tenants for update using (
  app.is_platform_admin() or app.role_in_tenant(id) = 'league_admin'
);
create policy tenants_insert on tenants for insert with check (app.is_platform_admin());
create policy tenants_delete on tenants for delete using (app.is_platform_admin());

-- ── profiles ─────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy profiles_select on profiles for select using (
  id = auth.uid()
  or app.is_platform_admin()
  or exists (
    select 1 from memberships m
    where m.user_id = profiles.id and app.role_in_tenant(m.tenant_id) = 'league_admin'
  )
);
create policy profiles_insert on profiles for insert with check (
  id = auth.uid() or app.is_platform_admin()
);
create policy profiles_update on profiles for update using (
  id = auth.uid() or app.is_platform_admin()
);

-- ── platform_admins ──────────────────────────────────────────────────
alter table platform_admins enable row level security;

create policy platform_admins_select on platform_admins for select using (app.is_platform_admin());
create policy platform_admins_insert on platform_admins for insert with check (app.is_platform_admin());
create policy platform_admins_delete on platform_admins for delete using (app.is_platform_admin());

-- ── memberships ──────────────────────────────────────────────────────
alter table memberships enable row level security;

create policy memberships_select on memberships for select using (
  app.is_platform_admin()
  or user_id = auth.uid()
  or app.role_in_tenant(tenant_id) = 'league_admin'
);
create policy memberships_insert on memberships for insert with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);
create policy memberships_update on memberships for update using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);
create policy memberships_delete on memberships for delete using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

-- ── teams ────────────────────────────────────────────────────────────
alter table teams enable row level security;

create policy teams_select on teams for select using (
  app.is_platform_admin() or app.is_member(tenant_id)
);
create policy teams_write on teams for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

-- ── coach_teams / parent_players ─────────────────────────────────────
alter table coach_teams enable row level security;
alter table parent_players enable row level security;

create policy coach_teams_select on coach_teams for select using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin' or user_id = auth.uid()
);
create policy coach_teams_write on coach_teams for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

create policy parent_players_select on parent_players for select using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin' or user_id = auth.uid()
);
create policy parent_players_write on parent_players for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

-- ── divisions / skill_fields / player_fields ────────────────────────
alter table divisions enable row level security;
alter table skill_fields enable row level security;
alter table player_fields enable row level security;

create policy divisions_select on divisions for select using (app.is_platform_admin() or app.is_member(tenant_id));
create policy divisions_write on divisions for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

create policy skill_fields_select on skill_fields for select using (app.is_platform_admin() or app.is_member(tenant_id));
create policy skill_fields_write on skill_fields for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

create policy player_fields_select on player_fields for select using (app.is_platform_admin() or app.is_member(tenant_id));
create policy player_fields_write on player_fields for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

-- ── players ──────────────────────────────────────────────────────────
alter table players enable row level security;

create policy players_select on players for select using (
  app.is_platform_admin()
  or app.role_in_tenant(tenant_id) = 'league_admin'
  or (app.role_in_tenant(tenant_id) = 'coach' and team_id in (select app.coach_team_ids(tenant_id)))
  or (app.role_in_tenant(tenant_id) = 'parent' and id in (select app.parent_player_ids(tenant_id)))
);
create policy players_write on players for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

-- ── ratings ──────────────────────────────────────────────────────────
alter table ratings enable row level security;

create policy ratings_select on ratings for select using (
  app.is_platform_admin()
  or app.role_in_tenant(tenant_id) = 'league_admin'
  or (
    app.role_in_tenant(tenant_id) = 'coach'
    and player_id in (select id from players p where p.tenant_id = ratings.tenant_id and p.team_id in (select app.coach_team_ids(ratings.tenant_id)))
  )
  or (
    app.role_in_tenant(tenant_id) = 'parent'
    and player_id in (select app.parent_player_ids(tenant_id))
  )
);
create policy ratings_insert on ratings for insert with check (
  app.is_platform_admin()
  or app.role_in_tenant(tenant_id) = 'league_admin'
  or (
    app.role_in_tenant(tenant_id) = 'coach'
    and player_id in (select id from players p where p.tenant_id = ratings.tenant_id and p.team_id in (select app.coach_team_ids(ratings.tenant_id)))
  )
);
create policy ratings_update on ratings for update using (
  app.is_platform_admin()
  or app.role_in_tenant(tenant_id) = 'league_admin'
  or (app.role_in_tenant(tenant_id) = 'coach' and rated_by = auth.uid())
);
create policy ratings_delete on ratings for delete using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

-- ── audit_log (append-only: no update/delete policy = default deny) ─
alter table audit_log enable row level security;

create policy audit_log_select on audit_log for select using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);
create policy audit_log_insert on audit_log for insert with check (
  app.is_platform_admin() or app.is_member(tenant_id)
);
