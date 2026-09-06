"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createDataRequestAction,
  type DataRequestState,
} from "@/lib/privacy/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Sending…" : label}
    </Button>
  );
}

export function DataRequestForm({ hasPending }: { hasPending: boolean }) {
  const [state, formAction] = useActionState<DataRequestState, FormData>(
    createDataRequestAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="What would you like us to do?">
        <select name="type" className={inputClass} defaultValue="export">
          <option value="export">Send me a copy of my data</option>
          <option value="delete">Delete my data</option>
        </select>
      </Field>
      <Field label="Anything you want to add?" hint="Optional.">
        <textarea name="studentNote" rows={3} className={inputClass} />
      </Field>
      <Submit label="Submit request" />
      {hasPending ? (
        <p className="text-xs text-ink-600">
          You already have a request open. A new one of the same type will not
          be created until that is resolved.
        </p>
      ) : null}
    </form>
  );
}
