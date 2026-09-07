-- ===========================================================================
-- Teaching assignments.
--
-- The one property that matters here: a lecturer must not be able to give
-- themselves a cohort. If faculty could write this table they could assign
-- themselves any section in the institution and read its results, which would
-- make the whole faculty view a self-service tenancy hole rather than a
-- delegation from the placement office.
--
-- So writes are `admin` / `super_admin` only, and reads are open to all staff
-- (the office needs to manage every row; a lecturer needs to see their own).
-- ===========================================================================

ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_assignments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.teaching_assignments TO skillgaps_app;

/*
 * The placement office: admin and super-admin, never faculty.
 *
 * Defined as its own helper rather than reusing `app.is_staff()`, because the
 * whole point of this table is that `faculty` is inside is_staff() and must
 * still be refused here.
 */
CREATE OR REPLACE FUNCTION app.is_placement_staff() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_role() IN ('admin', 'super_admin');
  $$;

DROP POLICY IF EXISTS teaching_read ON public.teaching_assignments;
CREATE POLICY teaching_read ON public.teaching_assignments FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS teaching_write ON public.teaching_assignments;
CREATE POLICY teaching_write ON public.teaching_assignments FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND app.is_placement_staff()
    -- The named lecturer must be a real staff member of THIS institution.
    -- Without this an assignment could name a user in another tenant, and the
    -- faculty page would then hand them this institution's results.
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = faculty_id
        AND u.tenant_id = app.current_tenant_id()
        AND u.role IN ('faculty', 'admin', 'super_admin')
    )
    -- And the subject must belong to this institution too.
    AND EXISTS (
      SELECT 1 FROM public.syllabus_subjects s
      WHERE s.id = subject_id AND s.tenant_id = app.current_tenant_id()
    )
  );

DROP POLICY IF EXISTS teaching_delete ON public.teaching_assignments;
CREATE POLICY teaching_delete ON public.teaching_assignments FOR DELETE
  USING (tenant_id = app.current_tenant_id() AND app.is_placement_staff());
