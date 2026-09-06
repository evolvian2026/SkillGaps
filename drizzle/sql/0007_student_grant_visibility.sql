-- ===========================================================================
-- Policies compose: a subquery inside a policy is itself subject to RLS.
--
-- The student branch added to `employers_read` checks
-- `EXISTS (SELECT 1 FROM employer_access_grants ...)`. That subquery runs as
-- the calling user, so it is filtered by `employer_grants_read` — which had no
-- student branch. The EXISTS was therefore always false and the student branch
-- could never fire, silently, with no error anywhere.
--
-- The fix is to let a student read the grants that concern their own
-- institution. This is the same fact the employers policy is trying to expose
-- and is reasonable for a student to know: which employers their university
-- has admitted. Only ACTIVE grants are visible — a pending request is a
-- conversation between the employer and the university, not a student's
-- business, and a revoked one is nobody's.
-- ===========================================================================

DROP POLICY IF EXISTS employer_grants_read ON public.employer_access_grants;
CREATE POLICY employer_grants_read ON public.employer_access_grants FOR SELECT
  USING (
    (app.is_employer() AND employer_id = app.current_employer_id())
    OR (app.is_staff() AND tenant_id = app.current_tenant_id())
    OR (
      app.current_role() = 'student'
      AND tenant_id = app.current_tenant_id()
      AND status = 'active'
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    )
  );
