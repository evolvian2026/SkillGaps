import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import type { SessionUser } from "@/lib/auth/types";

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
    >
      {label}
    </Link>
  );
}

/**
 * Employer chrome, kept visually distinct from the university and student
 * shells so nobody misreads which side of the platform they are on.
 */
export function EmployerShell({
  user,
  employerName,
  children,
}: {
  user: SessionUser;
  employerName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-ink-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
          <Link href="/employer" className="mr-2 font-semibold text-white">
            Skill<span className="text-brand-500">Gaps</span>
            <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-100">
              Employer
            </span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center [&_a]:text-ink-200 [&_a:hover]:bg-white/10 [&_a:hover]:text-white">
            <NavLink href="/employer" label="Overview" />
            <NavLink href="/employer/candidates" label="Candidates" />
            <NavLink href="/employer/assessments" label="Assessments" />
            <NavLink href="/employer/access" label="Institutions" />
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-sm leading-tight text-ink-200 sm:block">
              {user.fullName}
              <span className="block text-xs text-ink-400">{employerName}</span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-200 hover:bg-white/10 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
