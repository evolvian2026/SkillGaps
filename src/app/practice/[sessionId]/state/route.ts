import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/practice/ids";
import { withRequestContext } from "@/lib/db/client";
import { loadPractice } from "@/lib/practice/session";

export const dynamic = "force-dynamic";

/**
 * The current state of one practice run.
 *
 * Exists so the runner can re-read the explanation and answer key from the
 * server after answering, rather than the page shipping every item's key up
 * front where a curious student could read it out of the source.
 *
 * RLS confines this to the caller's own session; the 404 below turns another
 * student's id into "not found" rather than "forbidden".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const data = await withRequestContext(user, (tx) => loadPractice(tx, sessionId));
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
