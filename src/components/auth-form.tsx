"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CONSENT_NOTICE, CONSENT_SUMMARY_POINTS } from "@/lib/privacy/consent";
import type { AuthFormState } from "@/lib/auth/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Please wait…" : label}
    </Button>
  );
}

type Action = (state: AuthFormState, form: FormData) => Promise<AuthFormState>;

export function LoginForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.values?.email}
          className={inputClass}
        />
      </Field>
      <Field label="Password">
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <Submit label="Sign in" />
      <p className="text-center text-sm text-ink-600">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create a student account
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="Full name">
        <input
          name="fullName"
          required
          autoComplete="name"
          defaultValue={state.values?.fullName}
          className={inputClass}
        />
      </Field>
      <Field
        label="Email"
        hint="Use your college email if you have one — it matches you to your university automatically."
      >
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.values?.email}
          className={inputClass}
        />
      </Field>
      <Field
        label="Invite code"
        hint="Required only if you are signing up with a personal email address."
      >
        <input
          name="inviteCode"
          autoComplete="off"
          defaultValue={state.values?.inviteCode}
          className={inputClass}
        />
      </Field>
      <Field label="Password" hint="At least 10 characters, with a letter and a number.">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <fieldset className="rounded-lg border border-ink-200 bg-ink-50 p-4">
        <legend className="px-1 text-sm font-semibold text-ink-800">
          What we collect, and why
        </legend>
        <ul className="mb-3 space-y-1.5 text-sm text-ink-600">
          {CONSENT_SUMMARY_POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="text-brand-600">
                •
              </span>
              {point}
            </li>
          ))}
        </ul>
        <details className="mb-3">
          <summary className="cursor-pointer text-sm font-medium text-brand-600">
            Read the full notice
          </summary>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-600">
            {CONSENT_NOTICE}
          </p>
        </details>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 h-4 w-4 rounded border-ink-400 text-brand-600"
          />
          <span>
            I have read the notice above and I consent to my data being collected
            and used as described.
          </span>
        </label>
      </fieldset>

      <Submit label="Create account" />
      <p className="text-center text-sm text-ink-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
