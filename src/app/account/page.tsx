import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { DataRequestForm } from "@/components/data-request-form";
import { Card, Empty, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { consentRecords, dataRequests, tenants } from "@/lib/db/schema";
import { CONSENT_NOTICE } from "@/lib/privacy/consent";

export const metadata = { title: "Your data" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Received",
  in_progress: "Being actioned",
  completed: "Completed",
  rejected: "Declined",
};

export default async function AccountPage() {
  const user = await requireUser();

  const data = await withRequestContext(user, async (tx) => {
    const [tenant] = await tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId));

    const consents = await tx
      .select({
        id: consentRecords.id,
        granted: consentRecords.granted,
        policyVersion: consentRecords.policyVersion,
        recordedAt: consentRecords.recordedAt,
      })
      .from(consentRecords)
      .where(eq(consentRecords.userId, user.userId))
      .orderBy(desc(consentRecords.recordedAt));

    const requests = await tx
      .select({
        id: dataRequests.id,
        type: dataRequests.type,
        status: dataRequests.status,
        createdAt: dataRequests.createdAt,
        resolvedAt: dataRequests.resolvedAt,
        resolutionNote: dataRequests.resolutionNote,
      })
      .from(dataRequests)
      .where(eq(dataRequests.userId, user.userId))
      .orderBy(desc(dataRequests.createdAt));

    return { tenant, consents, requests };
  });

  const latestConsent = data.consents[0];

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Your data</h1>
      <p className="mb-6 text-sm text-ink-600">
        What we hold about you, and how to get a copy or have it removed.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <SectionHeading title="Your account" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Name</dt>
                <dd className="font-medium">{user.fullName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Institution</dt>
                <dd className="font-medium">{data.tenant?.name ?? "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <SectionHeading
              title="Consent"
              hint={
                latestConsent
                  ? `${latestConsent.granted ? "Granted" : "Withdrawn"} on ${latestConsent.recordedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} (version ${latestConsent.policyVersion}).`
                  : "No consent record found."
              }
            />
            <details>
              <summary className="cursor-pointer text-sm font-medium text-brand-600">
                What you agreed to
              </summary>
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-600">
                {CONSENT_NOTICE}
              </p>
            </details>
            <p className="mt-4 text-xs text-ink-600">
              Every change to your consent is kept as a separate, timestamped
              record — we never overwrite the previous one.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeading
              title="Request an export or deletion"
              hint="Your institution's placement office actions these requests."
            />
            <DataRequestForm
              hasPending={data.requests.some((r) => r.status === "pending")}
            />
          </Card>

          <Card>
            <SectionHeading title="Your requests" />
            {data.requests.length === 0 ? (
              <Empty>You have not made any requests.</Empty>
            ) : (
              <ul className="space-y-3 text-sm">
                {data.requests.map((request) => (
                  <li
                    key={request.id}
                    className="rounded-lg border border-ink-200 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium capitalize">
                        {request.type} request
                      </span>
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                        {STATUS_LABELS[request.status] ?? request.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-600">
                      Raised{" "}
                      {request.createdAt.toLocaleDateString("en-IN", {
                        dateStyle: "medium",
                      })}
                      {request.resolvedAt
                        ? ` · resolved ${request.resolvedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                        : ""}
                    </p>
                    {request.resolutionNote ? (
                      <p className="mt-1.5 text-xs text-ink-600">
                        {request.resolutionNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
