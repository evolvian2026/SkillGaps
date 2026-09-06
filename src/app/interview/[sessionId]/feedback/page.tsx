import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Card, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { loadInterviewFeedback } from "@/lib/interview/session";

export const metadata = { title: "Interview feedback" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  behavioral: "Behavioural",
  technical: "Technical",
  situational: "Situational",
};

function scoreTone(score: number): string {
  if (score >= 75) return "text-good-500";
  if (score >= 55) return "text-warn-500";
  return "text-risk-500";
}

export default async function InterviewFeedbackPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser();

  const feedback = await withRequestContext(user, (tx) =>
    loadInterviewFeedback(tx, sessionId),
  );
  if (!feedback) notFound();

  const pending = feedback.status === "submitted";

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-600">Mock interview · {feedback.trackName}</p>
          <h1 className="text-2xl font-semibold">Your interview feedback</h1>
          {feedback.submittedAt ? (
            <p className="mt-1 text-sm text-ink-600">
              Submitted{" "}
              {feedback.submittedAt.toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </div>
        {feedback.overallScore !== null ? (
          <div className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-ink-400">Overall</p>
            <p
              className={`text-3xl font-semibold tabular-nums ${scoreTone(feedback.overallScore)}`}
            >
              {feedback.overallScore}%
            </p>
          </div>
        ) : null}
      </div>

      {pending ? (
        <div className="mb-6">
          <Alert tone="info">
            Your answers are being evaluated. This usually takes under a minute —
            refresh the page to check.
          </Alert>
        </div>
      ) : null}

      {feedback.summaryFeedback ? (
        <Card className="mb-6">
          <SectionHeading title="Overall" />
          <p className="text-sm leading-relaxed text-ink-800">
            {feedback.summaryFeedback}
          </p>
          {feedback.evaluationMethod ? (
            <p className="mt-3 text-xs text-ink-600">
              Evaluated by:{" "}
              {feedback.evaluationMethod === "model"
                ? "AI reviewer"
                : feedback.evaluationMethod === "rubric"
                  ? "automated writing rubric"
                  : "a human reviewer"}
              . Feedback is guidance for practice, not a hiring decision.
            </p>
          ) : null}
        </Card>
      ) : null}

      <SectionHeading title="Question by question" />
      <div className="space-y-4">
        {feedback.responses.map((response) => (
          <Card key={response.position}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  {KIND_LABEL[response.kind] ?? response.kind}
                  {response.skillArea ? ` · ${response.skillArea}` : ""}
                </p>
                <p className="text-[15px] font-medium leading-relaxed text-ink-900">
                  {response.prompt}
                </p>
              </div>
              {response.score !== null ? (
                <span
                  className={`shrink-0 text-2xl font-semibold tabular-nums ${scoreTone(response.score)}`}
                >
                  {response.score}%
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
                  {response.evaluationStatus === "awaiting_review"
                    ? "Awaiting review"
                    : "Pending"}
                </span>
              )}
            </div>

            {response.responseText ? (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-600">
                  Your answer
                </summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm leading-relaxed text-ink-800">
                  {response.responseText}
                </p>
              </details>
            ) : (
              <p className="mb-3 text-sm text-ink-600">You did not answer this one.</p>
            )}

            {response.criterionScores.length > 0 ? (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {response.criterionScores.map((criterion) => (
                  <div
                    key={criterion.key}
                    className={`rounded-lg border p-3 ${
                      criterion.assessed === false
                        ? "border-dashed border-ink-200 bg-ink-50"
                        : "border-ink-200"
                    }`}
                  >
                    <p className="flex items-center justify-between gap-2 text-sm font-medium capitalize">
                      {criterion.key.replace(/_/g, " ")}
                      {criterion.assessed === false ? (
                        <span className="shrink-0 text-xs font-normal normal-case text-ink-400">
                          not assessed
                        </span>
                      ) : (
                        <span className={`tabular-nums ${scoreTone(criterion.score)}`}>
                          {criterion.score}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">
                      {criterion.comment}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {response.improvements.length > 0 ? (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  What would make it stronger
                </p>
                <ul className="space-y-1 text-sm text-ink-800">
                  {response.improvements.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="text-warn-500">
                        →
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {response.strengths.length > 0 ? (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  What worked
                </p>
                <ul className="space-y-1 text-sm text-ink-800">
                  {response.strengths.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="text-good-500">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {response.guidance ? (
              <details className="rounded-lg bg-brand-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">
                  What interviewers look for here
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-800">
                  {response.guidance}
                </p>
              </details>
            ) : null}
          </Card>
        ))}
      </div>

      <Link
        href="/interview"
        className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to mock interviews
      </Link>
    </AppShell>
  );
}
