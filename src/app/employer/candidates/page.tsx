import { EmployerShell } from "@/components/employer-shell";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  candidatePool,
  employerProfile,
  optedInCandidates,
} from "@/lib/employer/queries";

export const metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

const BAND_LABEL: Record<string, string> = {
  strong: "Strong (75%+)",
  developing: "Developing (50–74%)",
  early: "Early (under 50%)",
};

const BAND_TONE: Record<string, string> = {
  strong: "bg-good-100 text-good-500",
  developing: "bg-warn-100 text-warn-500",
  early: "bg-risk-100 text-risk-500",
};

export default async function CandidatesPage() {
  const user = await requireEmployer();

  const data = await withRequestContext(user, async (tx) => ({
    employer: await employerProfile(tx, user.employerId),
    pool: await candidatePool(tx),
    shared: await optedInCandidates(tx, user.employerId),
  }));

  // Group buckets by institution then skill area for a readable table.
  const byInstitution = new Map<string, typeof data.pool>();
  for (const bucket of data.pool) {
    const list = byInstitution.get(bucket.tenantName) ?? [];
    list.push(bucket);
    byInstitution.set(bucket.tenantName, list);
  }

  return (
    <EmployerShell user={user} employerName={data.employer?.name ?? "Employer"}>
      <h1 className="mb-1 text-2xl font-semibold">Candidates</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Cohort strength by skill area, and the students who have chosen to share
        a named profile with you.
      </p>

      <SectionHeading
        title="Anonymised pool"
        hint="Counts of students by skill area and score band, across institutions that have granted you access."
      />

      <div className="mb-4">
        <Alert tone="info">
          No individual is identifiable here, and buckets containing fewer than
          five students are withheld rather than shown — a small enough count is
          itself an identification. To reach a specific student, run an
          assessment or wait for them to share a profile.
        </Alert>
      </div>

      {byInstitution.size === 0 ? (
        <Empty>
          No pool data yet. Either no institution has granted you access, or no
          bucket is large enough to report without identifying someone.
        </Empty>
      ) : (
        <div className="mb-8 space-y-4">
          {[...byInstitution.entries()].map(([institution, buckets]) => (
            <Card key={institution}>
              <h3 className="mb-3 font-semibold">{institution}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                      <th className="py-2 font-medium">Skill area</th>
                      <th className="py-2 font-medium">Band</th>
                      <th className="py-2 text-right font-medium">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((bucket, i) => (
                      <tr key={i} className="border-b border-ink-100 last:border-0">
                        <td className="py-2.5 font-medium text-ink-800">
                          {bucket.skillAreaName}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_TONE[bucket.band]}`}
                          >
                            {BAND_LABEL[bucket.band] ?? bucket.band}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {bucket.studentCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeading
        title="Shared profiles"
        hint="Students who explicitly opted in. Each can withdraw at any time, and access ends immediately when they do."
      />
      {data.shared.length === 0 ? (
        <Empty>No student has shared a profile with you yet.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Institution</th>
                <th className="px-5 py-3 text-right font-medium">Readiness</th>
                <th className="px-5 py-3 font-medium">Shared</th>
              </tr>
            </thead>
            <tbody>
              {data.shared.map((candidate) => (
                <tr key={candidate.userId} className="border-b border-ink-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink-800">
                    {candidate.fullName}
                  </td>
                  <td className="px-5 py-3 text-ink-600">{candidate.tenantName}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {candidate.readinessScore === null ? (
                      <span className="text-ink-400">—</span>
                    ) : (
                      <>
                        {Number(candidate.readinessScore)}
                        <span className="ml-1 text-xs font-normal text-ink-600">
                          {candidate.readinessComponents}/3
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {new Date(candidate.sharedAt).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </EmployerShell>
  );
}
