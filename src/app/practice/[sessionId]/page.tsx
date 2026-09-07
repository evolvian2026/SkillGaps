import { notFound } from "next/navigation";
import Link from "next/link";
import { PracticeRunner } from "@/components/practice-runner";
import { requireStudent } from "@/lib/auth";
import { isUuid } from "@/lib/practice/ids";
import { withRequestContext } from "@/lib/db/client";
import { loadPractice } from "@/lib/practice/session";

export const metadata = { title: "Practice" };
export const dynamic = "force-dynamic";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();
  const user = await requireStudent();

  const data = await withRequestContext(user, (tx) => loadPractice(tx, sessionId));
  // RLS already restricts this to the caller's own runs, so another student's
  // id arrives here as nothing at all — a 404, never a partial page.
  if (!data) notFound();

  return (
    <div>
      <PracticeRunner
        sessionId={sessionId}
        skillAreaName={data.skillAreaName}
        items={data.items}
      />
      <p className="mx-auto max-w-3xl px-4 pb-8 text-sm">
        <Link href="/dashboard" className="font-medium text-brand-600 hover:underline">
          Back to your dashboard
        </Link>
      </p>
    </div>
  );
}
