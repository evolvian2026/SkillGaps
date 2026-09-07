import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { RosterImport } from "@/components/roster-import";
import { RosterRowActions } from "@/components/roster-row-actions";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requirePlacementStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { listRoster, summariseRoster, type RosterStatus } from "@/lib/roster/queries";

export const metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<RosterStatus, string> = {
  pending: "bg-warn-100 text-warn-500",
  accepted: "bg-good-100 text-good-500",
  expired: "bg-ink-100 text-ink-600",
  revoked: "bg-ink-100 text-ink-600",
};

const STATUS_LABEL: Record<RosterStatus, string> = {
  pending: "Invited",
  accepted: "Joined",
  expired: "Expired",
  revoked: "Revoked",
};

const DONE_MESSAGE: Record<string, string> = {
  revoked: "Invitation revoked. That link no longer works.",
};

const FILTERS: { value: RosterStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Invited" },
  { value: "accepted", label: "Joined" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

/**
 * The absolute origin, so a join link can be copied straight into a mail
 * merge. Read from the request rather than configured, because a pilot runs
 * on whatever host the institution was given.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; done?: string }>;
}) {
  const { status, done } = await searchParams;
  const user = await requirePlacementStaff();
  const origin = await requestOrigin();

  const entries = await withRequestContext(user, (tx) => listRoster(tx));
  const summary = summariseRoster(entries);

  const active = FILTERS.some((f) => f.value === status)
    ? (status as RosterStatus | "all")
    : "all";
  const shown = active === "all" ? entries : entries.filter((e) => e.status === active);

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Roster</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Put your batch on the platform in one go. An import creates{" "}
        <strong>invitations</strong>, not accounts — each student sets their own
        password and gives their own consent, which is what the DPDP Act
        requires and what you cannot do on their behalf.
      </p>

      {done && DONE_MESSAGE[done] ? (
        <div className="mb-4">
          <Alert tone="success">{DONE_MESSAGE[done]}</Alert>
        </div>
      ) : null}

      <SectionHeading title="Import a roster" />
      <Card className="mb-8">
        <RosterImport origin={origin} />
      </Card>

      <SectionHeading
        title={`Invitations (${summary.total})`}
        hint="Roll number, branch, section and batch come from your file, so the cohort filters stay consistent with your own records."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["pending", "Invited, not yet joined"],
            ["accepted", "Joined"],
            ["expired", "Expired"],
            ["revoked", "Revoked"],
          ] as const
        ).map(([key, label]) => (
          <Card key={key}>
            <p className="text-2xl font-semibold tabular-nums" data-testid={`roster-${key}`}>
              {summary[key]}
            </p>
            <p className="text-xs text-ink-600">{label}</p>
          </Card>
        ))}
      </div>

      <nav className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a
            key={f.value}
            href={f.value === "all" ? "/admin/roster" : `/admin/roster?status=${f.value}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              active === f.value
                ? "bg-brand-600 text-white"
                : "border border-ink-200 text-ink-600 hover:bg-ink-100"
            }`}
          >
            {f.label}
          </a>
        ))}
      </nav>

      {shown.length === 0 ? (
        <Empty>
          {entries.length === 0
            ? "No one has been invited yet. Import a roster above."
            : "No invitations with that status."}
        </Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Roll</th>
                <th className="px-4 py-2 font-medium">Branch</th>
                <th className="px-4 py-2 font-medium">Batch</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr key={entry.id} className="border-b border-ink-100 align-top last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink-800">{entry.fullName}</td>
                  <td className="px-4 py-2.5 text-ink-600">{entry.email}</td>
                  <td className="px-4 py-2.5 text-ink-600">{entry.rollNumber ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-600">{entry.branch ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-600">
                    {entry.batchYear ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[entry.status]}`}
                    >
                      {STATUS_LABEL[entry.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.status === "pending" ? (
                      <RosterRowActions invitationId={entry.id} origin={origin} />
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
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
