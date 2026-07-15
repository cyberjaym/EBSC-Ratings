# Foundation: schema, RLS, and the tenant-isolation proof

This directory holds the multi-tenant data model and Row Level Security
policies. They're written to run unchanged on real Supabase — locally they
run against plain Postgres plus `01_local_auth_stub.sql`, which reproduces
Supabase's `auth.uid()`/`auth.jwt()` mechanism (reading the
`request.jwt.claims` GUC that PostgREST normally sets per-request) so
nothing in `02_policies.sql` needs to change when this points at a real
Supabase project.

## Run it locally

```
createdb ebsc_test
psql -d ebsc_test -f db/00_schema.sql
psql -d ebsc_test -f db/01_local_auth_stub.sql
psql -d ebsc_test -f db/02_policies.sql
psql -d ebsc_test -f test/seed.sql
npm install
node test/tenant-isolation.test.mjs
```

## What the test proves

`test/tenant-isolation.test.mjs` seeds two independent test tenants (A, B),
each with a league_admin, a coach, and a parent, then — using the same
Postgres role and `auth.uid()` mechanism the real app will use — asserts
that:

- A league_admin's SELECT/UPDATE/DELETE against the *other* tenant's rows
  always affects zero rows, even when querying by the other tenant's ID
  directly.
- A league_admin cannot INSERT data into another tenant, and cannot grant
  themselves a role in another tenant (privilege escalation).
- A parent sees only their own child, not other players in their own
  tenant or any player in the other tenant.
- A coach sees and can only rate players on their own team, not other
  teams in the same tenant.
- The platform admin (a separate, non-tenant-scoped flag) can see across
  both tenants by design.
- A session with no JWT claims at all sees zero rows anywhere.

## Migrating to real Supabase

Drop `01_local_auth_stub.sql` — Supabase provides real `auth.uid()`/
`auth.jwt()` already — and apply `00_schema.sql` and `02_policies.sql`
via the Supabase SQL editor or CLI. Nothing else changes.
