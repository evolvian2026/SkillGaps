"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { issueProfileAction, type ProfileState } from "@/lib/verification/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create verification link"}
    </Button>
  );
}

export function ProfileLinkForm() {
  const [state, action] = useActionState<ProfileState, FormData>(
    issueProfileAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}

      {state.shareUrl ? (
        <Alert tone="success">
          <p className="mb-2 font-medium">{state.message}</p>
          <code className="block break-all rounded bg-white/60 p-2 font-mono text-xs">
            {state.shareUrl}
          </code>
        </Alert>
      ) : null}

      <Field label="What is this link for?" hint="Optional — helps you tell your links apart.">
        <input
          name="label"
          placeholder="Acme Corp application"
          className={inputClass}
        />
      </Field>

      <Field
        label="Expires after"
        hint="Leave blank for no expiry. You can revoke a link at any time either way."
      >
        <select name="expiresInDays" defaultValue="90" className={inputClass}>
          <option value="">Never</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
        </select>
      </Field>

      <p className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
        The link shows your name, institution, assessment and interview results,
        and your readiness score. It does not show your email, your resume, or
        your answers. The results are frozen at the moment you create the link.
      </p>

      <Submit />
    </form>
  );
}
