-- ===========================================================================
-- Employer identity plumbing.
--
-- The session-resolution functions from Phase 1 now also return the caller's
-- employer id, so `withRequestContext` can set `app.employer_id` and the
-- employer policies have something to key on. Redefined rather than added to,
-- because a partial rollout — policies live, identity absent — would silently
-- deny every employer instead of failing loudly.
-- ===========================================================================

DROP FUNCTION IF EXISTS app.resolve_session(text);
CREATE FUNCTION app.resolve_session(p_token_hash text)
  RETURNS TABLE (
    user_id uuid, tenant_id uuid, user_role text,
    email text, full_name text, session_id uuid, employer_id uuid
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.email, u.full_name, s.id,
           u.employer_id
    FROM public.sessions s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.token_hash = p_token_hash
      AND s.expires_at > now()
      AND u.is_active
      AND (SELECT t.is_active FROM public.tenants t WHERE t.id = u.tenant_id);
  $$;

DROP FUNCTION IF EXISTS app.credential_for_login(text);
CREATE FUNCTION app.credential_for_login(p_email text)
  RETURNS TABLE (
    user_id uuid, tenant_id uuid, user_role text,
    full_name text, password_hash text, employer_id uuid
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.full_name, u.password_hash,
           u.employer_id
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE lower(u.email) = lower(p_email) AND u.is_active AND t.is_active;
  $$;

DROP FUNCTION IF EXISTS app.resolve_external_user(text);
CREATE FUNCTION app.resolve_external_user(p_external_auth_id text)
  RETURNS TABLE (
    user_id uuid, tenant_id uuid, user_role text,
    email text, full_name text, employer_id uuid
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.email, u.full_name, u.employer_id
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE u.external_auth_id = p_external_auth_id
      AND u.is_active AND t.is_active;
  $$;

-- Background jobs never run as an employer, but the shape must match so the
-- worker's context helper has the column to read.
DROP FUNCTION IF EXISTS app.job_context(uuid);
CREATE FUNCTION app.job_context(p_user_id uuid)
  RETURNS TABLE (user_id uuid, tenant_id uuid, user_role text, employer_id uuid)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT u.id, u.tenant_id, u.role::text, u.employer_id
    FROM public.users u
    JOIN public.tenants t ON t.id = u.tenant_id
    WHERE u.id = p_user_id AND u.is_active AND t.is_active;
  $$;

/*
 * Create an employer user.
 *
 * Mirrors app.create_student: the role is hard-coded here so that signing up
 * through the employer form cannot mint a student, staff or super-admin
 * account, whatever the request body says.
 */
CREATE OR REPLACE FUNCTION app.create_employer_user(
  p_employer_id uuid, p_email text, p_full_name text, p_password_hash text
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE
    new_id uuid;
    org_tenant uuid;
  BEGIN
    SELECT e.tenant_id INTO org_tenant
    FROM public.employers e WHERE e.id = p_employer_id AND e.is_active;

    IF org_tenant IS NULL THEN
      RAISE EXCEPTION 'Employer % has no organisation tenant', p_employer_id;
    END IF;

    INSERT INTO public.users
      (tenant_id, email, full_name, role, password_hash, employer_id)
    VALUES
      (org_tenant, lower(p_email), p_full_name, 'employer', p_password_hash,
       p_employer_id)
    RETURNING id INTO new_id;
    RETURN new_id;
  END;
  $$;

REVOKE ALL ON FUNCTION app.resolve_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.credential_for_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_external_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.job_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.create_employer_user(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.resolve_session(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.credential_for_login(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.resolve_external_user(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.job_context(uuid) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.create_employer_user(uuid, text, text, text) TO skillgaps_app;
