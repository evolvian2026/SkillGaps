"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { issueSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/types";
import { withRequestContext } from "@/lib/db/client";
import { rosterInvitations } from "@/lib/db/schema";
import { MAX_ROSTER_ROWS, parseRosterCsv, type RosterRow } from "./csv";
import {
  classifyRoster,
  commitRoster,
  countActions,
  issueJoinToken,
  INVITATION_TTL_DAYS,
  type CommitResult,
  type RosterPreview,
} from "./import";
import { redeemInvitation } from "./redeem";

/**
 * Roster server actions.
 *
 * Preview and commit are separate round trips on purpose. An import is
 * irreversible in the way that matters — it mints links that get emailed — so
 * the TPO sees a per-row account of what will happen before anything is
 * written, and the parsed rows travel between the two steps rather than the
 * raw file being re-uploaded.
 */

export interface RosterState {
  error?: string;
  preview?: RosterPreview;
  /** Carried forward so the commit step writes exactly what was previewed. */
  rows?: RosterRow[];
  result?: CommitResult;
}

// 2 MB is comfortably above a 5,000-row roster and well below anything that
// would tie up a request. The row cap in the parser is the real limit; this
// just stops an obviously wrong file from being read at all.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export async function previewRosterAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  const user = await requireStaff();

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: "That file is larger than 2 MB. Split it and import in parts." };
    }
    text = await file.text();
  } else if (pasted) {
    text = pasted;
  } else {
    return { error: "Choose a CSV file, or paste rows into the box." };
  }

  const parsed = parseRosterCsv(text);
  if (parsed.rows.length === 0) {
    return {
      error:
        parsed.errors[0]?.message ??
        "No usable rows found. The file needs a header row with at least Name and Email.",
      preview: {
        classified: [],
        errors: parsed.errors,
        ignoredColumns: parsed.ignoredColumns,
        counts: { invite: 0, update: 0, reinvite: 0, skip_registered: 0 },
      },
    };
  }

  const classified = await withRequestContext(user, (tx) =>
    classifyRoster(tx, user.tenantId, parsed.rows),
  );

  return {
    preview: {
      classified,
      errors: parsed.errors,
      ignoredColumns: parsed.ignoredColumns,
      counts: countActions(classified),
    },
    rows: parsed.rows,
  };
}

const rowSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  rollNumber: z.string().nullable(),
  branch: z.string().nullable(),
  section: z.string().nullable(),
  batchYear: z.number().int().nullable(),
});

export async function commitRosterAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  const user = await requireStaff();

  // The rows come back from the browser, so they are re-validated rather than
  // trusted. `commitRoster` re-classifies for the same reason.
  let rows: RosterRow[];
  try {
    const parsed = z
      .array(rowSchema)
      .max(MAX_ROSTER_ROWS)
      .parse(JSON.parse(String(formData.get("rows") ?? "[]")));
    rows = parsed;
  } catch {
    return { error: "That import expired. Upload the file again." };
  }
  if (rows.length === 0) return { error: "There was nothing to import." };

  const result = await withRequestContext(user, (tx) =>
    commitRoster(tx, user.tenantId, user.userId, rows),
  );

  revalidatePath("/admin/roster");
  return { result };
}

const idSchema = z.object({ id: z.string().uuid() });

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect("/admin/roster?error=unknown");

  await withRequestContext(user, (tx) =>
    tx
      .update(rosterInvitations)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(rosterInvitations.id, parsed.data.id),
          eq(rosterInvitations.tenantId, user.tenantId),
          // Never revoke an invitation somebody already redeemed: the account
          // exists, and revoking here would only detach it from its roster row.
          eq(rosterInvitations.status, "pending"),
        ),
      ),
  );

  revalidatePath("/admin/roster");
  redirect("/admin/roster?done=revoked");
}

export interface ReissueState {
  error?: string;
  link?: { email: string; token: string };
}

/**
 * Mints a fresh link for one pending invitation.
 *
 * Necessarily invalidates the previous one — only the hash was stored, so
 * there is no way to re-display a link, only to replace it. The UI says so
 * before the button is pressed.
 */
export async function reissueInvitationAction(
  _prev: ReissueState,
  formData: FormData,
): Promise<ReissueState> {
  const user = await requireStaff();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Unknown invitation." };

  const { token, tokenHash } = issueJoinToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

  const updated = await withRequestContext(user, (tx) =>
    tx
      .update(rosterInvitations)
      .set({ tokenHash, expiresAt, status: "pending", revokedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(rosterInvitations.id, parsed.data.id),
          eq(rosterInvitations.tenantId, user.tenantId),
          // Accepted invitations are off-limits: that student already has an
          // account, and a join link would be a second way into it.
          eq(rosterInvitations.status, "pending"),
        ),
      )
      .returning({ email: rosterInvitations.email }),
  );

  if (updated.length === 0) {
    return { error: "That invitation is no longer pending, so it cannot be reissued." };
  }

  revalidatePath("/admin/roster");
  return { link: { email: updated[0].email, token } };
}

/* -------------------------------------------------------------------------
 * Student side
 * ---------------------------------------------------------------------- */

export interface JoinState {
  error?: string;
}

const joinSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(1, "Choose a password."),
  consent: z.literal("on", {
    errorMap: () => ({
      message: "You must agree before we can create your account.",
    }),
  }),
});

export async function joinAction(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const parsed = joinSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    consent: formData.get("consent") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const user = await redeemInvitation({
      token: parsed.data.token,
      password: parsed.data.password,
      consentGranted: true,
    });
    await issueSession(user.userId);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    throw err;
  }
  redirect("/dashboard");
}
