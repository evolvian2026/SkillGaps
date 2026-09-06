"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  resolveDataRequestAction,
  type DataRequestState,
} from "@/lib/privacy/actions";
import { Alert, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Update"}
    </button>
  );
}

export function ResolveRequestForm({
  requestId,
  currentStatus,
}: {
  requestId: string;
  currentStatus: string;
}) {
  const [state, formAction] = useActionState<DataRequestState, FormData>(
    resolveDataRequestAction,
    {},
  );

  return (
    <form action={formAction} className="mt-3 space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {/* Success is confirmed page-level: this form unmounts when the request
          moves to the resolved list. */}
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-wrap items-end gap-2">
        <select
          name="status"
          defaultValue={currentStatus === "pending" ? "in_progress" : currentStatus}
          className={`${inputClass} max-w-[180px]`}
        >
          <option value="in_progress">Being actioned</option>
          <option value="completed">Completed</option>
          <option value="rejected">Declined</option>
        </select>
        <input
          name="resolutionNote"
          placeholder="Note (optional)"
          className={`${inputClass} max-w-xs flex-1`}
        />
        <Submit />
      </div>
    </form>
  );
}
