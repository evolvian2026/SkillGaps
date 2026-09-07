"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  assignTeachingAction,
  removeTeachingAction,
  type TeachingState,
} from "@/lib/faculty/actions";
import { Alert, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Assigning…" : "Assign teaching"}
    </button>
  );
}

export function AssignTeachingForm({
  subjects,
  faculty,
  branches,
  sections,
  batchYears,
}: {
  subjects: { id: string; name: string; code: string | null }[];
  faculty: { id: string; fullName: string; email: string }[];
  branches: string[];
  sections: string[];
  batchYears: number[];
}) {
  const [state, action] = useActionState<TeachingState, FormData>(
    assignTeachingAction,
    {},
  );

  if (subjects.length === 0 || faculty.length === 0) {
    return (
      <Alert tone="info">
        {subjects.length === 0
          ? "Add a syllabus subject first — teaching is assigned against a subject's topic list."
          : "No faculty accounts exist yet. Staff accounts are created by your institution."}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject">
          <select name="subjectId" required className={inputClass}>
            <option value="">Choose…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Taught by">
          <select name="facultyId" required className={inputClass}>
            <option value="">Choose…</option>
            {faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fullName} — {f.email}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Branch" hint="Leave blank for all.">
          <select name="branch" className={inputClass}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section" hint="Leave blank for all.">
          <select name="section" className={inputClass}>
            <option value="">All sections</option>
            {sections.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Batch year" hint="Leave blank for all.">
          <select name="batchYear" className={inputClass}>
            <option value="">All batches</option>
            {batchYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Submit />
      <p className="text-xs text-ink-600">
        A lecturer sees results only for the cohort assigned here. They cannot
        assign it themselves — that is why this page is yours and not theirs.
      </p>
    </form>
  );
}

export function RemoveTeachingButton({ id }: { id: string }) {
  return (
    <form action={removeTeachingAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100"
      >
        Remove
      </button>
    </form>
  );
}
