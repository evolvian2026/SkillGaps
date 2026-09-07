import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { loadStudentRows } from "@/lib/admin/cohort";
import { parseCohortFilters } from "@/lib/admin/filters";

export const dynamic = "force-dynamic";

/**
 * Escapes one CSV field.
 *
 * The leading apostrophe on formula-triggering characters stops a spreadsheet
 * from evaluating a field that starts with =, +, - or @ — student-supplied
 * names reach this file, and CSV injection is the classic way that turns into
 * a problem on the TPO's machine.
 */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  // The placement office only. This export carries every student's placement
  // status and readiness score, which is the office's business and not a
  // lecturer's — they get their own classes' gaps on /faculty instead.
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const filters = parseCohortFilters(new URL(request.url).searchParams);
  const rows = await withRequestContext(user, (tx) => loadStudentRows(tx, filters));

  const header = [
    "Name",
    "Email",
    "Roll number",
    "Branch",
    "Section",
    "Batch year",
    "Latest track",
    "Latest score (%)",
    "Readiness score",
    "Readiness components (of 3)",
    "Placement status",
    "Submitted attempts",
    "Last submitted",
    "Flagged attempts",
  ];

  const lines = [
    header.map(csvField).join(","),
    ...rows.map((row) =>
      [
        row.fullName,
        row.email,
        row.rollNumber,
        row.branch,
        row.section,
        row.batchYear,
        row.latestTrack,
        row.latestPercent,
        row.readinessScore,
        row.readinessComponents,
        row.placementStatus,
        row.attemptCount,
        row.latestSubmittedAt ? row.latestSubmittedAt.toISOString() : null,
        row.flaggedAttempts,
      ]
        .map(csvField)
        .join(","),
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 names correctly.
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="skillgaps-students-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
