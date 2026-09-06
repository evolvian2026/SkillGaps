import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-xl font-semibold">
        Skill<span className="text-brand-600">Gaps</span>
      </Link>
      <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-[0_1px_2px_rgba(21,27,38,0.04)]">
        {children}
      </div>
    </div>
  );
}
