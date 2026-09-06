-- ===========================================================================
-- Students need to see employers that hold access to their institution.
--
-- The original `employers_read` policy covered employers (own record) and
-- staff (employers touching their tenant) but not students — which silently
-- broke two student-facing features, because both join `employers` and an
-- INNER JOIN against an unreadable table returns nothing rather than erroring:
--
--   * the sharing page, where a student decides who may see their profile
--   * campus drives on the dashboard, which name the employer running them
--
-- A student cannot make an informed sharing decision about an organisation
-- they are not allowed to see the name of. What is exposed here is only what
-- the employer publishes about itself — name, slug, website — and only for
-- employers their own institution has already admitted.
-- ===========================================================================

DROP POLICY IF EXISTS employers_read ON public.employers;
CREATE POLICY employers_read ON public.employers FOR SELECT
  USING (
    app.current_role() = 'super_admin'
    -- An employer sees its own record.
    OR (app.is_employer() AND id = app.current_employer_id())
    -- Staff see any employer that holds or has requested a grant on their tenant.
    OR (app.is_staff() AND EXISTS (
          SELECT 1 FROM public.employer_access_grants g
          WHERE g.employer_id = public.employers.id
            AND g.tenant_id = app.current_tenant_id()
        ))
    -- A student sees employers with ACTIVE access to their own institution.
    -- Pending and revoked grants stay hidden: there is nothing for a student
    -- to decide about an employer who cannot see their cohort anyway.
    OR (app.current_role() = 'student' AND EXISTS (
          SELECT 1 FROM public.employer_access_grants g
          WHERE g.employer_id = public.employers.id
            AND g.tenant_id = app.current_tenant_id()
            AND g.status = 'active'
            AND g.revoked_at IS NULL
            AND (g.expires_at IS NULL OR g.expires_at > now())
        ))
  );
