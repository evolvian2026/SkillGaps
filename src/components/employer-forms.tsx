"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createAssessmentAction,
  decideAccessAction,
  requestAccessAction,
  type EmployerState,
} from "@/lib/employer/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function RequestAccessForm({
  institutions,
}: {
  institutions: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<EmployerState, FormData>(
    requestAccessAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Institution">
        <select name="tenantId" required className={inputClass}>
          <option value="">Choose an institution…</option>
          {institutions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Why are you requesting access?" hint="Optional, but it helps them decide.">
        <textarea name="note" rows={3} className={inputClass} />
      </Field>
      <Submit label="Request access" />
    </form>
  );
}

export function CreateAssessmentForm({
  tracks,
  grantedTenants,
}: {
  tracks: { id: string; name: string }[];
  grantedTenants: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<EmployerState, FormData>(
    createAssessmentAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Field label="Drive title">
        <input
          name="title"
          required
          placeholder="Acme 2026 Campus Drive — SDE"
          className={inputClass}
        />
      </Field>

      <Field
        label="Role track"
        hint="The assessment draws from this track's question bank, using the same engine students already take."
      >
        <select name="trackId" required className={inputClass}>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description" hint="Optional. Shown to students.">
        <textarea name="description" rows={3} className={inputClass} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-800">
          Open to
        </legend>
        {grantedTenants.length === 0 ? (
          <p className="text-sm text-ink-600">
            No institution has granted you access yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {grantedTenants.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="checkbox"
                  name="tenantIds"
                  value={t.id}
                  defaultChecked
                  className="h-4 w-4 rounded border-ink-400 text-brand-600"
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-xs text-ink-600">
          Only institutions that have granted you access appear here.
        </p>
      </fieldset>

      <Field label="Closes after" hint="Optional.">
        <select name="closesInDays" defaultValue="30" className={inputClass}>
          <option value="">No close date</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
        </select>
      </Field>

      <Submit label="Create assessment" />
    </form>
  );
}

export function AccessDecisionForm({
  grantId,
  employerName,
  currentStatus,
}: {
  grantId: string;
  employerName: string;
  currentStatus: string;
}) {
  const [state, action] = useActionState<EmployerState, FormData>(
    decideAccessAction,
    {},
  );

  return (
    <form action={action} className="mt-2 space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <input type="hidden" name="grantId" value={grantId} />
      <div className="flex flex-wrap items-center gap-2">
        {currentStatus !== "active" ? (
          <button
            type="submit"
            name="decision"
            value="active"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Grant access
          </button>
        ) : null}
        {currentStatus !== "revoked" ? (
          <button
            type="submit"
            name="decision"
            value="revoked"
            className="rounded-lg border border-risk-500 px-3 py-1.5 text-sm font-semibold text-risk-500 hover:bg-risk-100"
          >
            {currentStatus === "active" ? "Revoke access" : "Decline"}
          </button>
        ) : null}
        <span className="text-xs text-ink-600">for {employerName}</span>
      </div>
    </form>
  );
}
