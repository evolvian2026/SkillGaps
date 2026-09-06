"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireStudent, requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/auth/types";
import { withRequestContext } from "@/lib/db/client";
import { jobDescriptions, resumeMatches, resumes } from "@/lib/db/schema";
import { dedupeKey, enqueue } from "@/lib/queue";
import { putObject, resumeKey, resumeRetainUntil } from "@/lib/storage";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

export interface UploadState {
  error?: string;
  message?: string;
}

/**
 * Accepts a resume upload.
 *
 * The file goes straight to object storage with a retention deadline; parsing
 * is queued. Nothing about the request waits on the parser service, so a slow
 * or down parser delays feedback rather than losing the upload.
 */
export async function uploadResumeAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireStudent();
  const file = formData.get("resume");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a resume file to upload." };
  }
  if (file.size > MAX_RESUME_BYTES) {
    return { error: "That file is larger than 5 MB." };
  }

  const contentType = file.type || "application/octet-stream";
  const looksAllowed =
    ALLOWED_TYPES.has(contentType) || /\.(pdf|txt|md)$/i.test(file.name);
  if (!looksAllowed) {
    return { error: "Upload a PDF or a plain-text file." };
  }

  const data = Buffer.from(await file.arrayBuffer());
  const key = resumeKey(user.tenantId, user.userId, file.name);

  try {
    await putObject(key, data, contentType);
  } catch (err) {
    console.error("[resume] storage write failed", err);
    return { error: "We could not store that file. Please try again." };
  }

  const resumeId = await withRequestContext(user, async (tx) => {
    const [row] = await tx
      .insert(resumes)
      .values({
        tenantId: user.tenantId,
        userId: user.userId,
        fileName: file.name.slice(0, 200),
        contentType,
        sizeBytes: data.byteLength,
        storageKey: key,
        retainUntil: resumeRetainUntil(),
      })
      .returning({ id: resumes.id });
    return row.id;
  });

  await enqueue(
    { name: "parse-resume", userId: user.userId, resumeId },
    { jobId: dedupeKey("parse-resume", resumeId) },
  );

  revalidatePath("/resume");
  return { message: "Resume uploaded. We are reading it now." };
}

const jdSchema = z.object({
  title: z.string().trim().min(2, "Give the role a title.").max(200),
  company: z.string().trim().max(200).optional(),
  rawText: z
    .string()
    .trim()
    .min(120, "Paste the full job description — that one is too short to analyse.")
    .max(60_000),
  isShared: z.boolean().default(false),
});

export async function createJobDescriptionAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requireUser();

  const parsed = jdSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    company: String(formData.get("company") ?? ""),
    rawText: String(formData.get("rawText") ?? ""),
    // Only staff may publish to the whole cohort; RLS enforces this too.
    isShared: formData.get("isShared") === "on" && isStaff(user.role),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const jdId = await withRequestContext(user, async (tx) => {
    const [row] = await tx
      .insert(jobDescriptions)
      .values({
        tenantId: user.tenantId,
        createdBy: user.userId,
        title: parsed.data.title,
        company: parsed.data.company || null,
        rawText: parsed.data.rawText,
        isShared: parsed.data.isShared,
      })
      .returning({ id: jobDescriptions.id });
    return row.id;
  });

  await enqueue(
    { name: "extract-jd-keywords", userId: user.userId, jobDescriptionId: jdId },
    { jobId: dedupeKey("extract-jd", jdId) },
  );

  revalidatePath("/resume");
  return { message: "Job description saved. Analysing it now." };
}

/**
 * Requests a match between a resume and a JD.
 *
 * Reuses an existing match for the same pair rather than creating a duplicate,
 * so a student clicking twice does not end up with two rows and two jobs.
 */
export async function requestMatchAction(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const resumeId = String(formData.get("resumeId") ?? "");
  const jobDescriptionId = String(formData.get("jobDescriptionId") ?? "");

  if (!resumeId || !jobDescriptionId) {
    redirect("/resume?error=" + encodeURIComponent("Choose a resume and a job description."));
  }

  const matchId = await withRequestContext(user, async (tx) => {
    const [existing] = await tx
      .select({ id: resumeMatches.id })
      .from(resumeMatches)
      .where(
        and(
          eq(resumeMatches.resumeId, resumeId),
          eq(resumeMatches.jobDescriptionId, jobDescriptionId),
        ),
      );
    if (existing) return existing.id;

    const [row] = await tx
      .insert(resumeMatches)
      .values({
        tenantId: user.tenantId,
        userId: user.userId,
        resumeId,
        jobDescriptionId,
      })
      .returning({ id: resumeMatches.id });
    return row.id;
  });

  await enqueue(
    { name: "match-resume", userId: user.userId, matchId },
    { jobId: dedupeKey("match", matchId) },
  );

  redirect(`/resume/${matchId}`);
}

/** The student's most recent parsed resume, for the default selection. */
export async function latestResumeId(userId: string, tenantId: string) {
  return withRequestContext(
    { userId, tenantId, role: "student" },
    async (tx) => {
      const [row] = await tx
        .select({ id: resumes.id })
        .from(resumes)
        .where(eq(resumes.userId, userId))
        .orderBy(desc(resumes.uploadedAt))
        .limit(1);
      return row?.id ?? null;
    },
  );
}
