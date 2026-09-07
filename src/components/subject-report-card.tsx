import { Card, ProvisionalBadge } from "./ui";
import type { SubjectReport } from "@/lib/faculty/queries";
import type { AreaVerdict } from "@/lib/faculty/subject-focus";

/**
 * One subject a lecturer teaches.
 *
 * Ordered weakest-area-first, with the lecturer's own syllabus topics named
 * against each area — a skill area code alone ("SQL") does not tell them which
 * lecture to change, and the topic list does.
 */

const VERDICT_TONE: Record<AreaVerdict, string> = {
  weak: "bg-risk-100 text-risk-500",
  watch: "bg-warn-100 text-warn-500",
  fine: "bg-good-100 text-good-500",
  thin: "bg-ink-100 text-ink-600",
  no_data: "bg-ink-100 text-ink-600",
};

const VERDICT_LABEL: Record<AreaVerdict, string> = {
  weak: "Needs attention",
  watch: "Worth watching",
  fine: "Holding up",
  thin: "Too few assessed",
  no_data: "Not assessed",
};

function cohortLabel(report: SubjectReport): string {
  const { branch, section, batchYear } = report.assignment;
  const parts = [
    branch ?? "all branches",
    section ? `section ${section}` : "all sections",
    batchYear ? `batch ${batchYear}` : "all batches",
  ];
  return parts.join(" · ");
}

export function SubjectReportCard({ report }: { report: SubjectReport }) {
  const { assignment } = report;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {assignment.subjectName}
            {assignment.subjectCode ? (
              <span className="ml-2 text-sm font-normal text-ink-600">
                {assignment.subjectCode}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-ink-600">
            {cohortLabel(report)}
            {assignment.semester ? ` · semester ${assignment.semester}` : ""}
          </p>
        </div>
        <span className="text-xs text-ink-600" data-testid="assessed-count">
          {report.assessedStudents} assessed
        </span>
      </div>

      {report.areas.length === 0 ? (
        <p className="mt-3 text-sm text-ink-600">
          None of this subject&rsquo;s topics match the in-demand reference
          list, so there is nothing to measure it against yet. Check the topic
          list on the syllabus, or ask your placement office to extend the
          reference list.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {report.areas.map((area) => (
            <div
              key={area.code}
              className="rounded-lg border border-ink-200 p-3"
              data-testid={`area-${area.verdict}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-ink-800">{area.name}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT_TONE[area.verdict]}`}
                >
                  {VERDICT_LABEL[area.verdict]}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {area.message}
                {area.hiringBarPercent !== null &&
                (area.verdict === "weak" ||
                  area.verdict === "watch" ||
                  area.verdict === "fine") ? (
                  <ProvisionalBadge className="ml-1.5" />
                ) : null}
              </p>
              {area.topics.length > 0 ? (
                <p className="mt-2 text-xs text-ink-600">
                  Your topics here: {area.topics.join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {report.missingTopics.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-600">
            In-demand topics your syllabus does not cover (
            {report.missingTopics.length})
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {report.missingTopics.slice(0, 20).map((t) => (
              <li
                key={`${t.skillArea}-${t.topic}`}
                className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600"
              >
                {t.topic}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-600">
            Only topics in the areas this subject already teaches. Matching is
            by wording, not meaning — a topic you cover under a different name
            will appear here, so read it as a prompt to check, not a verdict.
          </p>
        </details>
      ) : null}

      {report.unmatchedTopics.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-ink-600">
            Your topics the reference list does not recognise (
            {report.unmatchedTopics.length})
          </summary>
          <p className="mt-2 text-xs text-ink-600">
            {report.unmatchedTopics.join(", ")}
          </p>
          <p className="mt-2 text-xs text-ink-600">
            Not a criticism of the topic: it means the benchmark has no entry
            for it, so it is neither credited nor counted against you.
          </p>
        </details>
      ) : null}
    </Card>
  );
}
