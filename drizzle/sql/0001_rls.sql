-- ===========================================================================
-- Row-Level Security: tenant isolation enforced in the database.
--
-- The application connects as a role WITHOUT the BYPASSRLS attribute, and
-- every tenant-scoped table below is set to FORCE ROW LEVEL SECURITY. A
-- university therefore cannot read another university's rows even if an
-- application query forgets its `WHERE tenant_id = ...` filter.
--
-- Request identity reaches Postgres through three transaction-local GUCs,
-- set by `withRequestContext()` in src/lib/db/client.ts:
--     app.user_id, app.tenant_id, app.user_role
--
-- PORTING TO SUPABASE: replace only the three function bodies below to read
-- from `auth.jwt()` instead of `current_setting(...)`. Every policy is
-- expressed in terms of these functions, so no policy needs to change.
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.current_role() RETURNS text
  LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'anon');
  $$;

-- Staff may read every student in their own tenant; a student sees only self.
CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.current_role() IN ('faculty', 'admin', 'super_admin');
  $$;

GRANT USAGE ON SCHEMA app TO skillgaps_app;

-- ---------------------------------------------------------------------------
-- Shared taxonomy: readable by any signed-in user, writable by nobody through
-- the application role. Content changes go through migrations/seeds, which run
-- as the owner.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'skill_areas', 'tracks', 'track_blueprint_items', 'questions',
    'question_tracks', 'question_options', 'question_test_cases',
    'benchmark_sets', 'benchmark_thresholds', 'resources'
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

-- NOTE: correct answers (question_options.is_correct, question_test_cases.
-- expected_stdout) are readable by the app role because the server needs them
-- to grade. Keeping them out of client payloads is the query layer's job --
-- see src/lib/assessment/paper.ts, which builds the student-facing shape.

-- ---------------------------------------------------------------------------
-- Tenants: a user can see only their own university.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.tenants TO skillgaps_app;

DROP POLICY IF EXISTS tenants_read_own ON public.tenants;
CREATE POLICY tenants_read_own ON public.tenants FOR SELECT
  USING (id = app.current_tenant_id() OR app.current_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Users: students see themselves; staff see their own tenant's roster.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.users TO skillgaps_app;

DROP POLICY IF EXISTS users_read ON public.users;
CREATE POLICY users_read ON public.users FOR SELECT
  USING (
    app.current_role() = 'super_admin'
    OR (tenant_id = app.current_tenant_id()
        AND (app.is_staff() OR id = app.current_user_id()))
  );

-- A user may update only their own row. The institution dashboard is
-- read-only for the MVP, so staff get no UPDATE path here.
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users FOR UPDATE
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id() AND tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Student profiles: same visibility rule as users.
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.student_profiles TO skillgaps_app;

DROP POLICY IF EXISTS student_profiles_read ON public.student_profiles;
CREATE POLICY student_profiles_read ON public.student_profiles FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS student_profiles_write_self ON public.student_profiles;
CREATE POLICY student_profiles_write_self ON public.student_profiles
  FOR INSERT WITH CHECK (
    user_id = app.current_user_id() AND tenant_id = app.current_tenant_id()
  );

DROP POLICY IF EXISTS student_profiles_update_self ON public.student_profiles;
CREATE POLICY student_profiles_update_self ON public.student_profiles
  FOR UPDATE USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id() AND tenant_id = app.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Sessions: only ever touched as the owning user. Session *lookup* happens
-- before an identity exists, so it runs through a SECURITY DEFINER function
-- (app.resolve_session) rather than a policy.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;
GRANT SELECT, DELETE ON public.sessions TO skillgaps_app;

DROP POLICY IF EXISTS sessions_own ON public.sessions;
CREATE POLICY sessions_own ON public.sessions FOR SELECT
  USING (user_id = app.current_user_id());

DROP POLICY IF EXISTS sessions_delete_own ON public.sessions;
CREATE POLICY sessions_delete_own ON public.sessions FOR DELETE
  USING (user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- Attempts and everything hanging off them.
--
-- A student may read and write only their own attempts. Staff may read their
-- tenant's attempts but never write them -- the institution dashboard is
-- read-only insights, which is enforced here rather than only in the UI.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attempts', 'attempt_questions', 'answers',
    'attempt_skill_scores', 'integrity_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO skillgaps_app', t
    );
  END LOOP;
END $$;

-- `attempts` owns the user_id column directly.
DROP POLICY IF EXISTS attempts_read ON public.attempts;
CREATE POLICY attempts_read ON public.attempts FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS attempts_insert_own ON public.attempts;
CREATE POLICY attempts_insert_own ON public.attempts FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS attempts_update_own ON public.attempts;
CREATE POLICY attempts_update_own ON public.attempts FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id())
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- Child tables reach the owning user through their attempt. Written as a
-- helper so the four policies below stay identical and auditable.
CREATE OR REPLACE FUNCTION app.owns_attempt(p_attempt_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.attempts a
      WHERE a.id = p_attempt_id
        AND a.tenant_id = app.current_tenant_id()
        AND a.user_id = app.current_user_id()
    );
  $$;

DO $$
DECLARE
  t text;
  attempt_col text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attempt_questions', 'attempt_skill_scores', 'integrity_events'
  ] LOOP
    attempt_col := 'attempt_id';

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT USING (
        tenant_id = app.current_tenant_id()
        AND (app.is_staff() OR app.owns_attempt(%I))
      )$f$, t || '_read', t, attempt_col);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
        tenant_id = app.current_tenant_id() AND app.owns_attempt(%I)
      )$f$, t || '_insert', t, attempt_col);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR UPDATE
      USING (tenant_id = app.current_tenant_id() AND app.owns_attempt(%I))
      WITH CHECK (tenant_id = app.current_tenant_id() AND app.owns_attempt(%I))
      $f$, t || '_update', t, attempt_col, attempt_col);
  END LOOP;
END $$;

-- `answers` reaches its attempt one hop further out.
CREATE OR REPLACE FUNCTION app.owns_attempt_question(p_aq_id uuid)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.attempt_questions aq
      JOIN public.attempts a ON a.id = aq.attempt_id
      WHERE aq.id = p_aq_id
        AND a.tenant_id = app.current_tenant_id()
        AND a.user_id = app.current_user_id()
    );
  $$;

DROP POLICY IF EXISTS answers_read ON public.answers;
CREATE POLICY answers_read ON public.answers FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR app.owns_attempt_question(attempt_question_id))
  );

DROP POLICY IF EXISTS answers_insert ON public.answers;
CREATE POLICY answers_insert ON public.answers FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND app.owns_attempt_question(attempt_question_id)
  );

DROP POLICY IF EXISTS answers_update ON public.answers;
CREATE POLICY answers_update ON public.answers FOR UPDATE
  USING (
    tenant_id = app.current_tenant_id()
    AND app.owns_attempt_question(attempt_question_id)
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND app.owns_attempt_question(attempt_question_id)
  );

-- ---------------------------------------------------------------------------
-- Privacy tables.
--
-- Consent records are append-only: no UPDATE or DELETE grant exists, so a
-- withdrawal is a new row rather than an edit to the original. Staff can read
-- their tenant's data requests in order to action them.
-- ---------------------------------------------------------------------------
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.consent_records TO skillgaps_app;

DROP POLICY IF EXISTS consent_read ON public.consent_records;
CREATE POLICY consent_read ON public.consent_records FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS consent_insert_self ON public.consent_records;
CREATE POLICY consent_insert_self ON public.consent_records FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_requests FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.data_requests TO skillgaps_app;

DROP POLICY IF EXISTS data_requests_read ON public.data_requests;
CREATE POLICY data_requests_read ON public.data_requests FOR SELECT
  USING (
    tenant_id = app.current_tenant_id()
    AND (app.is_staff() OR user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS data_requests_insert_self ON public.data_requests;
CREATE POLICY data_requests_insert_self ON public.data_requests FOR INSERT
  WITH CHECK (
    tenant_id = app.current_tenant_id() AND user_id = app.current_user_id()
  );

-- Only staff resolve requests, and only within their own tenant.
DROP POLICY IF EXISTS data_requests_resolve ON public.data_requests;
CREATE POLICY data_requests_resolve ON public.data_requests FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND app.is_staff())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

-- ---------------------------------------------------------------------------
-- Pre-identity operations.
--
-- Signup and login happen before any `app.user_id` exists, so they cannot go
-- through the policies above. They run as narrowly-scoped SECURITY DEFINER
-- functions instead, which is a far smaller hole than granting the app role
-- unrestricted access to `users`.
-- ---------------------------------------------------------------------------

-- Resolve a session cookie to its owner. Takes the SHA-256 of the token, so a
-- leaked database row cannot be replayed as a cookie.
CREATE OR REPLACE FUNCTION app.resolve_session(p_token_hash text)
  RETURNS TABLE (
    user_id uuid, tenant_id uuid, user_role text,
    email text, full_name text, session_id uuid
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.email, u.full_name, s.id
    FROM public.sessions s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.token_hash = p_token_hash
      AND s.expires_at > now()
      AND u.is_active
      AND (SELECT t.is_active FROM public.tenants t WHERE t.id = u.tenant_id);
  $$;

-- Map a verified Supabase `sub` onto our user row. Tenant and role always come
-- from this table, never from the JWT, so neither can be escalated by tampering
-- with Supabase app_metadata.
CREATE OR REPLACE FUNCTION app.resolve_external_user(p_external_auth_id text)
  RETURNS TABLE (
    user_id uuid, tenant_id uuid, user_role text, email text, full_name text
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.email, u.full_name
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE u.external_auth_id = p_external_auth_id
      AND u.is_active AND t.is_active;
  $$;

-- Look up the tenant a signup should join, by invite code or email domain.
-- Returns at most one row and never exposes anything beyond the tenant name.
CREATE OR REPLACE FUNCTION app.resolve_signup_tenant(
  p_invite_code text, p_email_domain text
) RETURNS TABLE (tenant_id uuid, tenant_name text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT t.id, t.name
    FROM public.tenants t
    WHERE t.is_active
      AND (
        (p_invite_code IS NOT NULL AND p_invite_code <> ''
         AND lower(t.invite_code) = lower(p_invite_code))
        OR (p_email_domain IS NOT NULL AND p_email_domain <> ''
            AND lower(p_email_domain) = ANY (
              SELECT lower(d) FROM unnest(t.email_domains) AS d
            ))
      )
    LIMIT 1;
  $$;

-- Fetch the credential record for a login attempt. Returns the hash for the
-- application to verify; it does not verify the password itself, so that
-- comparison stays in one place and stays constant-time.
CREATE OR REPLACE FUNCTION app.credential_for_login(p_email text)
  RETURNS TABLE (
    user_id uuid, tenant_id uuid, user_role text,
    full_name text, password_hash text
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.full_name, u.password_hash
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE lower(u.email) = lower(p_email) AND u.is_active AND t.is_active;
  $$;

-- Create a student account. Kept as a function so that the app role never
-- needs a blanket INSERT grant on `users`, and so that role escalation is
-- structurally impossible: the role is hard-coded to 'student' here.
CREATE OR REPLACE FUNCTION app.create_student(
  p_tenant_id uuid, p_email text, p_full_name text, p_password_hash text,
  p_external_auth_id text
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE new_id uuid;
  BEGIN
    INSERT INTO public.users
      (tenant_id, email, full_name, role, password_hash, external_auth_id)
    VALUES
      (p_tenant_id, lower(p_email), p_full_name, 'student',
       p_password_hash, p_external_auth_id)
    RETURNING id INTO new_id;
    RETURN new_id;
  END;
  $$;

CREATE OR REPLACE FUNCTION app.create_session(
  p_user_id uuid, p_token_hash text, p_expires_at timestamptz
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE new_id uuid;
  BEGIN
    DELETE FROM public.sessions WHERE expires_at < now();
    INSERT INTO public.sessions (user_id, token_hash, expires_at)
    VALUES (p_user_id, p_token_hash, p_expires_at)
    RETURNING id INTO new_id;
    RETURN new_id;
  END;
  $$;

CREATE OR REPLACE FUNCTION app.destroy_session(p_token_hash text)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    DELETE FROM public.sessions WHERE token_hash = p_token_hash;
  $$;

CREATE OR REPLACE FUNCTION app.touch_last_login(p_user_id uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.users SET last_login_at = now() WHERE id = p_user_id;
  $$;

REVOKE ALL ON FUNCTION app.resolve_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_signup_tenant(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_external_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.credential_for_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.create_student(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.create_session(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.destroy_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.touch_last_login(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.resolve_session(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.resolve_signup_tenant(text, text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.resolve_external_user(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.credential_for_login(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.create_student(uuid, text, text, text, text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.create_session(uuid, text, timestamptz) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.destroy_session(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.touch_last_login(uuid) TO skillgaps_app;

-- Sequences are unused (all ids are uuid), but keep future tables safe by
-- default: the app role gets nothing it was not explicitly granted.
ALTER DEFAULT PRIVILEGES FOR ROLE skillgaps_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM skillgaps_app;
