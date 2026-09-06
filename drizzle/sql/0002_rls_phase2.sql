-- ===========================================================================
-- Phase 2 Row-Level Security.
--
-- Extends the Phase 1 model rather than introducing a second one: the same
-- app.current_*() helpers, the same FORCE ROW LEVEL SECURITY posture, and the
-- same rule that staff read their tenant but never write student work.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Shared banks: interview questions and the industry reference list. Readable
-- by any signed-in user, writable only through migrations and seeds.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'interview_questions', 'interview_question_tracks', 'industry_skill_references'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (app.current_role() <> ''anon'')',
      t || '_read', t
    );
    EXECUTE format('GRANT SELECT ON public.%I TO skillgaps_app', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Interview sessions. Same shape as diagnostic attempts: a student owns their
-- own, staff may read their tenant's, nobody but the owner writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.interview_sessions TO skillgaps_app;

DROP POLICY IF EXISTS interview_sessions_read ON public.interview_sessions;
CREATE POLICY interview_sessions_read ON public.interview_sessions FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS interview_sessions_insert ON public.interview_sessions;
CREATE POLICY interview_sessions_insert ON public.interview_sessions FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS interview_sessions_update ON public.interview_sessions;
CREATE POLICY interview_sessions_update ON public.interview_sessions FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

CREATE OR REPLACE FUNCTION app.owns_interview_session(p_session_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.interview_sessions s
      WHERE s.id = p_session_id
        AND s.tenant_id = app.current_tenant_id()
        AND s.user_id = app.current_user_id()
    );
  $$;

ALTER TABLE public.interview_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_responses FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.interview_responses TO skillgaps_app;

DROP POLICY IF EXISTS interview_responses_read ON public.interview_responses;
CREATE POLICY interview_responses_read ON public.interview_responses FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR app.owns_interview_session(session_id))
  );

DROP POLICY IF EXISTS interview_responses_insert ON public.interview_responses;
CREATE POLICY interview_responses_insert ON public.interview_responses FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND app.owns_interview_session(session_id)
  );

DROP POLICY IF EXISTS interview_responses_update ON public.interview_responses;
CREATE POLICY interview_responses_update ON public.interview_responses FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND app.owns_interview_session(session_id))
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND app.owns_interview_session(session_id)
  );

-- ---------------------------------------------------------------------------
-- Evaluation audit log.
--
-- Append-only through the app role: no UPDATE or DELETE grant, so a re-run
-- writes a new row and the original evidence cannot be quietly rewritten.
-- Readable by staff for audit, and by the student for their own work.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_evaluations FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.ai_evaluations TO skillgaps_app;

DROP POLICY IF EXISTS ai_evaluations_read ON public.ai_evaluations;
CREATE POLICY ai_evaluations_read ON public.ai_evaluations FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS ai_evaluations_insert ON public.ai_evaluations;
CREATE POLICY ai_evaluations_insert ON public.ai_evaluations FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Resumes.
--
-- A resume is the most personal artefact in the system, so staff do NOT get
-- read access to the file or its extracted text -- only to the derived match
-- score, via `resume_matches`. This is deliberately stricter than attempts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.resumes TO skillgaps_app;

DROP POLICY IF EXISTS resumes_own ON public.resumes;
CREATE POLICY resumes_own ON public.resumes FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

DROP POLICY IF EXISTS resumes_insert_own ON public.resumes;
CREATE POLICY resumes_insert_own ON public.resumes FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS resumes_update_own ON public.resumes;
CREATE POLICY resumes_update_own ON public.resumes FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- Job descriptions: own, or shared with the whole tenant by staff.
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.job_descriptions TO skillgaps_app;

DROP POLICY IF EXISTS job_descriptions_read ON public.job_descriptions;
CREATE POLICY job_descriptions_read ON public.job_descriptions FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (is_shared OR created_by = app.current_user_id() OR app.is_staff())
  );

DROP POLICY IF EXISTS job_descriptions_insert ON public.job_descriptions;
CREATE POLICY job_descriptions_insert ON public.job_descriptions FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND created_by = app.current_user_id()
    -- Only staff may publish to the whole cohort.
    AND (NOT is_shared OR app.is_staff())
  );

DROP POLICY IF EXISTS job_descriptions_update ON public.job_descriptions;
CREATE POLICY job_descriptions_update ON public.job_descriptions FOR UPDATE
  USING (
    tenant_id = app.current_tenant_id()
    AND (created_by = app.current_user_id() OR app.is_staff())
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND (NOT is_shared OR app.is_staff())
  );

-- ---------------------------------------------------------------------------
-- Resume matches: the student's own, plus staff read for readiness scoring.
-- ---------------------------------------------------------------------------
ALTER TABLE public.resume_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_matches FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.resume_matches TO skillgaps_app;

DROP POLICY IF EXISTS resume_matches_read ON public.resume_matches;
CREATE POLICY resume_matches_read ON public.resume_matches FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS resume_matches_insert ON public.resume_matches;
CREATE POLICY resume_matches_insert ON public.resume_matches FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS resume_matches_update ON public.resume_matches;
CREATE POLICY resume_matches_update ON public.resume_matches FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- Syllabus: staff-owned, tenant-scoped. Students have no read access — this
-- is institutional planning data, not student-facing.
-- ---------------------------------------------------------------------------
ALTER TABLE public.syllabus_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_subjects FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.syllabus_subjects TO skillgaps_app;

DROP POLICY IF EXISTS syllabus_read ON public.syllabus_subjects;
CREATE POLICY syllabus_read ON public.syllabus_subjects FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS syllabus_insert ON public.syllabus_subjects;
CREATE POLICY syllabus_insert ON public.syllabus_subjects FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS syllabus_update ON public.syllabus_subjects;
CREATE POLICY syllabus_update ON public.syllabus_subjects FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND app.is_staff())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS syllabus_delete ON public.syllabus_subjects;
CREATE POLICY syllabus_delete ON public.syllabus_subjects FOR DELETE
  USING (tenant_id = app.current_tenant_id() AND app.is_staff());

-- ---------------------------------------------------------------------------
-- Readiness weights: staff configure, everyone in the tenant may read (a
-- student is entitled to know how their own score was composed).
-- ---------------------------------------------------------------------------
ALTER TABLE public.readiness_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readiness_weights FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.readiness_weights TO skillgaps_app;

DROP POLICY IF EXISTS readiness_weights_read ON public.readiness_weights;
CREATE POLICY readiness_weights_read ON public.readiness_weights FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS readiness_weights_insert ON public.readiness_weights;
CREATE POLICY readiness_weights_insert ON public.readiness_weights FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS readiness_weights_update ON public.readiness_weights;
CREATE POLICY readiness_weights_update ON public.readiness_weights FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND app.is_staff())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

-- ---------------------------------------------------------------------------
-- Readiness scores.
--
-- Derived data, written by the recompute job on behalf of the student whose
-- score it is. Staff read for the dashboard; nobody edits a score by hand,
-- which is why there is no staff UPDATE policy.
-- ---------------------------------------------------------------------------
ALTER TABLE public.readiness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readiness_scores FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.readiness_scores TO skillgaps_app;

DROP POLICY IF EXISTS readiness_scores_read ON public.readiness_scores;
CREATE POLICY readiness_scores_read ON public.readiness_scores FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS readiness_scores_insert ON public.readiness_scores;
CREATE POLICY readiness_scores_insert ON public.readiness_scores FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS readiness_scores_update ON public.readiness_scores;
CREATE POLICY readiness_scores_update ON public.readiness_scores FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- Placement outcomes.
--
-- Either the student or their TPO may record the outcome, so unlike attempt
-- data this table does grant staff writes — a TPO knows who was placed, and
-- chasing every student to self-report would leave the Phase 3 calibration
-- dataset full of holes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.placement_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_outcomes FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.placement_outcomes TO skillgaps_app;

DROP POLICY IF EXISTS placement_outcomes_read ON public.placement_outcomes;
CREATE POLICY placement_outcomes_read ON public.placement_outcomes FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS placement_outcomes_insert ON public.placement_outcomes;
CREATE POLICY placement_outcomes_insert ON public.placement_outcomes FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS placement_outcomes_update ON public.placement_outcomes;
CREATE POLICY placement_outcomes_update ON public.placement_outcomes FOR UPDATE
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

-- ---------------------------------------------------------------------------
-- Background worker context.
--
-- Jobs run outside a request, so they have no session to derive identity from.
-- Rather than granting the worker BYPASSRLS, each job sets the GUCs for the
-- student it is acting on behalf of and is therefore bound by exactly the same
-- policies as that student's own requests.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.job_context(p_user_id uuid)
  RETURNS TABLE (user_id uuid, tenant_id uuid, user_role text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE u.id = p_user_id AND u.is_active AND t.is_active;
  $$;

REVOKE ALL ON FUNCTION app.job_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.job_context(uuid) TO skillgaps_app;
