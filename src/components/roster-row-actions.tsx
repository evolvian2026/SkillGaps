"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  reissueInvitationAction,
  revokeInvitationAction,
  type ReissueState,
} from "@/lib/roster/actions";
import { Alert } from "./ui";

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100 disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}

/**
 * Reissue and revoke for one pending invitation.
 *
 * Reissue returns the new link inline, because it is the only moment it can be
 * shown — the stored value is a hash. The warning is on the button rather than
 * after it, since pressing it breaks a link the student may already have.
 */
export function RosterRowActions({
  invitationId,
  origin,
}: {
  invitationId: string;
  origin: string;
}) {
  const [state, action] = useActionState<ReissueState, FormData>(
    reissueInvitationAction,
    {},
  );

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={action}>
          <input type="hidden" name="id" value={invitationId} />
          <Pending label="New link" busy="…" />
        </form>
        <form action={revokeInvitationAction}>
          <input type="hidden" name="id" value={invitationId} />
          <Pending label="Revoke" busy="…" />
        </form>
      </div>

      {state.error ? <Alert>{state.error}</Alert> : null}

      {state.link ? (
        <div className="rounded-md border border-good-500/40 bg-good-100/50 p-2">
          <p className="text-xs font-medium text-ink-800">
            New link for {state.link.email} — copy it now, it is not shown again.
          </p>
          <code className="mt-1 block break-all text-[11px] text-ink-600">
            {origin}/join/{state.link.token}
          </code>
        </div>
      ) : null}
    </div>
  );
}
