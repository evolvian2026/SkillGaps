import { asc, eq, notInArray } from "drizzle-orm";
import { EmployerShell } from "@/components/employer-shell";
import { RequestAccessForm } from "@/components/employer-forms";
import { Card, Empty, SectionHeading } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { rawDb, withRequestContext } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";
import { employerProfile, listGrants } from "@/lib/employer/queries";

export const metadata = { title: "Institutions" };
export const dynamic = "force-dynamic";

export default async function EmployerAccessPage() {
  const user = await requireEmployer();

  const data = await withRequestContext(user, async (tx) => ({
    employer: await employerProfile(tx, user.employerId),
    grants: await listGrants(tx, user.employerId),
  }));

  // The institution directory is public information — a name and nothing more.
  // It deliberately does not go through the employer's tenant policies, which
  // would (correctly) hide every university they have not been granted, making
  // it impossible to ask for access in the first place.
  const existing = data.grants.map((g) => g.tenantId);
  const directory = await rawDb()
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(
      existing.length > 0
        ? notInArray(tenants.id, existing)
        : eq(tenants.isActive, true),
    )
    .orderBy(asc(tenants.name));

  // Employer organisations have their own tenant rows; they are not
  // institutions a student belongs to, so keep them out of the picker.
  const institutions = directory.filter((t) => !t.name.endsWith("(org)"));

  return (
    <EmployerShell user={user} employerName={data.employer?.name ?? "Employer"}>
      <h1 className="mb-1 text-2xl font-semibold">Institutions</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        You can only see data for institutions that have granted you access.
        Requests are decided by the university, not by us.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Request access" />
          <RequestAccessForm institutions={institutions} />
        </Card>

        <div>
          <SectionHeading title="Your requests" />
          {data.grants.length === 0 ? (
            <Empty>You have not requested access to any institution.</Empty>
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
                          : grant.revokedAt
                            ? `Revoked ${grant.revokedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                            : "Awaiting a decision"}
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
        </div>
      </div>
    </EmployerShell>
  );
}
