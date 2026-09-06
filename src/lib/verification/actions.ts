"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { verifiedProfiles } from "@/lib/db/schema";
import { buildSnapshot } from "./profile";
import { issueToken } from "./token";

export interface ProfileState {
  error?: string;
  message?: string;
  /**
   * The freshly issued link. Returned once and never again — the token is
   * hashed on the way into the database, so if the student loses it they must
   * issue a new one.
   */
  shareUrl?: string;
}

const issueSchema = z.object({
  label: z.string().trim().max(120).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

const MAX_ACTIVE_LINKS = 10;

export async function issueProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireStudent();

  const daysRaw = String(formData.get("expiresInDays") ?? "").trim();
  const parsed = issueSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    expiresInDays: daysRaw === "" ? undefined : daysRaw,
  });
  if (!parsed.success) return { error: "Check the link details and try again." };

  const { token, tokenHash, publicId } = issueToken();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
    : null;

  const outcome = await withRequestContext(user, async (tx) => {
    const active = await tx
      .select({ id: verifiedProfiles.id })
      .from(verifiedProfiles)
      .where(eq(verifiedProfiles.userId, user.userId));
    const live = active.length;
    if (live >= MAX_ACTIVE_LINKS) {
      return { error: "You have reached the limit of 10 links. Revoke one first." };
    }

    const snapshot = await buildSnapshot(tx, user);

    // A link with nothing behind it is worse than no link: it looks like
    // evidence and carries none.
    if (
      snapshot.diagnostics.length === 0 &&
      snapshot.interviews.length === 0 &&
      snapshot.readiness === null
    ) {
      return {
        error:
          "There is nothing to verify yet. Complete a diagnostic or a mock interview first.",
      };
    }

    await tx.insert(verifiedProfiles).values({
      tenantId: user.tenantId,
      userId: user.userId,
      publicId,
      tokenHash,
      snapshot: snapshot as never,
      label: parsed.data.label || null,
      expiresAt,
    });

    return { ok: true as const };
  });

  if ("error" in outcome && outcome.error) return { error: outcome.error };

  revalidatePath("/account/profile");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    message:
      "Link created. Copy it now — for your security we cannot show it again.",
    shareUrl: base ? `${base.replace(/\/+$/, "")}/verify/${token}` : `/verify/${token}`,
  };
}

/**
 * Revokes a link.
 *
 * Takes effect immediately: `app.resolve_verified_profile` filters on
 * `revoked_at`, so the next request through the link finds nothing regardless
 * of what any cache or application code believes.
 */
export async function revokeProfileAction(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return;

  await withRequestContext(user, (tx) =>
    tx
      .update(verifiedProfiles)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(verifiedProfiles.id, profileId),
          eq(verifiedProfiles.userId, user.userId),
        ),
      ),
  );

  revalidatePath("/account/profile");
}
