import { AppShell } from "@/components/app-shell";
import {
  AssignTeachingForm,
  RemoveTeachingButton,
} from "@/components/teaching-form";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requirePlacementStaff } from "@/lib/auth";
import { loadFilterOptions } from "@/lib/admin/cohort";
import { withRequestContext } from "@/lib/db/client";
import { assignableFaculty, listAssignments, listSubjects } from "@/lib/faculty/queries";

export const metadata = { title: "Teaching" };
export const dynamic = "force-dynamic";

const DONE_MESSAGE: Record<string, string> = {
  assigned: "Teaching assigned. That lecturer can now see this class.",
  removed: "Assignment removed. That class is no longer on their page.",
};

export default async function TeachingPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const { done } = await searchParams;
  const user = await requirePlacementStaff();

  const data = await withRequestContext(user, async (tx) => ({
    assignments: await listAssignments(tx),
    subjects: await listSubjects(tx),
    faculty: await assignableFaculty(tx),
    filters: await loadFilterOptions(tx),
  }));

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Teaching</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Who teaches which subject, to which section. This is what fills a
        lecturer&rsquo;s <strong>My classes</strong> page: without an assignment
        here they see nothing, and they cannot create one themselves.
      </p>

      {done && DONE_MESSAGE[done] ? (
        <div className="mb-4">
          <Alert tone="success">{DONE_MESSAGE[done]}</Alert>
        </div>
      ) : null}

      <SectionHeading title="Assign teaching" />
      <Card className="mb-8">
        <AssignTeachingForm
          subjects={data.subjects}
          faculty={data.faculty}
          branches={data.filters.branches}
          sections={data.filters.sections}
          batchYears={data.filters.batchYears}
        />
      </Card>

      <SectionHeading title={`Current assignments (${data.assignments.length})`} />
      {data.assignments.length === 0 ? (
        <Empty>
          Nothing assigned yet. Until you assign a subject, faculty accounts see
          an empty classes page.
        </Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-2 font-medium">Lecturer</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Branch</th>
                <th className="px-4 py-2 font-medium">Section</th>
                <th className="px-4 py-2 font-medium">Batch</th>
                <th className="px-4 py-2 font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((a) => (
                <tr key={a.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink-800">{a.facultyName}</span>
                    <span className="block text-xs text-ink-600">{a.facultyEmail}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {a.subjectName}
                    {a.subjectCode ? ` (${a.subjectCode})` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{a.branch ?? "All"}</td>
                  <td className="px-4 py-2.5 text-ink-600">{a.section ?? "All"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-600">
                    {a.batchYear ?? "All"}
                  </td>
                  <td className="px-4 py-2.5">
                    <RemoveTeachingButton id={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
