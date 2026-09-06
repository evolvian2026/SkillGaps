import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { JobDescriptionForm, ResumeUploadForm } from "@/components/resume-forms";
import { Alert, Button, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { jobDescriptions, resumeMatches, resumes } from "@/lib/db/schema";
import { requestMatchAction } from "@/lib/matching/actions";
import { isParserConfigured } from "@/lib/matching/parser-client";
import { resumeRetentionDays } from "@/lib/storage";

export const metadata = { title: "Resume match" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Queued for reading",
  parsing: "Being read",
  parsed: "Ready",
  failed: "Could not be read",
  purged: "Deleted (retention)",
};

export default async function ResumePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => ({
    myResumes: await tx
      .select({
        id: resumes.id,
        fileName: resumes.fileName,
        status: resumes.status,
        parseError: resumes.parseError,
        uploadedAt: resumes.uploadedAt,
        retainUntil: resumes.retainUntil,
      })
      .from(resumes)
      .where(eq(resumes.userId, user.userId))
      .orderBy(desc(resumes.uploadedAt))
      .limit(10),
    jds: await tx
      .select({
        id: jobDescriptions.id,
        title: jobDescriptions.title,
        company: jobDescriptions.company,
        status: jobDescriptions.status,
        isShared: jobDescriptions.isShared,
      })
      .from(jobDescriptions)
      .orderBy(desc(jobDescriptions.createdAt))
      .limit(25),
    matches: await tx
      .select({
        id: resumeMatches.id,
        status: resumeMatches.status,
        matchScore: resumeMatches.matchScore,
        createdAt: resumeMatches.createdAt,
        jdTitle: jobDescriptions.title,
        jdCompany: jobDescriptions.company,
      })
      .from(resumeMatches)
      .innerJoin(
        jobDescriptions,
        eq(jobDescriptions.id, resumeMatches.jobDescriptionId),
      )
      .where(eq(resumeMatches.userId, user.userId))
      .orderBy(desc(resumeMatches.createdAt))
      .limit(15),
  }));

  const usableResumes = data.myResumes.filter((r) => r.status === "parsed");
  const usableJds = data.jds.filter((j) => j.status === "parsed");

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Resume match</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Upload your resume and a job description, and see which of the skills
        that role asks for actually appear in your resume. We highlight the
        gaps — we do not rewrite your resume for you.
      </p>

      {error ? (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {!isParserConfigured() ? (
        <div className="mb-6">
          <Alert tone="info">
            Document parsing is not configured on this deployment, so uploads
            will stay queued. Ask your administrator to set{" "}
            <code className="font-mono text-xs">PARSER_SERVICE_URL</code>.
          </Alert>
        </div>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="1. Upload your resume" />
          <ResumeUploadForm retentionDays={resumeRetentionDays()} />
        </Card>
        <Card>
          <SectionHeading
            title="2. Add a target job description"
            hint="Or pick one your placement office has shared, below."
          />
          <JobDescriptionForm canShare={false} />
        </Card>
      </div>

      <SectionHeading title="3. Run a match" />
      <Card className="mb-8">
        {usableResumes.length === 0 || usableJds.length === 0 ? (
          <p className="text-sm text-ink-600">
            You need at least one readable resume and one analysed job
            description. {usableResumes.length === 0 ? "Upload a resume above." : ""}{" "}
            {usableJds.length === 0 ? "Add a job description above." : ""}
          </p>
        ) : (
          <form action={requestMatchAction} className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">Resume</span>
              <select
                name="resumeId"
                className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
              >
                {usableResumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-600">
                Job description
              </span>
              <select
                name="jobDescriptionId"
                className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
              >
                {usableJds.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.company ? ` — ${j.company}` : ""}
                    {j.isShared ? " (shared)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Compare</Button>
          </form>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading title="Your resumes" />
          {data.myResumes.length === 0 ? (
            <Empty>Nothing uploaded yet.</Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-ink-100">
                {data.myResumes.map((resume) => (
                  <li key={resume.id} className="px-5 py-3">
                    <p className="flex items-center justify-between gap-3 text-sm font-medium">
                      {resume.fileName}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          resume.status === "parsed"
                            ? "bg-good-100 text-good-500"
                            : resume.status === "failed"
                              ? "bg-risk-100 text-risk-500"
                              : "bg-ink-100 text-ink-600"
                        }`}
                      >
                        {STATUS_LABEL[resume.status] ?? resume.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-600">
                      Uploaded{" "}
                      {resume.uploadedAt.toLocaleDateString("en-IN", {
                        dateStyle: "medium",
                      })}
                      {resume.status !== "purged"
                        ? ` · deleted on ${resume.retainUntil.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                        : ""}
                    </p>
                    {resume.parseError ? (
                      <p className="mt-1 text-xs text-risk-500">{resume.parseError}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div>
          <SectionHeading title="Your matches" />
          {data.matches.length === 0 ? (
            <Empty>No comparisons yet.</Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-ink-100">
                {data.matches.map((match) => (
                  <li
                    key={match.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{match.jdTitle}</p>
                      <p className="text-xs text-ink-600">
                        {match.jdCompany ?? "—"} ·{" "}
                        {match.createdAt.toLocaleDateString("en-IN", {
                          dateStyle: "medium",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold tabular-nums">
                        {match.matchScore === null
                          ? "—"
                          : `${Number(match.matchScore)}%`}
                      </span>
                      <Link
                        href={`/resume/${match.id}`}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
