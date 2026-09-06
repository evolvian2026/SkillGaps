"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/auth/types";
import { withRequestContext } from "@/lib/db/client";
import { consentRecords, dataRequests } from "@/lib/db/schema";
import { CONSENT_NOTICE, CONSENT_POLICY_KEY, CONSENT_VERSION } from "./consent";

const requestSchema = z.object({
  type: z.enum(["export", "delete"]),
  studentNote: z.string().trim().max(1000).optional(),
});

export interface DataRequestState {
  message?: string;
  error?: string;
}

/**
 * Raise a DPDP export or erasure request.
 *
 * For the MVP this is a request-to-admin flow rather than automated deletion:
 * an irreversible cascade across attempts and scores is not something to
 * automate before there is an audited process behind it.
 */
export async function createDataRequestAction(
  _prev: DataRequestState,
  formData: FormData,
): Promise<DataRequestState> {
  const parsed = requestSchema.safeParse({
    type: formData.get("type"),
    studentNote: String(formData.get("studentNote") ?? ""),
  });
  if (!parsed.success) return { error: "Choose a request type." };

  const user = await requireUser();

  await withRequestContext(user, async (tx) => {
    const existing = await tx
      .select({ id: dataRequests.id })
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.userId, user.userId),
          eq(dataRequests.type, parsed.data.type),
          eq(dataRequests.status, "pending"),
        ),
      );
    if (existing.length > 0) return;

    await tx.insert(dataRequests).values({
      tenantId: user.tenantId,
      userId: user.userId,
      type: parsed.data.type,
      studentNote: parsed.data.studentNote || null,
    });
  });

  revalidatePath("/account");
  return {
    message:
      parsed.data.type === "export"
        ? "Export requested. Your institution's placement office will send your data."
        : "Deletion requested. Your institution's placement office will confirm once it is done.",
  };
}

/** Withdraw consent. Recorded as a new event; the original record is kept. */
export async function withdrawConsentAction(): Promise<DataRequestState> {
  const user = await requireUser();
  await withRequestContext(user, async (tx) => {
    await tx.insert(consentRecords).values({
      tenantId: user.tenantId,
      userId: user.userId,
      policyKey: CONSENT_POLICY_KEY,
      policyVersion: CONSENT_VERSION,
      granted: false,
      noticeText: CONSENT_NOTICE,
    });
  });
  revalidatePath("/account");
  return {
    message:
      "Consent withdrawn. Raise a deletion request below if you also want your existing data removed.",
  };
}

const resolveSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["in_progress", "completed", "rejected"]),
  resolutionNote: z.string().trim().max(1000).optional(),
});

/** Staff-side resolution of a data request. */
export async function resolveDataRequestAction(
  _prev: DataRequestState,
  formData: FormData,
): Promise<DataRequestState> {
  const parsed = resolveSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    resolutionNote: String(formData.get("resolutionNote") ?? ""),
  });
  if (!parsed.success) return { error: "Invalid request update." };

  const user = await requireStaff();
  if (!isStaff(user.role)) return { error: "Not authorised." };

  await withRequestContext(user, async (tx) => {
    await tx
      .update(dataRequests)
      .set({
        status: parsed.data.status,
        resolutionNote: parsed.data.resolutionNote || null,
        resolvedAt: parsed.data.status === "in_progress" ? null : new Date(),
        resolvedBy: user.userId,
      })
      .where(eq(dataRequests.id, parsed.data.requestId));
  });

  revalidatePath("/admin/requests");
  return { message: "Request updated." };
}
