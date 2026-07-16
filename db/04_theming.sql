-- White-labeling: public tenant branding + a storage bucket for
-- league-uploaded logos/backgrounds.
--
-- tenants (id, name, subdomain, theme, created_at) has no sensitive
-- columns — unlike players/ratings/etc., a league's own name/logo/colors
-- are meant to be publicly visible (e.g. on the login page, before anyone
-- signs in), so this adds an unconditional SELECT policy alongside the
-- existing member-scoped one rather than routing through a function.
-- Multiple permissive policies OR together, so members/platform admins
-- keep whatever access tenants_select already granted them; this just
-- adds "anyone" on top for this one table.
create policy tenants_select_public on tenants for select using (true);

-- Storage bucket for tenant-uploaded assets. Public read (branding is
-- meant to be visible pre-login); write restricted to that tenant's
-- league_admin via a path convention of "<tenant_id>/<filename>".
-- 2 MB cap, raster formats only (no SVG — an uploaded SVG can carry
-- <script>/event-handler content and would be a stored-XSS vector since
-- these files are served back to every visitor of the league's site).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-assets', 'tenant-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy tenant_assets_public_read on storage.objects for select using (
  bucket_id = 'tenant-assets'
);

create policy tenant_assets_league_admin_insert on storage.objects for insert with check (
  bucket_id = 'tenant-assets'
  and (
    app.is_platform_admin()
    or app.role_in_tenant(((storage.foldername(name))[1])::uuid) = 'league_admin'
  )
);

create policy tenant_assets_league_admin_update on storage.objects for update using (
  bucket_id = 'tenant-assets'
  and (
    app.is_platform_admin()
    or app.role_in_tenant(((storage.foldername(name))[1])::uuid) = 'league_admin'
  )
);

create policy tenant_assets_league_admin_delete on storage.objects for delete using (
  bucket_id = 'tenant-assets'
  and (
    app.is_platform_admin()
    or app.role_in_tenant(((storage.foldername(name))[1])::uuid) = 'league_admin'
  )
);
