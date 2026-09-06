import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { getSessionUser, isStaff } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/dashboard");

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-600">
        SkillGaps
      </p>
      <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
        Find out where you stand against the hiring bar — before the campus
        drive, not after it.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-600">
        Take a timed diagnostic for the role you are targeting. Get a report
        showing your score in each skill area against the bar for that role,
        the two or three areas costing you the most, and free resources to
        close them.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/signup">Create a student account</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Sign in
        </ButtonLink>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: "Diagnostic, not a quiz",
            body: "Questions are drawn fresh from a bank each attempt and spread across difficulty, so your score means the same thing every time.",
          },
          {
            title: "Scored by skill area",
            body: "DSA, SQL, Python, system design and aptitude are scored separately — you find out what to fix, not just a number.",
          },
          {
            title: "Your college sees the cohort",
            body: "Your placement office gets aggregate cohort insight. Your individual answers stay between you and your own institution.",
          },
        ].map((item) => (
          <div key={item.title}>
            <h2 className="font-semibold">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{item.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-14 border-t border-ink-200 pt-6 text-xs leading-relaxed text-ink-600">
        Hiring-bar benchmarks shown in reports are provisional estimates set by
        our team. They have not yet been validated against real placement
        outcomes.{" "}
        <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
          How we handle your data
        </Link>
      </p>
    </div>
  );
}
