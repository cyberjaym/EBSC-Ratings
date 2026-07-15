-- Local stand-in for Supabase's `auth` schema.
--
-- On real Supabase, PostgREST sets the `request.jwt.claims` GUC from the
-- verified JWT on every request, and auth.uid()/auth.jwt() read it. We
-- reproduce that exact mechanism here so RLS policies written against
-- auth.uid() behave identically locally and in production — nothing in
-- 02_policies.sql needs to change when this app points at a real project.
--
-- Non-superuser roles only see what request.jwt.claims was SET LOCAL to
-- within their own transaction; there is no way for one session to read
-- another's claims.

create schema if not exists auth;

create or replace function auth.jwt() returns jsonb as $$
  -- current_setting on an unset-this-session custom GUC returns '' (empty
  -- string), not NULL, once the name has been touched by any SET LOCAL in
  -- the session — coalesce alone doesn't catch that, so nullif first. This
  -- mirrors the real auth.jwt() implementation on Supabase.
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$ language sql stable;

create or replace function auth.uid() returns uuid as $$
  select nullif(auth.jwt()->>'sub', '')::uuid
$$ language sql stable;

-- Roles PostgREST normally uses. `authenticated` is what the app connects
-- as; RLS is enforced against it. `anon` exists for completeness but the
-- app grants it nothing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
