-- ===========================================================================
-- Phase 3 Row-Level Security.
--
-- Employers are the first role that legitimately reads across tenants, so the
-- model is extended rather than replaced: an employer's reach is defined
-- entirely by an ACTIVE row in `employer_access_grants`, and every employer
-- policy is expressed through the helper functions below.
--
-- Two invariants this file enforces:
--   1. An employer sees nothing about a university that has not granted them
--      access, and nothing after that grant is revoked or expires.
--   2. An employer never sees an identifiable student without that student's
--      own recorded opt-in, which is separate from the university's grant.
-- ===========================================================================

-- The employer organisation the caller belongs to, if any. Set alongside the
-- existing identity GUCs by withRequestContext().
CREATE OR REPLACE FUNCTION app.current_employer_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.employer_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.is_employer() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_role() = 'employer' AND app.current_employer_id() IS NOT NULL;
  $$;

/*
 * Does the calling employer currently hold access to this university?
 *
 * Checks status, revocation and expiry together — a grant that has lapsed must
 * behave exactly like one that never existed, not like one that is merely
 * marked inactive somewhere in the application.
 */
CREATE OR REPLACE FUNCTION app.employer_has_tenant(p_tenant_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.employer_access_grants g
      WHERE g.employer_id = app.current_employer_id()
        AND g.tenant_id = p_tenant_id
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    );
  $$;

/*
 * Has this student opted in to sharing a full profile with the calling
 * employer, and not since withdrawn?
 *
 * Consent is append-only, so "current" means the most recent event. A
 * withdrawal is a later row with granted = false, and this returns false the
 * moment it is written.
 */
CREATE OR REPLACE FUNCTION app.student_shares_with_employer(p_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
      (SELECT c.granted AND c.scope = 'full_profile'
       FROM public.profile_share_consents c
       WHERE c.user_id = p_user_id
         AND c.employer_id = app.current_employer_id()
       ORDER BY c.recorded_at DESC
       LIMIT 1),
      false
    );
  $$;

-- ---------------------------------------------------------------------------
-- Employer organisations.
--
-- An employer sees only their own record. University staff can see employers
-- that hold or have requested a grant on their tenant, so a TPO can review who
-- is asking for access.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers FORCE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.employers TO skillgaps_app;

DROP POLICY IF EXISTS employers_read ON public.employers;
CREATE POLICY employers_read ON public.employers FOR SELECT
  USING (
    app.current_role() = 'super_admin'
    OR (app.is_employer() AND id = app.current_employer_id())
    OR (app.is_staff() AND EXISTS (
          SELECT 1 FROM public.employer_access_grants g
          WHERE g.employer_id = public.employers.id
            AND g.tenant_id = app.current_tenant_id()
        ))
  );

DROP POLICY IF EXISTS employers_update_own ON public.employers;
CREATE POLICY employers_update_own ON public.employers FOR UPDATE
  USING (app.is_employer() AND id = app.current_employer_id())
  WITH CHECK (app.is_employer() AND id = app.current_employer_id());

-- ---------------------------------------------------------------------------
-- Access grants.
--
-- The employer may read and request; only the university may approve. That
-- asymmetry is the point: an employer must not be able to widen their own
-- reach, so their INSERT is constrained to 'pending' and they have no UPDATE
-- policy at all.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employer_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_access_grants FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.employer_access_grants TO skillgaps_app;

DROP POLICY IF EXISTS employer_grants_read ON public.employer_access_grants;
CREATE POLICY employer_grants_read ON public.employer_access_grants FOR SELECT
  USING (
    (app.is_employer() AND employer_id = app.current_employer_id())
    OR (app.is_staff() AND tenant_id = app.current_tenant_id())
  );

DROP POLICY IF EXISTS employer_grants_request ON public.employer_access_grants;
CREATE POLICY employer_grants_request ON public.employer_access_grants FOR INSERT
  WITH CHECK (
    -- An employer may only ever ask.
    (app.is_employer()
     AND employer_id = app.current_employer_id()
     AND status = 'pending'
     AND granted_at IS NULL)
    -- Staff may create an already-approved grant for their own tenant.
    OR (app.is_staff() AND tenant_id = app.current_tenant_id())
  );

DROP POLICY IF EXISTS employer_grants_decide ON public.employer_access_grants;
CREATE POLICY employer_grants_decide ON public.employer_access_grants FOR UPDATE
  USING (app.is_staff() AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_staff() AND tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Profile share consent.
--
-- Append-only, like signup consent: no UPDATE or DELETE grant, so a withdrawal
-- is a new row and the history of a share survives.
--
-- The employer can read consent rows naming them — they need to know who has
-- opted in — but only for tenants they hold access to.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_share_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_share_consents FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.profile_share_consents TO skillgaps_app;

DROP POLICY IF EXISTS profile_share_read ON public.profile_share_consents;
CREATE POLICY profile_share_read ON public.profile_share_consents FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR user_id = app.current_user_id()))
    OR (app.is_employer()
        AND employer_id = app.current_employer_id()
        AND app.employer_has_tenant(tenant_id))
  );

DROP POLICY IF EXISTS profile_share_insert_self ON public.profile_share_consents;
CREATE POLICY profile_share_insert_self ON public.profile_share_consents FOR INSERT
  WITH CHECK (
    -- Only the student themselves. Not staff, not the employer.
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- Employer assessments.
--
-- Readable by the owning employer, and by students in a tenant the employer
-- both holds access to and has scoped the assessment to.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employer_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_assessments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.employer_assessments TO skillgaps_app;

/*
 * Is this assessment open to the calling user's tenant?
 *
 * Requires BOTH an active grant and, when the assessment names specific
 * tenants, membership of that list. An employer cannot widen reach by leaving
 * `tenant_ids` empty: the grant check still applies.
 */
CREATE OR REPLACE FUNCTION app.assessment_open_to_tenant(
  p_employer_id uuid, p_tenant_ids uuid[]
) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.employer_access_grants g
      WHERE g.employer_id = p_employer_id
        AND g.tenant_id = app.current_tenant_id()
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
    AND (
      p_tenant_ids IS NULL
      OR cardinality(p_tenant_ids) = 0
      OR app.current_tenant_id() = ANY (p_tenant_ids)
    );
  $$;

DROP POLICY IF EXISTS employer_assessments_read ON public.employer_assessments;
CREATE POLICY employer_assessments_read ON public.employer_assessments FOR SELECT
  USING (
    (app.is_employer() AND employer_id = app.current_employer_id())
    OR (app.current_role() IN ('student', 'faculty', 'admin')
        AND is_active
        AND app.assessment_open_to_tenant(employer_id, tenant_ids))
  );

DROP POLICY IF EXISTS employer_assessments_write ON public.employer_assessments;
CREATE POLICY employer_assessments_write ON public.employer_assessments FOR INSERT
  WITH CHECK (app.is_employer() AND employer_id = app.current_employer_id());

DROP POLICY IF EXISTS employer_assessments_update ON public.employer_assessments;
CREATE POLICY employer_assessments_update ON public.employer_assessments FOR UPDATE
  USING (app.is_employer() AND employer_id = app.current_employer_id())
  WITH CHECK (app.is_employer() AND employer_id = app.current_employer_id());

-- ---------------------------------------------------------------------------
-- Employer assessment attempts.
--
-- The employer sees that a student in a granted cohort sat their assessment.
-- Identifying that student to them is governed separately, by the student's own
-- opt-in — this table is deliberately only the link.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employer_assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_assessment_attempts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.employer_assessment_attempts TO skillgaps_app;

DROP POLICY IF EXISTS employer_attempts_read ON public.employer_assessment_attempts;
CREATE POLICY employer_attempts_read ON public.employer_assessment_attempts FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR user_id = app.current_user_id()))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND EXISTS (
          SELECT 1 FROM public.employer_assessments a
          WHERE a.id = assessment_id AND a.employer_id = app.current_employer_id()
        ))
  );

DROP POLICY IF EXISTS employer_attempts_insert ON public.employer_assessment_attempts;
CREATE POLICY employer_attempts_insert ON public.employer_assessment_attempts
  FOR INSERT WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- ===========================================================================
-- Employer access to student records.
--
-- The rule: a university grant lets an employer see *aggregates*; only the
-- student's own opt-in lets them see a *person*.
--
-- The policies below therefore extend the Phase 1/2 read rules with an
-- employer branch gated on `student_shares_with_employer`, and nothing else.
-- Anonymous candidate-pool browsing does NOT go through these policies at all
-- — it goes through the aggregate function further down, so the employer role
-- never holds row access to a student who has not opted in. Widening these
-- policies to serve the pool would have made the opt-in cosmetic.
-- ===========================================================================

DROP POLICY IF EXISTS users_read ON public.users;
CREATE POLICY users_read ON public.users FOR SELECT
  USING (
    app.current_role() = 'super_admin'
    OR (tenant_id = app.current_tenant_id()
        AND (app.is_staff() OR id = app.current_user_id()))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND app.student_shares_with_employer(id))
  );

DROP POLICY IF EXISTS student_profiles_read ON public.student_profiles;
CREATE POLICY student_profiles_read ON public.student_profiles FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR user_id = app.current_user_id()))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND app.student_shares_with_employer(user_id))
  );

DROP POLICY IF EXISTS attempts_read ON public.attempts;
CREATE POLICY attempts_read ON public.attempts FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR user_id = app.current_user_id()))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND app.student_shares_with_employer(user_id))
  );

DROP POLICY IF EXISTS attempt_skill_scores_read ON public.attempt_skill_scores;
CREATE POLICY attempt_skill_scores_read ON public.attempt_skill_scores FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR app.owns_attempt(attempt_id)))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND EXISTS (
          SELECT 1 FROM public.attempts a
          WHERE a.id = attempt_id
            AND app.student_shares_with_employer(a.user_id)
        ))
  );

DROP POLICY IF EXISTS readiness_scores_read ON public.readiness_scores;
CREATE POLICY readiness_scores_read ON public.readiness_scores FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR user_id = app.current_user_id()))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND app.student_shares_with_employer(user_id))
  );

-- Interview sessions follow the same rule, so a shared profile can show
-- interview performance without a second consent mechanism.
DROP POLICY IF EXISTS interview_sessions_read ON public.interview_sessions;
CREATE POLICY interview_sessions_read ON public.interview_sessions FOR SELECT
  USING (
    (tenant_id = app.current_tenant_id()
     AND (app.is_staff() OR user_id = app.current_user_id()))
    OR (app.is_employer()
        AND app.employer_has_tenant(tenant_id)
        AND app.student_shares_with_employer(user_id))
  );

-- Resumes stay off-limits to employers entirely, as they are to staff. A
-- student sends their CV to an employer directly; the platform is not the
-- channel for that, and holding one does not make us one.

-- ---------------------------------------------------------------------------
-- Anonymised candidate pool.
--
-- Returns counts bucketed by skill area and score band across the tenants an
-- employer holds. Runs SECURITY DEFINER precisely so the employer role does
-- NOT need row access to the students being counted.
--
-- k-anonymity: buckets smaller than p_min_bucket are suppressed rather than
-- returned. Without that, a filtered pool can narrow to one student and a
-- "count" becomes an identification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.employer_candidate_pool(
  p_track_id uuid DEFAULT NULL,
  p_min_bucket integer DEFAULT 5
) RETURNS TABLE (
  tenant_name text,
  skill_area_code text,
  skill_area_name text,
  band text,
  student_count integer
)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH granted AS (
      SELECT g.tenant_id
      FROM public.employer_access_grants g
      WHERE g.employer_id = app.current_employer_id()
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
    ),
    latest AS (
      SELECT DISTINCT ON (a.user_id, a.track_id) a.id, a.user_id, a.tenant_id
      FROM public.attempts a
      JOIN granted ON granted.tenant_id = a.tenant_id
      WHERE a.status = 'submitted'
        AND (p_track_id IS NULL OR a.track_id = p_track_id)
      ORDER BY a.user_id, a.track_id, a.submitted_at DESC
    ),
    banded AS (
      SELECT t.name AS tenant_name,
             sa.code AS skill_area_code,
             sa.name AS skill_area_name,
             CASE
               WHEN s.percent >= 75 THEN 'strong'
               WHEN s.percent >= 50 THEN 'developing'
               ELSE 'early'
             END AS band,
             l.user_id
      FROM latest l
      JOIN public.attempt_skill_scores s ON s.attempt_id = l.id
      JOIN public.skill_areas sa ON sa.id = s.skill_area_id
      JOIN public.tenants t ON t.id = l.tenant_id
    )
    SELECT b.tenant_name, b.skill_area_code, b.skill_area_name, b.band,
           COUNT(DISTINCT b.user_id)::int AS student_count
    FROM banded b
    WHERE app.is_employer()
    GROUP BY b.tenant_name, b.skill_area_code, b.skill_area_name, b.band
    -- Suppress buckets too small to be non-identifying.
    HAVING COUNT(DISTINCT b.user_id) >= GREATEST(p_min_bucket, 1)
    ORDER BY b.tenant_name, b.skill_area_name, b.band;
  $$;

REVOKE ALL ON FUNCTION app.employer_candidate_pool(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.employer_candidate_pool(uuid, integer) TO skillgaps_app;

-- ---------------------------------------------------------------------------
-- Verified profiles.
--
-- The student owns these entirely. Verification by a third party does not go
-- through a policy at all — the verifier has no account — so it runs through a
-- SECURITY DEFINER function keyed on the token hash.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verified_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_profiles FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.verified_profiles TO skillgaps_app;

DROP POLICY IF EXISTS verified_profiles_own ON public.verified_profiles;
CREATE POLICY verified_profiles_own ON public.verified_profiles FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

DROP POLICY IF EXISTS verified_profiles_issue ON public.verified_profiles;
CREATE POLICY verified_profiles_issue ON public.verified_profiles FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS verified_profiles_revoke ON public.verified_profiles;
CREATE POLICY verified_profiles_revoke ON public.verified_profiles FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

/*
 * Resolve a shareable token to its frozen snapshot.
 *
 * Takes the SHA-256 of the token, never the token itself, so a database dump
 * cannot be replayed as a working link. Returns nothing for a revoked or
 * expired profile — revocation must take effect immediately and without the
 * application having to remember to check.
 */
CREATE OR REPLACE FUNCTION app.resolve_verified_profile(p_token_hash text)
  RETURNS TABLE (
    public_id text,
    snapshot jsonb,
    issued_at timestamptz,
    expires_at timestamptz,
    label text
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT v.public_id, v.snapshot, v.issued_at, v.expires_at, v.label
    FROM public.verified_profiles v
    WHERE v.token_hash = p_token_hash
      AND v.revoked_at IS NULL
      AND (v.expires_at IS NULL OR v.expires_at > now());
  $$;

/* Records a verification view, so the student can see when their link is used. */
CREATE OR REPLACE FUNCTION app.record_profile_view(p_token_hash text)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.verified_profiles
    SET view_count = view_count + 1, last_viewed_at = now()
    WHERE token_hash = p_token_hash AND revoked_at IS NULL;
  $$;

REVOKE ALL ON FUNCTION app.resolve_verified_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_profile_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_verified_profile(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.record_profile_view(text) TO skillgaps_app;

-- ---------------------------------------------------------------------------
-- Calibration runs.
--
-- Platform-level analysis, not tenant data. Readable by staff and super-admins
-- so a university can see what evidence, if any, sits behind the benchmarks
-- their students are measured against. Never writable through the app role —
-- runs are produced by the offline calibration job.
-- ---------------------------------------------------------------------------
ALTER TABLE public.calibration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_runs FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.calibration_runs TO skillgaps_app;

DROP POLICY IF EXISTS calibration_runs_read ON public.calibration_runs;
CREATE POLICY calibration_runs_read ON public.calibration_runs FOR SELECT
  USING (app.is_staff() OR app.current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Employer signup lookup: resolve an employer by email domain or invite,
-- before any identity exists. Same pattern as tenant signup in Phase 1.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.resolve_employer_by_domain(p_email_domain text)
  RETURNS TABLE (employer_id uuid, employer_name text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT e.id, e.name
    FROM public.employers e
    WHERE e.is_active
      AND p_email_domain IS NOT NULL AND p_email_domain <> ''
      AND lower(p_email_domain) = ANY (
        SELECT lower(d) FROM unnest(e.email_domains) AS d
      )
    LIMIT 1;
  $$;

REVOKE ALL ON FUNCTION app.resolve_employer_by_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_employer_by_domain(text) TO skillgaps_app;
