import { notFound } from "next/navigation";
import { rawDb } from "@/lib/db/client";
import { isWellFormedToken } from "@/lib/verification/token";
import {
  recordProfileView,
  resolveProfile,
  type ProfileSnapshot,
} from "@/lib/verification/profile";

export const metadata = {
  title: "Verified skill profile",
  // A verification link is a private credential; keep it out of search results.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function tone(percent: number, bar: number | null): string {
  if (bar === null) return "text-ink-800";
  if (percent >= bar) return "text-good-500";
  return bar - percent >= 15 ? "text-risk-500" : "text-warn-500";
}

/**
 * Public verification page.
 *
 * No account required — the whole point is that an employer can check a claim
 * without one. The token is the only credential, so it is validated in shape
 * before it reaches the database, and resolution runs through a SECURITY
 * DEFINER function that filters revoked and expired links itself.
 */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isWellFormedToken(token)) notFound();

  const db = rawDb();
  const profile = await resolveProfile(db, token);
  // A revoked, expired or unknown token is one indistinguishable 404: telling
  // the difference would confirm that a link once existed.
  if (!profile) notFound();

  await recordProfileView(db, token);
  const snapshot = profile.snapshot as ProfileSnapshot;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8 border-b border-ink-200 pb-6">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-brand-600">
          Verified by SkillGaps
        </p>
        <h1 className="text-3xl font-semibold">{snapshot.fullName}</h1>
        <p className="mt-1 text-ink-600">{snapshot.institution}</p>
        <p className="mt-3 text-xs text-ink-600">
          Reference{" "}
          <span className="font-mono font-medium">{profile.publicId}</span> ·
          issued{" "}
          {profile.issuedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
          {profile.expiresAt
            ? ` · expires ${profile.expiresAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
            : ""}
        </p>
      </header>

      {snapshot.readiness ? (
        <section className="mb-8 rounded-xl border border-ink-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">Placement readiness</h2>
          <div className="flex items-end gap-4">
            <p className="text-4xl font-semibold tabular-nums">
              {snapshot.readiness.score}
            </p>
            <p className="pb-1 text-sm text-ink-600">
              computed from {snapshot.readiness.componentsPresent} of 3
              components
            </p>
          </div>
        </section>
      ) : null}

      {snapshot.diagnostics.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Diagnostic assessments</h2>
          <div className="space-y-4">
            {snapshot.diagnostics.map((diagnostic) => (
              <div
                key={diagnostic.track}
                className="rounded-xl border border-ink-200 bg-white p-5"
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{diagnostic.track}</h3>
                  <span className="text-2xl font-semibold tabular-nums">
                    {diagnostic.percent}%
                  </span>
                </div>
                <p className="mb-3 text-xs text-ink-600">
                  Completed{" "}
                  {new Date(diagnostic.submittedAt).toLocaleDateString("en-IN", {
                    dateStyle: "medium",
                  })}
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {diagnostic.areas.map((area) => (
                      <tr key={area.name} className="border-t border-ink-100">
                        <td className="py-2 text-ink-800">{area.name}</td>
                        <td
                          className={`py-2 text-right font-medium tabular-nums ${tone(area.percent, area.hiringBar)}`}
                        >
                          {area.percent}%
                        </td>
                        <td className="py-2 pl-3 text-right text-xs text-ink-600">
                          {area.hiringBar === null
                            ? "—"
                            : `bar ${area.hiringBar}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {snapshot.interviews.length > 0 ? (
        <section className="mb-8 rounded-xl border border-ink-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">Mock interviews</h2>
          <ul className="space-y-2 text-sm">
            {snapshot.interviews.map((interview, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span>
                  {interview.track}
                  <span className="ml-2 text-xs text-ink-600">
                    {new Date(interview.evaluatedAt).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{interview.score}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-600">
            Mock interviews are practice exercises scored{" "}
            {snapshot.interviews[0].method === "model"
              ? "by an AI reviewer"
              : snapshot.interviews[0].method === "rubric"
                ? "by an automated writing rubric, which assesses how an answer is written rather than whether its content is correct"
                : "by a human reviewer"}
            .
          </p>
        </section>
      ) : null}

      <footer className="border-t border-ink-200 pt-6 text-xs leading-relaxed text-ink-600">
        <p className="mb-2">
          <strong className="text-ink-800">What this page is.</strong> Results
          recorded by SkillGaps for this student, frozen at the moment they
          created this link. They can revoke it at any time, after which this
          page stops resolving.
        </p>
        <p className="mb-2">
          <strong className="text-ink-800">What it is not.</strong> Hiring-bar
          benchmarks shown here are provisional estimates set by the SkillGaps
          team. They are not validated against placement outcomes, and no score
          here is a hiring recommendation.
        </p>
        <p>
          Concerns about this page? Quote reference{" "}
          <span className="font-mono">{profile.publicId}</span>.
        </p>
      </footer>
    </div>
  );
}
