-- Adjustable templates: a generic per-tenant settings bucket for things
-- the core app reads rather than hardcodes — the comms policy-doc text
-- and default schedule-rule values, ready for the Comms Copilot and
-- Schedule Maker feature modules to consume later. No new RLS needed:
-- tenants_update (db/02_policies.sql) already covers writes to any column
-- on a tenant row, including this one.
alter table tenants add column if not exists settings jsonb not null default '{}'::jsonb;
