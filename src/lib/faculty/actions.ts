"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requirePlacementStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { teachingAssignments } from "@/lib/db/schema";

/**
 * Teaching assignments are written by the placement office, never by the
 * lecturer being assigned.
 *
 * `requirePlacementStaff` refuses faculty here, and the RLS on the table
 * refuses them again independently — a lecturer who could assign themselves a
 * cohort could read any section in the institution, which would turn the
 * faculty view into a self-service hole rather than a delegation.
 */

export interface TeachingState {
  error?: string;
}

const assignSchema = z.object({
  subjectId: z.string().uuid("Choose a subject."),
  facultyId: z.string().uuid("Choose a member of staff."),
  branch: z.string().trim().max(60).optional(),
  section: z.string().trim().max(20).optional(),
  batchYear: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (v >= 2000 && v <= 2100), {
      message: "Batch year looks wrong.",
    }),
});

export async function assignTeachingAction(
  _prev: TeachingState,
  formData: FormData,
): Promise<TeachingState> {
  const user = await requirePlacementStaff();

  const parsed = assignSchema.safeParse({
    subjectId: String(formData.get("subjectId") ?? ""),
    facultyId: String(formData.get("facultyId") ?? ""),
    branch: String(formData.get("branch") ?? ""),
    section: String(formData.get("section") ?? ""),
    batchYear: String(formData.get("batchYear") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await withRequestContext(user, (tx) =>
      tx.insert(teachingAssignments).values({
        tenantId: user.tenantId,
        subjectId: parsed.data.subjectId,
        facultyId: parsed.data.facultyId,
        branch: parsed.data.branch || null,
        section: parsed.data.section || null,
        batchYear: parsed.data.batchYear ?? null,
        createdBy: user.userId,
      }),
    );
  } catch (err) {
    // The policy refuses a lecturer or subject from another institution. That
    // is a real refusal worth naming rather than a generic failure.
    if (err instanceof Error && /row-level security/i.test(err.message)) {
      return {
        error:
          "That subject or member of staff does not belong to your institution.",
      };
    }
    throw err;
  }

  revalidatePath("/admin/teaching");
  redirect("/admin/teaching?done=assigned");
}

const removeSchema = z.object({ id: z.string().uuid() });

export async function removeTeachingAction(formData: FormData): Promise<void> {
  const user = await requirePlacementStaff();
  const parsed = removeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/admin/teaching");

  await withRequestContext(user, (tx) =>
    tx
      .delete(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.id, parsed.data.id),
          eq(teachingAssignments.tenantId, user.tenantId),
        ),
      ),
  );

  revalidatePath("/admin/teaching");
  redirect("/admin/teaching?done=removed");
}
