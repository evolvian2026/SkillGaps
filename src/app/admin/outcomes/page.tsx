import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { OutcomeForm } from "@/components/readiness-forms";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { placementOutcomes, studentProfiles, users } from "@/lib/db/schema";

export const metadata = { title: "Placement outcomes" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  unknown: "Not known yet",
  placed: "Placed",
  not_placed: "Not placed",
  higher_studies: "Higher studies",
  opted_out: "Opted out",
};

const STATUS_TONE: Record<string, string> = {
  placed: "bg-good-100 text-good-500",
  not_placed: "bg-warn-100 text-warn-500",
  higher_studies: "bg-brand-100 text-brand-700",
  opted_out: "bg-ink-100 text-ink-600",
  unknown: "bg-ink-100 text-ink-600",
};

export default async function OutcomesPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student } = await searchParams;
  const user = await requireStaff();

  const data = await withRequestContext(user, async (tx) => {
    const rows = await tx
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        branch: studentProfiles.branch,
        batchYear: studentProfiles.batchYear,
        status: placementOutcomes.status,
        role: placementOutcomes.role,
        company: placementOutcomes.company,
        companyAnonymised: placementOutcomes.companyAnonymised,
        packageBand: placementOutcomes.packageBand,
        updatedAt: placementOutcomes.updatedAt,
      })
      .from(users)
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .leftJoin(placementOutcomes, eq(placementOutcomes.userId, users.id))
      .where(eq(users.role, "student"))
      .orderBy(asc(users.fullName));
    return rows;
  });

  const selected = student ? data.find((r) => r.userId === student) : null;
  const recorded = data.filter((r) => r.status && r.status !== "unknown");
  const placed = data.filter((r) => r.status === "placed");

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Placement outcomes</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Record what actually happened. This is captured now so that hiring-bar
        benchmarks can later be calibrated against real results instead of
        estimates.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          Nothing here is analysed yet, and no student sees another
          student&apos;s outcome. Company names can be withheld per student
          where your institution prefers not to share them.
        </Alert>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Students</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{data.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Recorded</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{recorded.length}</p>
          <p className="mt-0.5 text-xs text-ink-600">
            {data.length > 0
              ? `${Math.round((recorded.length / data.length) * 100)}% of the cohort`
              : ""}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Placed</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{placed.length}</p>
        </Card>
      </div>

      {selected ? (
        <Card className="mb-6">
          <SectionHeading title={`Record outcome — ${selected.fullName}`} />
          <OutcomeForm
            userId={selected.userId}
            current={{
              status: selected.status ?? "unknown",
              role: selected.role,
              company: selected.company,
              companyAnonymised: selected.companyAnonymised ?? false,
              packageBand: selected.packageBand,
            }}
          />
        </Card>
      ) : null}

      <SectionHeading title="Cohort" />
      {data.length === 0 ? (
        <Empty>No students in this institution yet.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.userId} className="border-b border-ink-100 last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink-800">{row.fullName}</span>
                    <span className="block text-xs text-ink-600">{row.email}</span>
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {row.branch ?? "—"}
                    {row.batchYear ? ` · ${row.batchYear}` : ""}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_TONE[row.status ?? "unknown"]
                      }`}
                    >
                      {STATUS_LABEL[row.status ?? "unknown"]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink-600">{row.role ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-600">
                    {row.companyAnonymised
                      ? "withheld"
                      : (row.company ?? "—")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`/admin/outcomes?student=${row.userId}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {row.status && row.status !== "unknown" ? "Edit" : "Record"}
                    </a>
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
