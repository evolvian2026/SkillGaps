import { EmployerShell } from "@/components/employer-shell";
import { RequestAccessForm } from "@/components/employer-forms";
import { Card, Empty, SectionHeading } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  employerProfile,
  institutionDirectory,
  listGrants,
} from "@/lib/employer/queries";

export const metadata = { title: "Institutions" };
export const dynamic = "force-dynamic";

export default async function EmployerAccessPage() {
  const user = await requireEmployer();

  const data = await withRequestContext(user, async (tx) => ({
    employer: await employerProfile(tx, user.employerId),
    grants: await listGrants(tx),
    directory: await institutionDirectory(tx),
  }));

  // The directory comes from a SECURITY DEFINER function: an employer cannot
  // read `tenants` directly (their own tenant is their organisation record),
  // and it returns only an id and a name — never a university's invite code.
  const existing = new Set(data.grants.map((g) => g.tenantId));
  const institutions = data.directory.filter((t) => !existing.has(t.id));

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
