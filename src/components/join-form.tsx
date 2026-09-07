"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinAction, type JoinState } from "@/lib/roster/actions";
import { CONSENT_SUMMARY_POINTS } from "@/lib/privacy/consent";
import { Alert, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Creating your account…" : "Create my account"}
    </button>
  );
}

/**
 * Redeeming a roster invitation.
 *
 * The student's name and cohort details came from their institution and are
 * shown read-only: they are what the college is authoritative for, and letting
 * them be edited here would quietly desynchronise the roster. What the student
 * supplies is exactly what only they can — a password, and consent.
 */
export function JoinForm({
  token,
  email,
  fullName,
  details,
}: {
  token: string;
  email: string;
  fullName: string;
  details: { label: string; value: string }[];
}) {
  const [state, action] = useActionState<JoinState, FormData>(joinAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />

      <div className="rounded-lg border border-ink-200 bg-ink-100/40 p-3">
        <p className="text-sm font-medium text-ink-800">{fullName}</p>
        <p className="text-sm text-ink-600">{email}</p>
        {details.length > 0 ? (
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
            {details.map((d) => (
              <div key={d.label}>
                <dt className="inline font-medium">{d.label}: </dt>
                <dd className="inline">{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="mt-2 text-xs text-ink-600">
          These came from your college. If anything is wrong, tell your placement
          office — they can correct it.
        </p>
      </div>

      <Field label="Choose a password" hint="At least 12 characters.">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      <div className="rounded-lg border border-ink-200 p-3">
        <p className="text-sm font-medium">What we collect, and who sees it</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-600">
          {CONSENT_SUMMARY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" className="mt-0.5" />
          <span>
            I have read the{" "}
            <a href="/privacy" target="_blank" className="text-brand-600 hover:underline">
              privacy notice
            </a>{" "}
            and agree to my data being processed as described.
          </span>
        </label>
        <p className="mt-2 text-xs text-ink-600">
          Your college invited you, but only you can give this consent. You can
          withdraw it, and export or delete your data, from your account page at
          any time.
        </p>
      </div>

      <Submit />
    </form>
  );
}
