import { AppShell } from "@/components/app-shell";
import { SubjectReportCard } from "@/components/subject-report-card";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireTeachingStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { buildSubjectReports, listAssignments } from "@/lib/faculty/queries";
import { summarise } from "@/lib/faculty/subject-focus";

export const metadata = { title: "My classes" };
export const dynamic = "force-dynamic";

export default async function FacultyPage() {
  const user = await requireTeachingStaff();

  const reports = await withRequestContext(user, async (tx) => {
    const assignments = await listAssignments(tx, { facultyId: user.userId });
    return buildSubjectReports(tx, assignments);
  });

  const everyArea = reports.flatMap((r) => r.areas);

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">My classes</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        The gaps in the subjects you teach, for the sections you teach them to.
        This is the same data behind the placement dashboard, narrowed to your
        own syllabus — so you and the placement office are never looking at two
        different numbers for one class.
      </p>

      {reports.length === 0 ? (
        <Empty>
          No classes are assigned to you yet. Your placement office assigns
          teaching from <strong>Admin → Teaching</strong>; ask them to add your
          subjects and sections.
        </Empty>
      ) : (
        <>
          <div className="mb-6">
            <Alert tone="info">{summarise(everyArea)}</Alert>
          </div>

          <div className="mb-6">
            <Card>
              <p className="text-sm text-ink-600">
                Two things this page will not do. It does not name individual
                students — a class-level pattern is what a syllabus can answer,
                and a name is the placement office&rsquo;s to act on. And the
                hiring bars it compares against are still{" "}
                <strong>provisional</strong>: they are informed estimates, not
                validated thresholds, until there is enough placement data to
                calibrate them.
              </p>
            </Card>
          </div>

          <SectionHeading
            title={`Your subjects (${reports.length})`}
            hint="Weakest area first within each subject."
          />
          <div className="space-y-4">
            {reports.map((report) => (
              <SubjectReportCard key={report.assignment.id} report={report} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
