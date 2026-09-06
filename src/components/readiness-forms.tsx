"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveOutcomeAction,
  saveReadinessWeightsAction,
  type SettingsState,
} from "@/lib/readiness/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function WeightsForm({
  current,
}: {
  current: { diagnostic: number; interview: number; resume: number };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(
    saveReadinessWeightsAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Diagnostic">
          <input
            name="diagnostic"
            type="number"
            min={0}
            max={100}
            step={5}
            defaultValue={Math.round(current.diagnostic * 100)}
            className={inputClass}
          />
        </Field>
        <Field label="Mock interview">
          <input
            name="interview"
            type="number"
            min={0}
            max={100}
            step={5}
            defaultValue={Math.round(current.interview * 100)}
            className={inputClass}
          />
        </Field>
        <Field label="Resume match">
          <input
            name="resume"
            type="number"
            min={0}
            max={100}
            step={5}
            defaultValue={Math.round(current.resume * 100)}
            className={inputClass}
          />
        </Field>
      </div>

      <p className="rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
        These need not add up to 100 — they are scaled automatically. Set a
        component to 0 if your institution does not use it; students will not be
        penalised for a component they were never offered. Saving recomputes
        every student&apos;s score.
      </p>

      <Submit label="Save weights" />
    </form>
  );
}

const STATUSES = [
  { value: "unknown", label: "Not known yet" },
  { value: "placed", label: "Placed" },
  { value: "not_placed", label: "Not placed" },
  { value: "higher_studies", label: "Higher studies" },
  { value: "opted_out", label: "Opted out of placements" },
];

export function OutcomeForm({
  userId,
  studentName,
  current,
}: {
  userId: string;
  studentName?: string;
  current?: {
    status: string;
    role: string | null;
    company: string | null;
    companyAnonymised: boolean;
    packageBand: string | null;
  } | null;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(
    saveOutcomeAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <input type="hidden" name="userId" value={userId} />

      {studentName ? (
        <p className="text-sm font-medium text-ink-800">{studentName}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <select
            name="status"
            defaultValue={current?.status ?? "unknown"}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role" hint="Optional.">
          <input
            name="role"
            defaultValue={current?.role ?? ""}
            placeholder="Software Engineer"
            className={inputClass}
          />
        </Field>
        <Field label="Company" hint="Optional.">
          <input
            name="company"
            defaultValue={current?.company ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Package band" hint="Optional. A band, not an exact figure.">
          <select
            name="packageBand"
            defaultValue={current?.packageBand ?? ""}
            className={inputClass}
          >
            <option value="">Not recorded</option>
            <option value="under_5">Under ₹5 LPA</option>
            <option value="5_10">₹5–10 LPA</option>
            <option value="10_20">₹10–20 LPA</option>
            <option value="over_20">Over ₹20 LPA</option>
          </select>
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
        <input
          type="checkbox"
          name="companyAnonymised"
          defaultChecked={current?.companyAnonymised ?? false}
          className="mt-0.5 h-4 w-4 rounded border-ink-400 text-brand-600"
        />
        <span>
          Withhold the company name from reports — only the anonymised band is
          used
        </span>
      </label>

      <Field label="Notes" hint="Optional.">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>

      <Submit label="Record outcome" />
    </form>
  );
}
