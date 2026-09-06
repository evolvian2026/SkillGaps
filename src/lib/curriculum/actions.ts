"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { syllabusSubjects } from "@/lib/db/schema";
import { parseTopicList } from "./compare";

export interface SyllabusState {
  error?: string;
  message?: string;
}

const subjectSchema = z.object({
  name: z.string().trim().min(2, "Give the subject a name.").max(200),
  code: z.string().trim().max(50).optional(),
  branch: z.string().trim().max(100).optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  topics: z.string().trim().min(2, "Add at least one topic."),
});

export async function saveSubjectAction(
  _prev: SyllabusState,
  formData: FormData,
): Promise<SyllabusState> {
  const user = await requireStaff();

  const semesterRaw = String(formData.get("semester") ?? "").trim();
  const parsed = subjectSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
    branch: String(formData.get("branch") ?? ""),
    semester: semesterRaw === "" ? undefined : semesterRaw,
    topics: String(formData.get("topics") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const topics = parseTopicList(parsed.data.topics);
  if (topics.length === 0) return { error: "No topics could be read from that list." };

  const subjectId = String(formData.get("subjectId") ?? "");

  await withRequestContext(user, async (tx) => {
    if (subjectId) {
      await tx
        .update(syllabusSubjects)
        .set({
          name: parsed.data.name,
          code: parsed.data.code || null,
          branch: parsed.data.branch || null,
          semester: parsed.data.semester ?? null,
          topics,
          updatedAt: new Date(),
        })
        .where(eq(syllabusSubjects.id, subjectId));
      return;
    }

    await tx.insert(syllabusSubjects).values({
      tenantId: user.tenantId,
      createdBy: user.userId,
      name: parsed.data.name,
      code: parsed.data.code || null,
      branch: parsed.data.branch || null,
      semester: parsed.data.semester ?? null,
      topics,
    });
  });

  revalidatePath("/admin/curriculum");
  return {
    message: `Saved "${parsed.data.name}" with ${topics.length} topics.`,
  };
}

export async function deleteSubjectAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const subjectId = String(formData.get("subjectId") ?? "");
  if (!subjectId) return;

  await withRequestContext(user, (tx) =>
    tx
      .delete(syllabusSubjects)
      .where(
        and(
          eq(syllabusSubjects.id, subjectId),
          eq(syllabusSubjects.tenantId, user.tenantId),
        ),
      ),
  );
  revalidatePath("/admin/curriculum");
}
