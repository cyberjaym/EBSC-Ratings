-- Deterministic seed: two fully independent test tenants (A, B), each with
-- their own league_admin, coach, and parent, plus one platform admin who
-- spans both. Run as the postgres superuser (bypasses RLS by design —
-- seeding is a trusted, out-of-band operation, same as a Supabase service
-- role key would be).

truncate table audit_log, ratings, parent_players, coach_teams, players, teams,
  divisions, skill_fields, player_fields, memberships, platform_admins, profiles, tenants cascade;

-- Tenants
insert into tenants (id, name, subdomain) values
  ('00000000-0000-0000-0000-00000000000a', 'Tenant A Youth Soccer', 'tenanta'),
  ('00000000-0000-0000-0000-00000000000b', 'Tenant B Youth Soccer', 'tenantb');

-- Users (profiles)
insert into profiles (id, email, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'platform.admin@example.com', 'Platform Admin'),
  ('10000000-0000-0000-0000-00000000000a', 'admin.a@example.com', 'Admin A'),
  ('10000000-0000-0000-0000-00000000000b', 'admin.b@example.com', 'Admin B'),
  ('10000000-0000-0000-0000-0000000000ca', 'coach.a@example.com', 'Coach A'),
  ('10000000-0000-0000-0000-0000000000cb', 'coach.b@example.com', 'Coach B'),
  ('10000000-0000-0000-0000-0000000000da', 'parent.a@example.com', 'Parent A'),
  ('10000000-0000-0000-0000-0000000000db', 'parent.b@example.com', 'Parent B');

insert into platform_admins (user_id) values ('10000000-0000-0000-0000-000000000001');

insert into memberships (user_id, tenant_id, role) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'league_admin'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'league_admin'),
  ('10000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-00000000000a', 'coach'),
  ('10000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000000b', 'coach'),
  ('10000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-00000000000a', 'parent'),
  ('10000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-00000000000b', 'parent');

-- Teams
insert into teams (id, tenant_id, name, division) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A Sharks', 'U9'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'B Sharks', 'U9');

insert into coach_teams (user_id, team_id, tenant_id) values
  ('10000000-0000-0000-0000-0000000000ca', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000cb', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b');

-- Players
insert into players (id, tenant_id, first_name, last_name, division, team_id) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Alice', 'Anderson', 'U9', '20000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bob', 'Baker', 'U9', '20000000-0000-0000-0000-00000000000b');

insert into parent_players (user_id, player_id, tenant_id) values
  ('10000000-0000-0000-0000-0000000000da', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000db', '30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b');

-- Ratings
insert into ratings (id, tenant_id, player_id, overall, rated_by, notes) values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 2, '10000000-0000-0000-0000-0000000000ca', 'Tenant A private note'),
  ('40000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000b', 3, '10000000-0000-0000-0000-0000000000cb', 'Tenant B private note');

-- Divisions / audit log
insert into divisions (tenant_id, name, sort_order) values
  ('00000000-0000-0000-0000-00000000000a', 'U9', 0),
  ('00000000-0000-0000-0000-00000000000b', 'U9', 0);

insert into audit_log (tenant_id, actor_user_id, action, detail) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'ADD_PLAYER', '{"name":"Alice Anderson"}'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'ADD_PLAYER', '{"name":"Bob Baker"}');
