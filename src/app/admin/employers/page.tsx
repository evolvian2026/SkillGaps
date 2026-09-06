import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { AccessDecisionForm } from "@/components/employer-forms";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { employerAccessGrants, employers } from "@/lib/db/schema";

export const metadata = { title: "Employer access" };
export const dynamic = "force-dynamic";

export default async function AdminEmployersPage() {
  const user = await requireStaff();

  const rows = await withRequestContext(user, (tx) =>
    tx
      .select({
        id: employerAccessGrants.id,
        status: employerAccessGrants.status,
        note: employerAccessGrants.note,
        createdAt: employerAccessGrants.createdAt,
        grantedAt: employerAccessGrants.grantedAt,
        revokedAt: employerAccessGrants.revokedAt,
        employerName: employers.name,
        employerWebsite: employers.website,
      })
      .from(employerAccessGrants)
      .innerJoin(employers, eq(employers.id, employerAccessGrants.employerId))
      .where(eq(employerAccessGrants.tenantId, user.tenantId))
      .orderBy(desc(employerAccessGrants.createdAt)),
  );

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Employer access</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Employers who have asked to see your cohort. You decide; nothing is
        shared until you approve it.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          Granting access lets an employer see <strong>anonymised</strong>{" "}
          cohort statistics only — counts by skill area and band, with small
          groups withheld. Seeing a named student always requires that student
          to share their own profile, which they control and can withdraw. You
          can revoke an employer at any time, and it takes effect immediately.
        </Alert>
      </div>

      <SectionHeading title={`Awaiting your decision (${pending.length})`} />
      {pending.length === 0 ? (
        <Empty>No pending requests.</Empty>
      ) : (
        <div className="mb-8 space-y-3">
          {pending.map((row) => (
            <Card key={row.id}>
              <p className="font-medium">{row.employerName}</p>
              <p className="text-xs text-ink-600">
                Requested{" "}
                {row.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                {row.employerWebsite ? ` · ${row.employerWebsite}` : ""}
              </p>
              {row.note ? (
                <p className="mt-2 text-sm text-ink-600">&ldquo;{row.note}&rdquo;</p>
              ) : null}
              <AccessDecisionForm
                grantId={row.id}
                employerName={row.employerName}
                currentStatus={row.status}
              />
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title={`Decided (${decided.length})`} />
      {decided.length === 0 ? (
        <Empty>Nothing decided yet.</Empty>
      ) : (
        <div className="space-y-3">
          {decided.map((row) => (
            <Card key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.employerName}</p>
                  <p className="text-xs text-ink-600">
                    {row.status === "active"
                      ? `Granted ${row.grantedAt?.toLocaleDateString("en-IN", { dateStyle: "medium" }) ?? ""}`
                      : `Revoked ${row.revokedAt?.toLocaleDateString("en-IN", { dateStyle: "medium" }) ?? ""}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    row.status === "active"
                      ? "bg-good-100 text-good-500"
                      : "bg-ink-100 text-ink-600"
                  }`}
                >
                  {row.status === "active" ? "Active" : "Revoked"}
                </span>
              </div>
              <AccessDecisionForm
                grantId={row.id}
                employerName={row.employerName}
                currentStatus={row.status}
              />
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
