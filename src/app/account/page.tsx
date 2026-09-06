import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { DataRequestForm } from "@/components/data-request-form";
import { Card, Empty, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  consentRecords,
  dataRequests,
  placementOutcomes,
  readinessScores,
  tenants,
} from "@/lib/db/schema";
import { readinessBand } from "@/lib/readiness/score";
import { OutcomeForm } from "@/components/readiness-forms";
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

    const [readiness] = await tx
      .select()
      .from(readinessScores)
      .where(eq(readinessScores.userId, user.userId));

    const [outcome] = await tx
      .select()
      .from(placementOutcomes)
      .where(eq(placementOutcomes.userId, user.userId));

    return { tenant, consents, requests, readiness, outcome };
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

          {data.readiness ? (
            <Card>
              <SectionHeading
                title="Placement readiness"
                hint="A composite of your diagnostic, mock interview and resume match."
              />
              <div className="flex items-end gap-4">
                <p className="text-4xl font-semibold tabular-nums">
                  {Number(data.readiness.score)}
                </p>
                <div className="pb-1">
                  <p className="text-sm font-medium">
                    {readinessBand(Number(data.readiness.score)).label}
                  </p>
                  <p className="text-xs text-ink-600">
                    based on {data.readiness.componentsPresent} of 3 components
                  </p>
                </div>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm">
                {[
                  ["Diagnostic", data.readiness.diagnosticPercent],
                  ["Mock interview", data.readiness.interviewPercent],
                  ["Resume match", data.readiness.resumeMatchPercent],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-4">
                    <dt className="text-ink-600">{label}</dt>
                    <dd className="font-medium tabular-nums">
                      {value === null || value === undefined
                        ? "not taken yet"
                        : `${Number(value)}%`}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-ink-600">
                Components you have not attempted are left out rather than
                scored zero, so this reflects what you have done — not what you
                have skipped. It is a practice signal, not a prediction.
              </p>
            </Card>
          ) : null}

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
            <SectionHeading
              title="Your placement outcome"
              hint="Optional. It helps your institution understand what actually works."
            />
            <OutcomeForm
              userId={user.userId}
              current={
                data.outcome
                  ? {
                      status: data.outcome.status,
                      role: data.outcome.role,
                      company: data.outcome.company,
                      companyAnonymised: data.outcome.companyAnonymised,
                      packageBand: data.outcome.packageBand,
                    }
                  : null
              }
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
