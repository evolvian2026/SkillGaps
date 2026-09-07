-- ===========================================================================
-- Roster invitations.
--
-- A TPO imports a roster; that creates invitations, never accounts. Consent
-- under the DPDP Act must be the student's own act — `consent_records` already
-- refuses a write by anyone but the subject — so minting accounts from a CSV
-- would produce users with no consent record at all.
--
-- Two identity states matter here and they are opposites:
--
--   * staff manage invitations inside their own tenant, under ordinary RLS
--   * a student redeeming a link has NO identity yet — no user id, no tenant,
--     no role — so redemption cannot go through a row policy at all and runs
--     as a SECURITY DEFINER function instead, the same shape as signup
-- ===========================================================================

ALTER TABLE public.roster_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_invitations FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.roster_invitations TO skillgaps_app;

/*
 * Staff see and manage their own institution's roster, and nobody else's.
 *
 * Deliberately no student policy: a student never reads this table. They
 * arrive holding a token and go through `app.redeem_roster_invitation`, which
 * looks up by hash. Granting students a read here would turn the roster into a
 * directory of their classmates' email addresses.
 */
DROP POLICY IF EXISTS roster_staff_read ON public.roster_invitations;
CREATE POLICY roster_staff_read ON public.roster_invitations FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS roster_staff_insert ON public.roster_invitations;
CREATE POLICY roster_staff_insert ON public.roster_invitations FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

DROP POLICY IF EXISTS roster_staff_update ON public.roster_invitations;
CREATE POLICY roster_staff_update ON public.roster_invitations FOR UPDATE
  USING (tenant_id = app.current_tenant_id() AND app.is_staff())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.is_staff());

-- ---------------------------------------------------------------------------
-- Redemption.
-- ---------------------------------------------------------------------------

/*
 * What a join link shows before the student commits to anything.
 *
 * Returns the institution and the roster details the student should recognise,
 * so they can tell a real invitation from a stray link. Never returns the
 * email of anyone else, and returns nothing at all for a token that is
 * unknown, already redeemed, revoked or expired — the caller cannot
 * distinguish those cases, so a guessed token leaks no signal about whether it
 * ever existed.
 */
CREATE OR REPLACE FUNCTION app.roster_invitation_preview(p_token_hash text)
  RETURNS TABLE (
    email text,
    full_name text,
    roll_number text,
    branch text,
    section text,
    batch_year integer,
    tenant_name text
  )
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT i.email, i.full_name, i.roll_number, i.branch, i.section,
           i.batch_year, t.name
    FROM public.roster_invitations i
    JOIN public.tenants t ON t.id = i.tenant_id
    WHERE i.token_hash = p_token_hash
      AND i.status = 'pending'
      AND i.expires_at > now();
  $$;

/*
 * Turns a pending invitation into a student account.
 *
 * Returns the new user AND the tenant, because the caller has no identity yet
 * and so cannot read `users` back afterwards — RLS would correctly return
 * nothing and leave it dereferencing an empty result.
 *
 * The UPDATE ... WHERE status = 'pending' is the concurrency guard: two
 * simultaneous redemptions of one link serialise on the row, and the loser
 * matches nothing and raises. A link is therefore single-use even under a
 * double-submit.
 *
 * The role is hard-coded to 'student'. Nothing a redeemer supplies can change
 * which kind of account this mints.
 */
CREATE OR REPLACE FUNCTION app.redeem_roster_invitation(
  p_token_hash text, p_password_hash text
) RETURNS TABLE (user_id uuid, tenant_id uuid, email text, full_name text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DECLARE
    inv public.roster_invitations%ROWTYPE;
    new_id uuid;
  BEGIN
    UPDATE public.roster_invitations
       SET status = 'accepted', accepted_at = now(), updated_at = now()
     WHERE token_hash = p_token_hash
       AND status = 'pending'
       AND expires_at > now()
    RETURNING * INTO inv;

    IF inv.id IS NULL THEN
      RAISE EXCEPTION 'invitation_not_redeemable'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.users
      (tenant_id, email, full_name, role, password_hash)
    VALUES
      (inv.tenant_id, lower(inv.email), inv.full_name, 'student', p_password_hash)
    RETURNING id INTO new_id;

    -- The cohort attributes the institution is authoritative for. The student
    -- never types these, so a roster stays consistent with the registry.
    INSERT INTO public.student_profiles
      (user_id, tenant_id, roll_number, branch, section, batch_year)
    VALUES
      (new_id, inv.tenant_id, inv.roll_number, inv.branch, inv.section,
       inv.batch_year);

    UPDATE public.roster_invitations
       SET accepted_user_id = new_id WHERE id = inv.id;

    RETURN QUERY SELECT new_id, inv.tenant_id, lower(inv.email), inv.full_name;
  END;
  $$;

REVOKE ALL ON FUNCTION app.roster_invitation_preview(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.redeem_roster_invitation(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.roster_invitation_preview(text) TO skillgaps_app;
GRANT EXECUTE ON FUNCTION app.redeem_roster_invitation(text, text) TO skillgaps_app;
