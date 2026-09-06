import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  employerAccessGrants,
  employers,
  profileShareConsents,
} from "@/lib/db/schema";
import { setProfileShareAction } from "@/lib/employer/actions";
import { SHARE_NOTICE } from "@/lib/employer/consent";

export const metadata = { title: "Employer sharing" };
export const dynamic = "force-dynamic";

export default async function SharingPage() {
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => {
    // Employers that hold active access to this student's institution — the
    // only ones it is meaningful to share with.
    const available = await tx
      .select({
        id: employers.id,
        name: employers.name,
        website: employers.website,
      })
      .from(employerAccessGrants)
      .innerJoin(employers, eq(employers.id, employerAccessGrants.employerId))
      .where(
        and(
          eq(employerAccessGrants.tenantId, user.tenantId),
          eq(employerAccessGrants.status, "active"),
        ),
      );

    // Current state per employer is the most recent consent event.
    const history = await tx
      .select({
        employerId: profileShareConsents.employerId,
        granted: profileShareConsents.granted,
        recordedAt: profileShareConsents.recordedAt,
      })
      .from(profileShareConsents)
      .where(eq(profileShareConsents.userId, user.userId))
      .orderBy(desc(profileShareConsents.recordedAt));

    return { available, history };
  });

  const current = new Map<string, { granted: boolean; at: Date }>();
  for (const event of data.history) {
    if (!current.has(event.employerId)) {
      current.set(event.employerId, {
        granted: event.granted,
        at: event.recordedAt,
      });
    }
  }

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Employer sharing</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Employers working with your institution. Nothing about you reaches any
        of them unless you choose to share, and you can withdraw at any time.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          Employers can always see anonymised cohort statistics your institution
          has agreed to — counts by skill area, never a person. Sharing below is
          what lets one of them see <strong>you</strong> by name.
        </Alert>
      </div>

      <SectionHeading title="Employers you can share with" />
      {data.available.length === 0 ? (
        <Empty>
          No employer currently has access to your institution&apos;s cohort.
        </Empty>
      ) : (
        <div className="mb-8 space-y-3">
          {data.available.map((employer) => {
            const state = current.get(employer.id);
            const shared = state?.granted === true;
            return (
              <Card key={employer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{employer.name}</p>
                    {employer.website ? (
                      <p className="text-xs text-ink-600">{employer.website}</p>
                    ) : null}
                    {state ? (
                      <p className="mt-1 text-xs text-ink-600">
                        {shared ? "Shared" : "Withdrawn"} on{" "}
                        {state.at.toLocaleDateString("en-IN", {
                          dateStyle: "medium",
                        })}
                      </p>
                    ) : null}
                  </div>
                  <form action={setProfileShareAction} className="shrink-0">
                    <input type="hidden" name="employerId" value={employer.id} />
                    <input
                      type="hidden"
                      name="granted"
                      value={shared ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                        shared
                          ? "border border-risk-500 text-risk-500 hover:bg-risk-100"
                          : "bg-brand-600 text-white hover:bg-brand-700"
                      }`}
                    >
                      {shared ? "Withdraw sharing" : "Share my profile"}
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mb-6">
        <SectionHeading title="What sharing means" />
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">
          {SHARE_NOTICE}
        </p>
        <p className="mt-4 text-xs text-ink-600">
          Every change you make here is recorded as a separate, timestamped
          event — we never overwrite the previous one — so there is always a
          record of what you agreed to and when.
        </p>
      </Card>

      <Link href="/account" className="text-sm font-medium text-brand-600 hover:underline">
        ← Back to your data
      </Link>
    </AppShell>
  );
}
