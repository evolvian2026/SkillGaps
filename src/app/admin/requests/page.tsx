import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { ResolveRequestForm } from "@/components/resolve-request-form";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { dataRequests, users } from "@/lib/db/schema";

export const metadata = { title: "Data requests" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warn-100 text-warn-500",
  in_progress: "bg-brand-100 text-brand-700",
  completed: "bg-good-100 text-good-500",
  rejected: "bg-ink-100 text-ink-600",
};

export default async function RequestsPage() {
  const user = await requireStaff();

  const rows = await withRequestContext(user, (tx) =>
    tx
      .select({
        id: dataRequests.id,
        type: dataRequests.type,
        status: dataRequests.status,
        studentNote: dataRequests.studentNote,
        resolutionNote: dataRequests.resolutionNote,
        createdAt: dataRequests.createdAt,
        resolvedAt: dataRequests.resolvedAt,
        studentName: users.fullName,
        studentEmail: users.email,
      })
      .from(dataRequests)
      .innerJoin(users, eq(users.id, dataRequests.userId))
      .orderBy(desc(dataRequests.createdAt)),
  );

  const open = rows.filter((r) => r.status === "pending" || r.status === "in_progress");
  const closed = rows.filter((r) => r.status === "completed" || r.status === "rejected");

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Data requests</h1>
      <p className="mb-6 text-sm text-ink-600">
        Export and deletion requests raised by your students under the DPDP Act.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          Requests are actioned manually in this release. Record what you did in
          the note so there is an audit trail, then mark the request completed.
        </Alert>
      </div>

      <SectionHeading title={`Open (${open.length})`} />
      {open.length === 0 ? (
        <Empty>No open requests.</Empty>
      ) : (
        <div className="mb-8 space-y-3">
          {open.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium capitalize">
                    {request.type} request — {request.studentName}
                  </p>
                  <p className="text-xs text-ink-600">
                    {request.studentEmail} · raised{" "}
                    {request.createdAt.toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </p>
                  {request.studentNote ? (
                    <p className="mt-2 text-sm text-ink-600">
                      &ldquo;{request.studentNote}&rdquo;
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[request.status]}`}
                >
                  {request.status === "pending" ? "Received" : "Being actioned"}
                </span>
              </div>
              <ResolveRequestForm requestId={request.id} currentStatus={request.status} />
            </Card>
          ))}
        </div>
      )}

      <SectionHeading title={`Closed (${closed.length})`} />
      {closed.length === 0 ? (
        <Empty>Nothing closed yet.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Outcome</th>
                <th className="px-5 py-3 font-medium">Resolved</th>
                <th className="px-5 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((request) => (
                <tr key={request.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-5 py-3">{request.studentName}</td>
                  <td className="px-5 py-3 capitalize text-ink-600">{request.type}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[request.status]}`}
                    >
                      {request.status === "completed" ? "Completed" : "Declined"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {request.resolvedAt?.toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    }) ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {request.resolutionNote ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
