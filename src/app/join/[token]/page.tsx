import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinForm } from "@/components/join-form";
import { getSessionUser } from "@/lib/auth";
import { homeFor } from "@/lib/auth/routing";
import { previewInvitation } from "@/lib/roster/redeem";

export const dynamic = "force-dynamic";

// A join link is a credential, not content. Same posture as a verification
// link: it must never be indexed or followed by a crawler.
export const metadata = {
  title: "Join your institution",
  robots: { index: false, follow: false },
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Someone already signed in cannot redeem a second account into the same
  // browser session; send them where they belong instead of half-working.
  const current = await getSessionUser();
  if (current) redirect(homeFor(current.role));

  const invitation = await previewInvitation(token);

  if (!invitation) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link href="/" className="mb-6 text-center text-xl font-semibold">
          Skill<span className="text-brand-600">Gaps</span>
        </Link>
        <div className="rounded-xl border border-ink-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(21,27,38,0.04)]">
          <h1 className="mb-2 text-xl font-semibold">This link is no longer valid</h1>
          <p className="text-sm text-ink-600">
            It may already have been used, or it may have expired. Your placement
            office can send you a new one.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Already have an account? Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const details = [
    invitation.rollNumber ? { label: "Roll number", value: invitation.rollNumber } : null,
    invitation.branch ? { label: "Branch", value: invitation.branch } : null,
    invitation.section ? { label: "Section", value: invitation.section } : null,
    invitation.batchYear
      ? { label: "Batch", value: String(invitation.batchYear) }
      : null,
  ].filter((d): d is { label: string; value: string } => d !== null);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-xl font-semibold">
        Skill<span className="text-brand-600">Gaps</span>
      </Link>
      <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-[0_1px_2px_rgba(21,27,38,0.04)]">
        <h1 className="mb-1 text-xl font-semibold">
          Join {invitation.tenantName}
        </h1>
        <p className="mb-5 text-sm text-ink-600">
          Your placement office has added you to the roster. Set a password to
          finish creating your account.
        </p>
        <JoinForm
          token={token}
          email={invitation.email}
          fullName={invitation.fullName}
          details={details}
        />
      </div>
    </div>
  );
}
