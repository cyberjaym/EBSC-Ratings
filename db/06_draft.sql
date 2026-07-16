-- Draft tool: one session per division per draft run. Drafting a player
-- writes to players.team_id directly (the real roster) rather than a
-- separate draft-only data model — a finished draft IS the roster.
--
-- team_order is the snake-draft coach order, chosen from this tenant's
-- real teams (scoped to the division being drafted). draft_order is the
-- full precomputed pick schedule once the draft starts:
-- [{pickNum, round, teamId}, ...].
create table draft_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  division text not null,
  status text not null default 'setup' check (status in ('setup', 'draft', 'done')),
  team_order uuid[] not null default '{}',
  timer_enabled boolean not null default false,
  timer_seconds int not null default 60,
  draft_order jsonb not null default '[]'::jsonb,
  current_pick int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per assignment: pre-draft assignment, a live snake pick, or an
-- out-of-order admin assign. pick_num/round are null for 'pre' and 'admin'.
create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  draft_session_id uuid not null references draft_sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  pick_num int,
  round int,
  type text not null check (type in ('pre', 'draft', 'admin')),
  created_at timestamptz not null default now(),
  unique (draft_session_id, player_id)
);

create index on draft_sessions (tenant_id);
create index on draft_picks (tenant_id);
create index on draft_picks (draft_session_id);
create index on draft_picks (player_id);

alter table draft_sessions enable row level security;
create policy draft_sessions_all on draft_sessions for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);

alter table draft_picks enable row level security;
create policy draft_picks_all on draft_picks for all using (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
) with check (
  app.is_platform_admin() or app.role_in_tenant(tenant_id) = 'league_admin'
);
