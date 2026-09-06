-- ===========================================================================
-- Employer signup crashed on its own follow-up read.
--
-- `app.create_employer_user` returned only the new user id, so the caller ran
-- a second query to find that user's tenant. That query used the unscoped
-- connection — no identity GUCs are set yet during signup — so the `users`
-- policy correctly returned zero rows, and the caller dereferenced row [0] of
-- an empty array: "Cannot read properties of undefined (reading 'tenant_id')".
--
-- The fix is to stop asking twice. The function already knows the tenant it
-- inserted, so it returns it. Same shape as `app.create_student`'s caller,
-- which never needed a follow-up read because signup supplied the tenant.
-- ===========================================================================

DROP FUNCTION IF EXISTS app.create_employer_user(uuid, text, text, text);
CREATE FUNCTION app.create_employer_user(
  p_employer_id uuid, p_email text, p_full_name text, p_password_hash text
) RETURNS TABLE (user_id uuid, tenant_id uuid)
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

    RETURN QUERY SELECT new_id, org_tenant;
  END;
  $$;

REVOKE ALL ON FUNCTION app.create_employer_user(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_employer_user(uuid, text, text, text) TO skillgaps_app;
