-- ===========================================================================
-- Item analysis.
--
-- These two tables are global, like the question bank they describe: an item's
-- facility and discrimination only mean anything pooled across every
-- institution that has answered it.
--
-- That makes them cross-tenant by construction, so the read policy admits
-- `super_admin` alone. A TPO reading them would be seeing other institutions'
-- response behaviour, about a bank they do not own — and "question 14 is
-- miskeyed" is not a fact a placement office can act on, only one that would
-- undermine the scores they are presenting to students.
--
-- Writes come from the offline job as the owner role, which bypasses RLS. The
-- application never inserts here, so no INSERT policy is granted at all.
-- ===========================================================================

ALTER TABLE public.item_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_analysis_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.item_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_statistics FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.item_analysis_runs TO skillgaps_app;
GRANT SELECT ON public.item_statistics TO skillgaps_app;

CREATE OR REPLACE FUNCTION app.is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_role() = 'super_admin';
  $$;

DROP POLICY IF EXISTS item_runs_read ON public.item_analysis_runs;
CREATE POLICY item_runs_read ON public.item_analysis_runs FOR SELECT
  USING (app.is_super_admin());

DROP POLICY IF EXISTS item_statistics_read ON public.item_statistics;
CREATE POLICY item_statistics_read ON public.item_statistics FOR SELECT
  USING (app.is_super_admin());

/*
 * The responses one item analysis run should consider.
 *
 * SECURITY DEFINER because the whole point is to pool across tenants, which no
 * row policy would ever permit — and because the offline job connects as the
 * owner anyway, this exists so the *shape* of the query is defined once,
 * beside the rules it has to honour:
 *
 *   * submitted attempts only — an abandoned paper's blanks are not wrong
 *     answers, and counting them would make every late item look impossible
 *   * integrity-flagged attempts excluded — a paper finished in three minutes
 *     is near-random responding, and including it depresses the measured
 *     discrimination of every item on it
 *   * `rest_percent` excludes the item being scored, so an item cannot
 *     correlate with itself; on a 20-question paper the uncorrected figure is
 *     inflated enough to hide a weak item
 *
 * Returns no identifying column beyond an opaque user id, which the analysis
 * needs only to keep one student's responses together.
 */
CREATE OR REPLACE FUNCTION app.item_response_pool(p_track_id uuid DEFAULT NULL)
  RETURNS TABLE (
    question_id uuid,
    user_id uuid,
    correct boolean,
    rest_percent double precision,
    selected_option_id uuid
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH graded AS (
      SELECT aq.attempt_id,
             aq.question_id,
             a.user_id,
             ans.is_correct,
             ans.selected_option_id,
             aq.points_possible
      FROM public.attempt_questions aq
      JOIN public.attempts a ON a.id = aq.attempt_id
      JOIN public.answers ans ON ans.attempt_question_id = aq.id
      WHERE a.status = 'submitted'
        AND ans.is_correct IS NOT NULL
        AND (p_track_id IS NULL OR a.track_id = p_track_id)
        -- A paper flagged for integrity is not evidence about an item.
        AND NOT (a.integrity_flags ? 'fast_completion')
    ),
    totals AS (
      SELECT attempt_id,
             COUNT(*)::numeric              AS answered,
             SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::numeric AS correct_count
      FROM graded
      GROUP BY attempt_id
    )
    SELECT g.question_id,
           g.user_id,
           g.is_correct,
           -- The rest of the paper, this item removed from both numerator and
           -- denominator. Undefined for a one-question attempt, which the
           -- NULLIF turns into a row the analysis will simply not see.
           (100.0 * (t.correct_count - CASE WHEN g.is_correct THEN 1 ELSE 0 END)
                  / NULLIF(t.answered - 1, 0))::double precision,
           g.selected_option_id
    FROM graded g
    JOIN totals t ON t.attempt_id = g.attempt_id
    WHERE t.answered > 1;
  $$;

REVOKE ALL ON FUNCTION app.item_response_pool(uuid) FROM PUBLIC;
-- Deliberately NOT granted to skillgaps_app: this crosses every tenant, and
-- only the offline job (owner role) has any business calling it.
