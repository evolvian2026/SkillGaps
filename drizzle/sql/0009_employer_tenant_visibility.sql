-- ===========================================================================
-- An employer could not see the institutions they deal with.
--
-- Two pages were permanently empty, both for the same reason: the `tenants`
-- policy admits only a caller's OWN tenant, and an employer's own tenant is
-- their organisation record, not a university.
--
--   * /employer/access — "Your requests" joins grants to tenants for the
--     institution name, and the join dropped every row
--   * the same page's institution picker, which read tenants with no identity
--     set at all and therefore saw nothing to offer
--
-- Widening the `tenants` policy is the wrong fix: that table also holds each
-- university's invite code, which lets a holder register as one of their
-- students. Column privileges are granted per database role, and every
-- application user shares one, so they cannot express "employers may read the
-- name but not the code".
--
-- Instead, two narrow SECURITY DEFINER functions expose exactly the two fields
-- an employer needs — an id and a display name — the same approach the
-- anonymised candidate pool already takes.
-- ===========================================================================

/*
 * The calling employer's own grants, with the institution's name.
 *
 * Every status, because an employer needs to see a pending request and a
 * revoked one as much as an active grant. Returns nothing when the caller is
 * not an employer.
 */
CREATE OR REPLACE FUNCTION app.employer_grants()
  RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    tenant_name text,
    status text,
    batch_year integer,
    branch text,
    granted_at timestamptz,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT g.id, g.tenant_id, t.name, g.status::text, g.batch_year, g.branch,
           g.granted_at, g.expires_at, g.revoked_at, g.created_at
    FROM public.employer_access_grants g
    JOIN public.tenants t ON t.id = g.tenant_id
    WHERE app.is_employer()
      AND g.employer_id = app.current_employer_id()
    ORDER BY g.created_at DESC;
  $$;

/*
 * Institutions an employer may request access from.
 *
 * Name and id only — never the invite code or registered email domains.
 * Employer organisations carry their own tenant row to satisfy the identity
 * model; those are excluded here, since they are not institutions anyone
 * studies at.
 */
CREATE OR REPLACE FUNCTION app.institution_directory()
  RETURNS TABLE (id uuid, name text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT t.id, t.name
    FROM public.tenants t
    WHERE app.is_employer()
      AND t.is_active
      AND NOT EXISTS (SELECT 1 FROM public.employers e WHERE e.tenant_id = t.id)
    ORDER BY t.name;
  $$;

REVOKE ALL ON FUNCTION app.employer_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.institution_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.employer_grants() TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.institution_directory() TO skillgaps_app;
