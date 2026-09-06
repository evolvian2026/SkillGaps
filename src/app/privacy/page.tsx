import Link from "next/link";
import { CONSENT_NOTICE, CONSENT_VERSION } from "@/lib/privacy/consent";

export const metadata = { title: "How we handle your data" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">How we handle your data</h1>
      <p className="mt-1 text-sm text-ink-600">Notice version {CONSENT_VERSION}</p>

      <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-ink-800">
        {CONSENT_NOTICE}
      </p>

      <h2 className="mt-8 text-lg font-semibold">Your rights</h2>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-600">
        <li>
          <strong className="text-ink-800">Access and export.</strong> You can
          request a copy of everything we hold about you from your account page.
        </li>
        <li>
          <strong className="text-ink-800">Deletion.</strong> You can request
          erasure of your account and assessment history at any time.
        </li>
        <li>
          <strong className="text-ink-800">Withdraw consent.</strong> You can
          withdraw consent from your account page. Withdrawal does not undo
          processing already carried out.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Who can see what</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        Your individual answers and scores are visible to you and to authorised
        Training &amp; Placement staff at your own institution. Separation
        between institutions is enforced in our database itself, not only in
        application code, so another college cannot read your records. No
        employer has access to any student data in this release.
      </p>

      <p className="mt-8 text-sm leading-relaxed text-ink-600">
        Signed in already?{" "}
        <Link href="/account" className="font-medium text-brand-600 hover:underline">
          Manage your data
        </Link>
      </p>
    </div>
  );
}
