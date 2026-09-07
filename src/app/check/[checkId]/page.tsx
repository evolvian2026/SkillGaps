import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckRunner } from "@/components/check-runner";
import { Alert, Card } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { isUuid } from "@/lib/practice/ids";
import { withRequestContext } from "@/lib/db/client";
import { skillAreas, skillChecks } from "@/lib/db/schema";
import { loadCheck } from "@/lib/practice/session";
import { readCheck } from "@/lib/practice/progress";

export const metadata = { title: "Skill check" };
export const dynamic = "force-dynamic";

const TONE: Record<string, "success" | "info" | "error"> = {
  improved: "success",
  declined: "error",
  too_close: "info",
  no_baseline: "info",
};

export default async function CheckPage({
  params,
}: {
  params: Promise<{ checkId: string }>;
}) {
  const { checkId } = await params;
  if (!isUuid(checkId)) notFound();
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => {
    const check = await loadCheck(tx, checkId);
    if (!check) return null;
    const [row] = await tx
      .select({
        percent: skillChecks.percent,
        baselinePercent: skillChecks.baselinePercent,
        correctCount: skillChecks.correctCount,
        totalCount: skillChecks.totalCount,
        skillAreaId: skillChecks.skillAreaId,
        areaName: skillAreas.name,
      })
      .from(skillChecks)
      .innerJoin(skillAreas, eq(skillAreas.id, skillChecks.skillAreaId))
      .where(eq(skillChecks.id, checkId));
    return { check, row };
  });

  // RLS confines checks to their owner, so another student's id is simply not
  // found rather than forbidden.
  if (!data?.row) notFound();

  if (!data.check.completed) {
    return (
      <CheckRunner
        checkId={checkId}
        skillAreaName={data.check.skillAreaName}
        items={data.check.items}
      />
    );
  }

  // The margin scales with how many questions this check actually held, so a
  // shorter check claims less.
  const outcome = readCheck(
    Number(data.row.percent ?? 0),
    data.row.baselinePercent === null ? null : Number(data.row.baselinePercent),
    data.row.totalCount,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">
        Skill check · {data.row.areaName}
      </h1>
      <p className="mb-6 text-sm text-ink-600">
        {data.row.correctCount} of {data.row.totalCount} correct.
      </p>

      <div className="mb-4">
        <Alert tone={TONE[outcome.verdict]}>
          <span data-testid="check-verdict" data-verdict={outcome.verdict}>
            {outcome.message}
          </span>
        </Alert>
      </div>

      <Card>
        <p className="text-sm text-ink-600">
          A check is short and focused on one area you already knew was coming,
          so it is not the same measurement as a full diagnostic. It never feeds
          your readiness score, your college&rsquo;s cohort figures, or an
          employer&rsquo;s view — retake the full diagnostic when you want a
          number that counts.
        </p>
      </Card>

      <p className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard" className="font-medium text-brand-600 hover:underline">
          Back to your dashboard
        </Link>
      </p>
    </div>
  );
}
