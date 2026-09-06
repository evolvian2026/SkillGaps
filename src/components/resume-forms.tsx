"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createJobDescriptionAction,
  uploadResumeAction,
  type UploadState,
} from "@/lib/matching/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function ResumeUploadForm({ retentionDays }: { retentionDays: number }) {
  const [state, action] = useActionState<UploadState, FormData>(
    uploadResumeAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field
        label="Your resume"
        hint="PDF or plain text, up to 5 MB. A text-based PDF works best — a scan cannot be read."
      >
        <input
          type="file"
          name="resume"
          accept=".pdf,.txt,.md,application/pdf,text/plain"
          required
          className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </Field>

      <p className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
        We keep your resume for {retentionDays} days and then delete it
        automatically. Your college&apos;s placement staff can see your match
        score, but not the file itself or its contents.
      </p>

      <Submit label="Upload resume" />
    </form>
  );
}

export function JobDescriptionForm({ canShare }: { canShare: boolean }) {
  const [state, action] = useActionState<UploadState, FormData>(
    createJobDescriptionAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Role title">
        <input name="title" required placeholder="Data Analyst" className={inputClass} />
      </Field>
      <Field label="Company" hint="Optional.">
        <input name="company" className={inputClass} />
      </Field>
      <Field
        label="Job description"
        hint="Paste the whole posting, including the requirements section."
      >
        <textarea name="rawText" rows={10} required className={inputClass} />
      </Field>

      {canShare ? (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
          <input
            type="checkbox"
            name="isShared"
            className="mt-0.5 h-4 w-4 rounded border-ink-400 text-brand-600"
          />
          <span>Share this with every student at my institution</span>
        </label>
      ) : null}

      <Submit label="Save job description" />
    </form>
  );
}
