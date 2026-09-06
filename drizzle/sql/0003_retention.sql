-- ===========================================================================
-- Retention sweep support.
--
-- The sweep is system-wide: it spans every tenant and belongs to no user, so
-- it cannot run under a student's RLS context the way other jobs do. Rather
-- than granting the worker BYPASSRLS — which would hand every job unrestricted
-- access just to serve this one — it gets two narrow SECURITY DEFINER
-- functions that expose only the retention columns and never student content.
-- ===========================================================================

CREATE OR REPLACE FUNCTION app.expired_resumes(p_limit integer DEFAULT 500)
  RETURNS TABLE (id uuid, storage_key text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT r.id, r.storage_key
    FROM public.resumes r
    WHERE r.retain_until <= now() AND r.purged_at IS NULL
    ORDER BY r.retain_until
    LIMIT LEAST(GREATEST(p_limit, 1), 1000);
  $$;

-- Clears the extracted text and marks the row purged. Deliberately cannot
-- write anything else, so a compromised worker cannot alter resume records.
CREATE OR REPLACE FUNCTION app.mark_resume_purged(p_resume_id uuid)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    UPDATE public.resumes
    SET status = 'purged', extracted_text = NULL, purged_at = now()
    WHERE id = p_resume_id AND purged_at IS NULL;
  $$;

REVOKE ALL ON FUNCTION app.expired_resumes(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mark_resume_purged(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expired_resumes(integer) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.mark_resume_purged(uuid) TO skillgaps_app;
