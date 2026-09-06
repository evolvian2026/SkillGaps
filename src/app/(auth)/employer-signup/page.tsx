import { redirect } from "next/navigation";
import { EmployerSignupForm } from "@/components/auth-form";
import { employerSignupAction } from "@/lib/auth/actions";
import { getSessionUser, isStaff } from "@/lib/auth";

export const metadata = { title: "Employer sign-up" };

export default async function EmployerSignupPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(
      user.role === "employer" ? "/employer" : isStaff(user.role) ? "/admin" : "/dashboard",
    );
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create an employer account</h1>
      <p className="mb-6 text-sm text-ink-600">
        For recruiters at organisations already registered with SkillGaps. Your
        work email domain identifies your organisation.
      </p>
      <EmployerSignupForm action={employerSignupAction} />
    </>
  );
}
