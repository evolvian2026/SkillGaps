"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireEmployer, requireStaff, requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  employerAccessGrants,
  employerAssessments,
  employerAssessmentAttempts,
  profileShareConsents,
} from "@/lib/db/schema";
import { startAttempt, AssessmentError } from "@/lib/assessment/paper";
import { SHARE_NOTICE } from "./consent";

export interface EmployerState {
  error?: string;
  message?: string;
}

/* -------------------------------------------------------------------------
 * Access grants
 * ---------------------------------------------------------------------- */

const requestSchema = z.object({
  tenantId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

/**
 * An employer asks a university for access.
 *
 * Always lands as `pending`. The RLS policy enforces that independently, so an
 * employer cannot grant themselves access even if this code were wrong.
 */
export async function requestAccessAction(
  _prev: EmployerState,
  formData: FormData,
): Promise<EmployerState> {
  const user = await requireEmployer();
  const parsed = requestSchema.safeParse({
    tenantId: formData.get("tenantId"),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { error: "Choose an institution." };

  try {
    await withRequestContext(user, (tx) =>
      tx.insert(employerAccessGrants).values({
        employerId: user.employerId,
        tenantId: parsed.data.tenantId,
        status: "pending",
        note: parsed.data.note || null,
      }),
    );
  } catch (err) {
    if (err instanceof Error && /employer_grants_unique/.test(err.message)) {
      return { error: "You have already requested access to that institution." };
    }
    throw err;
  }

  revalidatePath("/employer/access");
  return { message: "Request sent. The institution decides whether to approve it." };
}

const decideSchema = z.object({
  grantId: z.string().uuid(),
  decision: z.enum(["active", "revoked"]),
});

/** A university approves or revokes an employer's access to its cohort. */
export async function decideAccessAction(
  _prev: EmployerState,
  formData: FormData,
): Promise<EmployerState> {
  const user = await requireStaff();
  const parsed = decideSchema.safeParse({
    grantId: formData.get("grantId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { error: "Invalid decision." };

  await withRequestContext(user, (tx) =>
    tx
      .update(employerAccessGrants)
      .set({
        status: parsed.data.decision,
        grantedAt: parsed.data.decision === "active" ? new Date() : null,
        revokedAt: parsed.data.decision === "revoked" ? new Date() : null,
        grantedBy: user.userId,
      })
      .where(
        and(
          eq(employerAccessGrants.id, parsed.data.grantId),
          eq(employerAccessGrants.tenantId, user.tenantId),
        ),
      ),
  );

  revalidatePath("/admin/employers");
  // Redirect rather than return a message: deciding moves the row between the
  // pending and decided lists, which unmounts the form the message would have
  // rendered in. The confirmation belongs to the page, not to the row.
  redirect(`/admin/employers?decided=${parsed.data.decision}`);
}

/* -------------------------------------------------------------------------
 * Student opt-in
 * ---------------------------------------------------------------------- */

const shareSchema = z.object({
  employerId: z.string().uuid(),
  granted: z.enum(["true", "false"]),
});

/**
 * A student opts in to, or out of, sharing with one employer.
 *
 * Recorded as an append-only event rather than a flag, so who shared what,
 * when, and under which notice text stays reconstructible. Only the student
 * can write it — neither staff nor the employer has an INSERT path.
 */
export async function setProfileShareAction(
  formData: FormData,
): Promise<void> {
  const user = await requireStudent();
  const parsed = shareSchema.safeParse({
    employerId: formData.get("employerId"),
    granted: formData.get("granted"),
  });
  if (!parsed.success) return;

  await withRequestContext(user, (tx) =>
    tx.insert(profileShareConsents).values({
      tenantId: user.tenantId,
      userId: user.userId,
      employerId: parsed.data.employerId,
      scope: "full_profile",
      granted: parsed.data.granted === "true",
      noticeText: SHARE_NOTICE,
    }),
  );

  revalidatePath("/account/sharing");
}

/* -------------------------------------------------------------------------
 * Employer assessments
 * ---------------------------------------------------------------------- */

const assessmentSchema = z.object({
  title: z.string().trim().min(3, "Give the drive a title.").max(200),
  trackId: z.string().uuid(),
  description: z.string().trim().max(1000).optional(),
  tenantIds: z.array(z.string().uuid()).default([]),
  closesInDays: z.coerce.number().int().min(1).max(180).optional(),
});

export async function createAssessmentAction(
  _prev: EmployerState,
  formData: FormData,
): Promise<EmployerState> {
  const user = await requireEmployer();

  const closesRaw = String(formData.get("closesInDays") ?? "").trim();
  const parsed = assessmentSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    trackId: String(formData.get("trackId") ?? ""),
    description: String(formData.get("description") ?? ""),
    tenantIds: formData.getAll("tenantIds").map(String).filter(Boolean),
    closesInDays: closesRaw === "" ? undefined : closesRaw,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await withRequestContext(user, async (tx) => {
    // Narrow the scope to tenants actually granted, so a stale or tampered
    // form field cannot widen reach. RLS would deny the read anyway; this
    // keeps the stored record honest rather than merely harmless.
    const grants = await tx
      .select({ tenantId: employerAccessGrants.tenantId })
      .from(employerAccessGrants)
      .where(
        and(
          eq(employerAccessGrants.employerId, user.employerId),
          eq(employerAccessGrants.status, "active"),
        ),
      );
    const granted = new Set(grants.map((g) => g.tenantId));
    const scoped = parsed.data.tenantIds.filter((id) => granted.has(id));

    await tx.insert(employerAssessments).values({
      employerId: user.employerId,
      title: parsed.data.title,
      trackId: parsed.data.trackId,
      description: parsed.data.description || null,
      tenantIds: scoped,
      closesAt: parsed.data.closesInDays
        ? new Date(Date.now() + parsed.data.closesInDays * 86_400_000)
        : null,
      isActive: true,
      createdBy: user.userId,
    });
  });

  revalidatePath("/employer/assessments");
  return { message: "Assessment created and open to your granted cohorts." };
}

export async function toggleAssessmentAction(formData: FormData): Promise<void> {
  const user = await requireEmployer();
  const id = String(formData.get("assessmentId") ?? "");
  const next = String(formData.get("isActive") ?? "") === "true";
  if (!id) return;

  await withRequestContext(user, (tx) =>
    tx
      .update(employerAssessments)
      .set({ isActive: next })
      .where(
        and(
          eq(employerAssessments.id, id),
          eq(employerAssessments.employerId, user.employerId),
        ),
      ),
  );
  revalidatePath("/employer/assessments");
}

/**
 * A student starts an employer's assessment.
 *
 * Reuses the Phase 1 attempt engine wholesale — same randomisation, same
 * integrity measures, same scoring — and records the link. A separate,
 * less-tested path for employer drives is exactly where integrity would rot.
 */
export async function startEmployerAssessmentAction(
  formData: FormData,
): Promise<void> {
  const user = await requireStudent();
  const assessmentId = String(formData.get("assessmentId") ?? "");

  let attemptId: string;
  try {
    attemptId = await withRequestContext(user, async (tx) => {
      const [assessment] = await tx
        .select({
          id: employerAssessments.id,
          trackId: employerAssessments.trackId,
        })
        .from(employerAssessments)
        .where(eq(employerAssessments.id, assessmentId));
      // RLS already hides assessments this student's tenant is not scoped to.
      if (!assessment) throw new AssessmentError("That assessment is not open to you.");

      const newAttemptId = await startAttempt(tx, user, assessment.trackId);

      await tx
        .insert(employerAssessmentAttempts)
        .values({
          tenantId: user.tenantId,
          assessmentId: assessment.id,
          attemptId: newAttemptId,
          userId: user.userId,
        })
        .onConflictDoNothing();

      return newAttemptId;
    });
  } catch (err) {
    if (err instanceof AssessmentError) {
      redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  redirect(`/assess/${attemptId}`);
}
