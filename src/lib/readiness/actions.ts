"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/auth/types";
import { withRequestContext } from "@/lib/db/client";
import { placementOutcomes, readinessWeights, users } from "@/lib/db/schema";
import { dedupeKey, enqueue } from "@/lib/queue";
import { normaliseWeights } from "./score";

export interface SettingsState {
  error?: string;
  message?: string;
}

const weightSchema = z.object({
  diagnostic: z.coerce.number().min(0).max(100),
  interview: z.coerce.number().min(0).max(100),
  resume: z.coerce.number().min(0).max(100),
});

/**
 * Sets how this institution weights the readiness components.
 *
 * Weights are normalised to sum to 1, so a TPO can enter 50/30/20 or 5/3/2 and
 * get the same result. Every student's score is then requeued for recompute —
 * leaving old scores in place under new weights would make the dashboard
 * silently inconsistent.
 */
export async function saveReadinessWeightsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireStaff();

  const parsed = weightSchema.safeParse({
    diagnostic: formData.get("diagnostic"),
    interview: formData.get("interview"),
    resume: formData.get("resume"),
  });
  if (!parsed.success) return { error: "Weights must be numbers between 0 and 100." };

  const total =
    parsed.data.diagnostic + parsed.data.interview + parsed.data.resume;
  if (total <= 0) return { error: "At least one component needs a weight above zero." };

  const weights = normaliseWeights({
    diagnostic: parsed.data.diagnostic,
    interview: parsed.data.interview,
    resume: parsed.data.resume,
  });

  const studentIds = await withRequestContext(user, async (tx) => {
    await tx
      .insert(readinessWeights)
      .values({
        tenantId: user.tenantId,
        diagnosticWeight: String(weights.diagnostic),
        interviewWeight: String(weights.interview),
        resumeWeight: String(weights.resume),
        updatedBy: user.userId,
      })
      .onConflictDoUpdate({
        target: readinessWeights.tenantId,
        set: {
          diagnosticWeight: String(weights.diagnostic),
          interviewWeight: String(weights.interview),
          resumeWeight: String(weights.resume),
          updatedAt: new Date(),
          updatedBy: user.userId,
        },
      });

    return tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "student"));
  });

  for (const student of studentIds) {
    await enqueue(
      { name: "recompute-readiness", userId: student.id },
      { jobId: dedupeKey("readiness", student.id, Date.now()) },
    );
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/students");
  return {
    message: `Weights saved (${Math.round(weights.diagnostic * 100)}/${Math.round(
      weights.interview * 100,
    )}/${Math.round(weights.resume * 100)}). Recomputing ${studentIds.length} student scores.`,
  };
}

const outcomeSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["not_placed", "placed", "opted_out", "higher_studies", "unknown"]),
  role: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  companyAnonymised: z.boolean().default(false),
  packageBand: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Records a placement outcome.
 *
 * Phase 3 calibrates hiring bars against this data, so capture is deliberately
 * plain: store what is known, allow the company to be withheld, and analyse
 * nothing yet.
 */
export async function saveOutcomeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const parsed = outcomeSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    role: String(formData.get("role") ?? ""),
    company: String(formData.get("company") ?? ""),
    companyAnonymised: formData.get("companyAnonymised") === "on",
    packageBand: String(formData.get("packageBand") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { error: "Check the outcome details and try again." };

  // A student may record only their own; staff may record for their cohort.
  if (!isStaff(user.role) && parsed.data.userId !== user.userId) {
    return { error: "You can only record your own outcome." };
  }

  const offerDate = parsed.data.status === "placed" ? new Date() : null;

  await withRequestContext(user, async (tx) => {
    await tx
      .insert(placementOutcomes)
      .values({
        tenantId: user.tenantId,
        userId: parsed.data.userId,
        status: parsed.data.status,
        role: parsed.data.role || null,
        company: parsed.data.company || null,
        companyAnonymised: parsed.data.companyAnonymised,
        packageBand: parsed.data.packageBand || null,
        offerDate,
        recordedBy: user.userId,
        notes: parsed.data.notes || null,
      })
      .onConflictDoUpdate({
        target: placementOutcomes.userId,
        set: {
          status: parsed.data.status,
          role: parsed.data.role || null,
          company: parsed.data.company || null,
          companyAnonymised: parsed.data.companyAnonymised,
          packageBand: parsed.data.packageBand || null,
          offerDate,
          recordedBy: user.userId,
          notes: parsed.data.notes || null,
          updatedAt: new Date(),
        },
      });
  });

  revalidatePath("/admin/outcomes");
  revalidatePath("/account");
  return { message: "Outcome recorded." };
}
