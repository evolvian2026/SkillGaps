"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  commitRosterAction,
  previewRosterAction,
  type RosterState,
} from "@/lib/roster/actions";
import { ROSTER_TEMPLATE } from "@/lib/roster/csv";
import { INVITATION_TTL_DAYS, type IssuedLink } from "@/lib/roster/shared";
import { Alert, Card, inputClass } from "./ui";

const ACTION_LABEL: Record<string, string> = {
  invite: "Invite",
  update: "Update",
  reinvite: "Reissue",
  skip_registered: "Skip",
};

const ACTION_TONE: Record<string, string> = {
  invite: "bg-good-100 text-good-500",
  update: "bg-brand-100 text-brand-700",
  reinvite: "bg-warn-100 text-warn-500",
  skip_registered: "bg-ink-100 text-ink-600",
};

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}

/**
 * Downloads a blob the browser builds, rather than a server round trip.
 *
 * The links exist only in this response — they are stored hashed — so there is
 * no URL that could serve them again.
 */
function download(filename: string, body: string) {
  const blob = new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function LinksPanel({ links, origin }: { links: IssuedLink[]; origin: string }) {
  if (links.length === 0) return null;

  const rows = links.map((l) => ({
    name: l.fullName,
    email: l.email,
    link: `${origin}/join/${l.token}`,
  }));

  return (
    <Card className="mt-4">
      <h3 className="font-semibold">
        {links.length} join {links.length === 1 ? "link" : "links"} — download them now
      </h3>
      <p className="mt-1 text-sm text-ink-600">
        We store only a hash of each link, so a database breach yields nothing
        usable — and for the same reason <strong>we cannot show these to you
        again</strong>. Download the file and mail-merge it to your students. If
        you lose it, you can reissue a link per student, which invalidates the
        old one. Links expire after {INVITATION_TTL_DAYS} days.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            download(
              `skillgaps-join-links-${new Date().toISOString().slice(0, 10)}.csv`,
              [
                ["Name", "Email", "Join link"].map(csvField).join(","),
                ...rows.map((r) => [r.name, r.email, r.link].map(csvField).join(",")),
              ].join("\r\n"),
            )
          }
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Download links (CSV)
        </button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-600">
          Show the first few
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-ink-600">
          {rows.slice(0, 5).map((r) => (
            <li key={r.email} className="break-all">
              <span className="font-medium text-ink-800">{r.email}</span> — {r.link}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export function RosterImport({ origin }: { origin: string }) {
  const [preview, previewAction] = useActionState<RosterState, FormData>(
    previewRosterAction,
    {},
  );
  const [commit, commitAction] = useActionState<RosterState, FormData>(
    commitRosterAction,
    {},
  );
  const [showAllRows, setShowAllRows] = useState(false);

  const result = commit.result;
  const counts = preview.preview?.counts;
  const rows = preview.preview?.classified ?? [];
  const visible = showAllRows ? rows : rows.slice(0, 25);
  const willWrite = counts
    ? counts.invite + counts.update + counts.reinvite
    : 0;

  // Once committed, the preview is stale — show the outcome instead.
  if (result) {
    return (
      <div>
        <Alert tone="success">
          Imported: {result.invited} invited, {result.reinvited} reissued,{" "}
          {result.updated} updated, {result.skipped} left alone.
        </Alert>
        {result.failed.length > 0 ? (
          <div className="mt-3">
            <Alert>
              {result.failed.length} row{result.failed.length === 1 ? "" : "s"}{" "}
              could not be imported:
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {result.failed.slice(0, 10).map((f) => (
                  <li key={f.email}>
                    {f.email} — {f.message}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}
        <LinksPanel links={result.links} origin={origin} />
        <p className="mt-4">
          <a href="/admin/roster" className="text-sm font-medium text-brand-600 hover:underline">
            Import another file
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      {!preview.preview ? (
        <form action={previewAction} className="space-y-4">
          {preview.error ? <Alert>{preview.error}</Alert> : null}

          <div>
            <label htmlFor="file" className="mb-1 block text-sm font-medium">
              Roster file (CSV)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-ink-200"
            />
            <p className="mt-1.5 text-xs text-ink-600">
              A header row plus one row per student. We read{" "}
              <strong>Name</strong> and <strong>Email</strong> (both required),
              and <strong>Roll number</strong>, <strong>Branch</strong>,{" "}
              <strong>Section</strong> and <strong>Batch year</strong> when they
              are present. Common spellings of each are recognised, and columns
              we do not know are ignored rather than rejected.
            </p>
          </div>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-ink-600">
              Or paste rows instead
            </summary>
            <textarea
              name="pasted"
              rows={6}
              placeholder={ROSTER_TEMPLATE}
              className={`${inputClass} mt-2 font-mono text-xs`}
            />
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <Submit label="Check the file" busy="Reading…" />
            <button
              type="button"
              onClick={() => download("skillgaps-roster-template.csv", ROSTER_TEMPLATE)}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Download a template
            </button>
          </div>
        </form>
      ) : (
        <div>
          {counts ? (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["invite", "New invitations"],
                  ["reinvite", "Fresh links"],
                  ["update", "Details updated"],
                  ["skip_registered", "Already joined"],
                ] as const
              ).map(([key, label]) => (
                <Card key={key}>
                  <p
                    className="text-2xl font-semibold tabular-nums"
                    data-testid={`roster-count-${key}`}
                  >
                    {counts[key]}
                  </p>
                  <p className="text-xs text-ink-600">{label}</p>
                </Card>
              ))}
            </div>
          ) : null}

          {preview.preview.errors.length > 0 ? (
            <div className="mb-4">
              <Alert tone="info">
                {preview.preview.errors.length} row
                {preview.preview.errors.length === 1 ? "" : "s"} will be skipped:
                <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                  {preview.preview.errors.slice(0, 25).map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}

          {preview.preview.ignoredColumns.length > 0 ? (
            <p className="mb-4 text-xs text-ink-600">
              Columns ignored: {preview.preview.ignoredColumns.join(", ")}.
            </p>
          ) : null}

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Roll</th>
                  <th className="px-4 py-2 font-medium">Branch</th>
                  <th className="px-4 py-2 font-medium">Batch</th>
                  <th className="px-4 py-2 font-medium">What happens</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.row.email} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-ink-800">{c.row.fullName}</td>
                    <td className="px-4 py-2 text-ink-600">{c.row.email}</td>
                    <td className="px-4 py-2 text-ink-600">{c.row.rollNumber ?? "—"}</td>
                    <td className="px-4 py-2 text-ink-600">{c.row.branch ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-ink-600">
                      {c.row.batchYear ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_TONE[c.action]}`}
                        title={c.reason}
                      >
                        {ACTION_LABEL[c.action]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {rows.length > visible.length ? (
            <button
              type="button"
              onClick={() => setShowAllRows(true)}
              className="mt-2 text-sm font-medium text-brand-600 hover:underline"
            >
              Show all {rows.length} rows
            </button>
          ) : null}

          <form action={commitAction} className="mt-5 flex flex-wrap items-center gap-3">
            {commit.error ? (
              <div className="w-full">
                <Alert>{commit.error}</Alert>
              </div>
            ) : null}
            <input
              type="hidden"
              name="rows"
              value={JSON.stringify(rows.map((c) => c.row))}
            />
            <Submit
              label={`Import ${willWrite} student${willWrite === 1 ? "" : "s"}`}
              busy="Importing…"
            />
            <a href="/admin/roster" className="text-sm font-medium text-ink-600 hover:underline">
              Start over
            </a>
          </form>
          <p className="mt-2 text-xs text-ink-600">
            Nothing has been written yet. No email is sent by the platform — you
            get a file of links to send however you already reach your students.
          </p>
        </div>
      )}
    </div>
  );
}
