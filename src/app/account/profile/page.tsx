import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProfileLinkForm } from "@/components/profile-link-form";
import { Card, Empty, SectionHeading } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { listProfiles } from "@/lib/verification/profile";
import { revokeProfileAction } from "@/lib/verification/actions";

export const metadata = { title: "Verification links" };
export const dynamic = "force-dynamic";

export default async function ProfileLinksPage() {
  const user = await requireStudent();
  const links = await withRequestContext(user, (tx) =>
    listProfiles(tx, user.userId),
  );

  const isLive = (l: (typeof links)[number]) =>
    !l.revokedAt && (!l.expiresAt || l.expiresAt.getTime() > Date.now());

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Verification links</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Share a verifiable summary of your results with an employer. Each link
        is a separate secret you can revoke on its own, so you never have to
        withdraw one employer&apos;s access by cutting off another&apos;s.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Create a link" />
          <ProfileLinkForm />
        </Card>

        <div>
          <SectionHeading title="Your links" />
          {links.length === 0 ? (
            <Empty>You have not created any verification links.</Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-ink-100">
                {links.map((link) => (
                  <li key={link.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {link.label ?? "Untitled link"}
                          <span className="ml-2 font-mono text-xs text-ink-600">
                            {link.publicId}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          Created{" "}
                          {link.issuedAt.toLocaleDateString("en-IN", {
                            dateStyle: "medium",
                          })}
                          {link.expiresAt
                            ? ` · expires ${link.expiresAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                            : " · no expiry"}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          Viewed {link.viewCount}{" "}
                          {link.viewCount === 1 ? "time" : "times"}
                          {link.lastViewedAt
                            ? `, last on ${link.lastViewedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`block rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isLive(link)
                              ? "bg-good-100 text-good-500"
                              : "bg-ink-100 text-ink-600"
                          }`}
                        >
                          {link.revokedAt
                            ? "Revoked"
                            : isLive(link)
                              ? "Active"
                              : "Expired"}
                        </span>
                        {isLive(link) ? (
                          <form action={revokeProfileAction} className="mt-1.5">
                            <input type="hidden" name="profileId" value={link.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-risk-500 hover:underline"
                            >
                              Revoke
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Link
        href="/account"
        className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to your data
      </Link>
    </AppShell>
  );
}
