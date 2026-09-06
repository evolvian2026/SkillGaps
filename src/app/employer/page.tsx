import Link from "next/link";
import { EmployerShell } from "@/components/employer-shell";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  candidatePool,
  employerProfile,
  listAssessments,
  listGrants,
  optedInCandidates,
} from "@/lib/employer/queries";

export const metadata = { title: "Employer overview" };
export const dynamic = "force-dynamic";

export default async function EmployerHomePage() {
  const user = await requireEmployer();

  const data = await withRequestContext(user, async (tx) => ({
    employer: await employerProfile(tx, user.employerId),
    grants: await listGrants(tx),
    pool: await candidatePool(tx),
    candidates: await optedInCandidates(tx, user.employerId),
    assessments: await listAssessments(tx, user.employerId),
  }));

  const active = data.grants.filter((g) => g.status === "active");
  const pooled = data.pool.reduce((sum, b) => sum + b.studentCount, 0);

  return (
    <EmployerShell user={user} employerName={data.employer?.name ?? "Employer"}>
      <h1 className="mb-1 text-2xl font-semibold">
        {data.employer?.name ?? "Employer"}
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        You see anonymised cohort data for institutions that have granted you
        access, and named profiles only for students who have chosen to share
        one with you.
      </p>

      {active.length === 0 ? (
        <div className="mb-6">
          <Alert tone="info">
            You do not have access to any institution yet.{" "}
            <Link href="/employer/access" className="font-semibold underline">
              Request access
            </Link>{" "}
            — a university decides whether to approve it.
          </Alert>
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Institutions</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{active.length}</p>
          <p className="mt-0.5 text-xs text-ink-600">with active access</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">
            Anonymised pool
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{pooled}</p>
          <p className="mt-0.5 text-xs text-ink-600">counted across buckets</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">
            Shared profiles
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {data.candidates.length}
          </p>
          <p className="mt-0.5 text-xs text-ink-600">students opted in</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Assessments</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {data.assessments.length}
          </p>
          <p className="mt-0.5 text-xs text-ink-600">
            {data.assessments.filter((a) => a.isActive).length} open
          </p>
        </Card>
      </div>

      <SectionHeading
        title="Institutions you can see"
        hint="Access is granted by the university and can be withdrawn by them at any time."
      />
      {data.grants.length === 0 ? (
        <Empty>No access requests yet.</Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-ink-100">
            {data.grants.map((grant) => (
              <li
                key={grant.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{grant.tenantName}</p>
                  <p className="text-xs text-ink-600">
                    {grant.grantedAt
                      ? `Granted ${grant.grantedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                      : "Awaiting a decision"}
                    {grant.expiresAt
                      ? ` · expires ${grant.expiresAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    grant.status === "active"
                      ? "bg-good-100 text-good-500"
                      : grant.status === "pending"
                        ? "bg-warn-100 text-warn-500"
                        : "bg-ink-100 text-ink-600"
                  }`}
                >
                  {grant.status === "active"
                    ? "Active"
                    : grant.status === "pending"
                      ? "Pending"
                      : "Revoked"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </EmployerShell>
  );
}
