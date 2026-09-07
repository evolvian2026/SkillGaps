import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { WeightsForm } from "@/components/readiness-forms";
import { Alert, Card, SectionHeading } from "@/components/ui";
import { requirePlacementStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { readinessWeights } from "@/lib/db/schema";
import { DEFAULT_WEIGHTS } from "@/lib/readiness/score";

export const metadata = { title: "Readiness settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePlacementStaff();

  const current = await withRequestContext(user, async (tx) => {
    const [row] = await tx
      .select()
      .from(readinessWeights)
      .where(eq(readinessWeights.tenantId, user.tenantId));
    if (!row) return DEFAULT_WEIGHTS;
    return {
      diagnostic: Number(row.diagnosticWeight),
      interview: Number(row.interviewWeight),
      resume: Number(row.resumeWeight),
    };
  });

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Readiness settings</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        How much each component counts toward a student&apos;s placement
        readiness score at your institution.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          A student with no data for a component is scored on the components
          they do have, rather than being marked zero for the rest. The
          students table shows how complete each score is.
        </Alert>
      </div>

      <Card className="max-w-2xl">
        <SectionHeading title="Component weighting" />
        <WeightsForm current={current} />
      </Card>
    </AppShell>
  );
}
