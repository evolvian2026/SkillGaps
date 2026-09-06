"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveSubjectAction, type SyllabusState } from "@/lib/curriculum/actions";
import { Alert, Button, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save subject"}
    </Button>
  );
}

export function SyllabusForm() {
  const [state, action] = useActionState<SyllabusState, FormData>(
    saveSubjectAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject name">
          <input
            name="name"
            required
            placeholder="Database Management Systems"
            className={inputClass}
          />
        </Field>
        <Field label="Subject code" hint="Optional.">
          <input name="code" placeholder="CS3401" className={inputClass} />
        </Field>
        <Field label="Branch" hint="Optional.">
          <input name="branch" placeholder="CSE" className={inputClass} />
        </Field>
        <Field label="Semester" hint="Optional.">
          <input name="semester" type="number" min={1} max={12} className={inputClass} />
        </Field>
      </div>

      <Field
        label="Topics covered"
        hint="One per line, or comma separated. Paste straight from your syllabus document."
      >
        <textarea
          name="topics"
          rows={8}
          required
          placeholder={"Joins and subqueries\nNormalization\nIndexing and query plans\nTransactions and ACID"}
          className={inputClass}
        />
      </Field>

      <Submit />
    </form>
  );
}
