import { asc, eq } from "drizzle-orm";
import { EmployerShell } from "@/components/employer-shell";
import { CreateAssessmentForm } from "@/components/employer-forms";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { tracks } from "@/lib/db/schema";
import {
  employerProfile,
  listAssessments,
  listGrants,
} from "@/lib/employer/queries";
import { toggleAssessmentAction } from "@/lib/employer/actions";

export const metadata = { title: "Assessments" };
export const dynamic = "force-dynamic";

export default async function EmployerAssessmentsPage() {
  const user = await requireEmployer();

  const data = await withRequestContext(user, async (tx) => ({
    employer: await employerProfile(tx, user.employerId),
    assessments: await listAssessments(tx, user.employerId),
    grants: await listGrants(tx),
    availableTracks: await tx
      .select({ id: tracks.id, name: tracks.name })
      .from(tracks)
      .where(eq(tracks.isActive, true))
      .orderBy(asc(tracks.displayOrder)),
  }));

  const grantedTenants = data.grants
    .filter((g) => g.status === "active")
    .map((g) => ({ id: g.tenantId, name: g.tenantName }));

  return (
    <EmployerShell user={user} employerName={data.employer?.name ?? "Employer"}>
      <h1 className="mb-1 text-2xl font-semibold">Assessments</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Create a campus-drive assessment from the shared question bank. Students
        take it through the same engine, with the same randomisation and
        integrity measures as any other assessment.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          You see that a student in a granted cohort sat your assessment and how
          the cohort performed. Seeing who they are still requires that student
          to share a profile with you.
        </Alert>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Create an assessment" />
          <CreateAssessmentForm
            tracks={data.availableTracks}
            grantedTenants={grantedTenants}
          />
        </Card>

        <div>
          <SectionHeading title="Your assessments" />
          {data.assessments.length === 0 ? (
            <Empty>You have not created an assessment yet.</Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-ink-100">
                {data.assessments.map((assessment) => (
                  <li key={assessment.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{assessment.title}</p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          {assessment.trackName} · {assessment.attemptCount}{" "}
                          {assessment.attemptCount === 1 ? "attempt" : "attempts"}
                          {assessment.closesAt
                            ? ` · closes ${assessment.closesAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                            : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          Open to{" "}
                          {assessment.tenantIds.length === 0
                            ? "every granted institution"
                            : `${assessment.tenantIds.length} institution(s)`}
                        </p>
                      </div>
                      <form action={toggleAssessmentAction} className="shrink-0">
                        <input
                          type="hidden"
                          name="assessmentId"
                          value={assessment.id}
                        />
                        <input
                          type="hidden"
                          name="isActive"
                          value={String(!assessment.isActive)}
                        />
                        <button
                          type="submit"
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            assessment.isActive
                              ? "bg-good-100 text-good-500"
                              : "bg-ink-100 text-ink-600"
                          }`}
                        >
                          {assessment.isActive ? "Open — click to close" : "Closed"}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </EmployerShell>
  );
}
