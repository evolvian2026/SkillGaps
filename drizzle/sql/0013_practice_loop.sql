-- ===========================================================================
-- The gap → practice → re-prove loop.
--
-- Two rules hold this together, and both are enforced here rather than only in
-- application code:
--
--   1. A practice item is never a diagnostic item. Practice shows the correct
--      answer and an explanation; if the same question could appear on a
--      diagnostic, practice would be an answer key. Every diagnostic score,
--      cohort average, employer pool and item statistic rests on diagnostic
--      answers never having been shown.
--
--   2. A skill check is not an attempt. Eight questions on one named area,
--      taken by a student who knows exactly what is coming, is not comparable
--      to a full paper — and `attempts` is what the cohort dashboard, the
--      employer pool and the item-analysis pool all read.
-- ===========================================================================

-- Everything a student writes here is their own, and nobody else's business
-- except their institution's staff, who can already see their diagnostic.
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.practice_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.skill_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.skill_check_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_check_questions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.practice_sessions TO skillgaps_app;
GRANT SELECT, INSERT, UPDATE ON public.practice_responses TO skillgaps_app;
GRANT SELECT, INSERT, UPDATE ON public.skill_checks TO skillgaps_app;
GRANT SELECT, INSERT, UPDATE ON public.skill_check_questions TO skillgaps_app;

-- --------------------------------------------------------------- practice --
DROP POLICY IF EXISTS practice_sessions_read ON public.practice_sessions;
CREATE POLICY practice_sessions_read ON public.practice_sessions FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (user_id = app.current_user_id() OR app.is_staff())
  );

DROP POLICY IF EXISTS practice_sessions_insert ON public.practice_sessions;
CREATE POLICY practice_sessions_insert ON public.practice_sessions FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS practice_sessions_update ON public.practice_sessions;
CREATE POLICY practice_sessions_update ON public.practice_sessions FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

/*
 * Responses follow their session.
 *
 * The subquery is itself subject to RLS, which is the point: it can only see
 * sessions the caller may already read, so a forged session id resolves to
 * nothing rather than to somebody else's practice.
 */
DROP POLICY IF EXISTS practice_responses_read ON public.practice_responses;
CREATE POLICY practice_responses_read ON public.practice_responses FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.practice_sessions s
      WHERE s.id = session_id
        AND (s.user_id = app.current_user_id() OR app.is_staff())
    )
  );

DROP POLICY IF EXISTS practice_responses_write ON public.practice_responses;
CREATE POLICY practice_responses_write ON public.practice_responses FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.practice_sessions s
      WHERE s.id = session_id AND s.user_id = app.current_user_id()
    )
  );

DROP POLICY IF EXISTS practice_responses_update ON public.practice_responses;
CREATE POLICY practice_responses_update ON public.practice_responses FOR UPDATE
  USING (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.practice_sessions s
      WHERE s.id = session_id AND s.user_id = app.current_user_id()
    )
  )
  WITH CHECK (tenant_id = app.current_tenant_id());

-- ----------------------------------------------------------- skill checks --
DROP POLICY IF EXISTS skill_checks_read ON public.skill_checks;
CREATE POLICY skill_checks_read ON public.skill_checks FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (user_id = app.current_user_id() OR app.is_staff())
  );

DROP POLICY IF EXISTS skill_checks_insert ON public.skill_checks;
CREATE POLICY skill_checks_insert ON public.skill_checks FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS skill_checks_update ON public.skill_checks;
CREATE POLICY skill_checks_update ON public.skill_checks FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

DROP POLICY IF EXISTS skill_check_questions_read ON public.skill_check_questions;
CREATE POLICY skill_check_questions_read ON public.skill_check_questions FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.skill_checks c
      WHERE c.id = check_id
        AND (c.user_id = app.current_user_id() OR app.is_staff())
    )
  );

DROP POLICY IF EXISTS skill_check_questions_write ON public.skill_check_questions;
CREATE POLICY skill_check_questions_write ON public.skill_check_questions FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.skill_checks c
      WHERE c.id = check_id AND c.user_id = app.current_user_id()
    )
  );

DROP POLICY IF EXISTS skill_check_questions_update ON public.skill_check_questions;
CREATE POLICY skill_check_questions_update ON public.skill_check_questions FOR UPDATE
  USING (
    tenant_id = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.skill_checks c
      WHERE c.id = check_id AND c.user_id = app.current_user_id()
    )
  )
  WITH CHECK (tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------- pool hygiene ---
/*
 * A practice question must never be attached to a track.
 *
 * `startAttempt` draws from questions joined to `question_tracks`, so a
 * practice item linked to a track would silently enter a diagnostic paper —
 * with its answer already shown to every student who practised. Enforced at
 * the database so a future seed or admin tool cannot reintroduce it.
 */
CREATE OR REPLACE FUNCTION app.reject_practice_in_track()
  RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = NEW.question_id AND q.pool <> 'diagnostic'
    ) THEN
      RAISE EXCEPTION 'a practice question cannot be attached to a track'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS question_tracks_pool_guard ON public.question_tracks;
CREATE TRIGGER question_tracks_pool_guard
  BEFORE INSERT OR UPDATE ON public.question_tracks
  FOR EACH ROW EXECUTE FUNCTION app.reject_practice_in_track();
