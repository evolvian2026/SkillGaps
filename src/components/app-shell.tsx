import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { isStaff, type SessionUser } from "@/lib/auth/types";

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

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const staff = isStaff(user.role);
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
          <Link href={staff ? "/admin" : "/dashboard"} className="mr-2 font-semibold">
            Skill<span className="text-brand-600">Gaps</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center">
            {staff ? (
              <>
                <NavLink href="/admin" label="Cohort" />
                <NavLink href="/admin/students" label="Students" />
                <NavLink href="/admin/curriculum" label="Curriculum" />
                <NavLink href="/admin/outcomes" label="Outcomes" />
                <NavLink href="/admin/requests" label="Data requests" />
              </>
            ) : (
              <>
                <NavLink href="/dashboard" label="Assessments" />
                <NavLink href="/interview" label="Mock interviews" />
                <NavLink href="/resume" label="Resume match" />
                <NavLink href="/account" label="My data" />
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-600 sm:inline">{user.fullName}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
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
