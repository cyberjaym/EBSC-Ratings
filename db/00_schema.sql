-- EBSC Ratings SaaS — core schema
-- Portable to Supabase as-is: Supabase provides a real `auth` schema with
-- auth.uid()/auth.jwt(); 01_local_auth_stub.sql recreates the same functions
-- for local Postgres so these policies can be built and tested without a
-- live Supabase project, then applied unchanged once one exists.

create extension if not exists "pgcrypto";

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain text not null unique,
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors auth.users; one row per platform user regardless of how many
-- tenants they belong to.
create table profiles (
  id uuid primary key, -- = auth.users.id
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- Global, not tenant-scoped. Deliberately a separate table (not a role
-- value in memberships) so platform-admin status can never be granted by
-- a league_admin acting within their own tenant.
create table platform_admins (
  user_id uuid primary key references profiles(id) on delete cascade
);

create type member_role as enum ('league_admin', 'coach', 'parent');

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, role)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  division text,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  division text,
  team_id uuid references teams(id) on delete set null,
  birthdate date,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Which coach can see which team(s). A coach may be on multiple teams.
create table coach_teams (
  user_id uuid not null references profiles(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  primary key (user_id, team_id)
);

-- Which parent can see which player(s) (their child/children).
create table parent_players (
  user_id uuid not null references profiles(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  primary key (user_id, player_id)
);

create table divisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (tenant_id, name)
);

create table skill_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (tenant_id, name)
);

create table player_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (tenant_id, name)
);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  overall int check (overall between 1 and 5),
  rated_by uuid not null references profiles(id),
  skills jsonb not null default '{}'::jsonb,
  notes text,
  ts timestamptz not null default now(),
  edited_at timestamptz
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade, -- null for platform-level actions
  actor_user_id uuid not null references profiles(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

create index on memberships (user_id);
create index on memberships (tenant_id);
create index on players (tenant_id);
create index on ratings (tenant_id);
create index on ratings (player_id);
create index on audit_log (tenant_id);
