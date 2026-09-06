import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth-form";
import { signupAction } from "@/lib/auth/actions";
import { getSessionUser, isStaff } from "@/lib/auth";

export const metadata = { title: "Create your account" };

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/dashboard");

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Create your student account</h1>
      <p className="mb-6 text-sm text-ink-600">
        Staff accounts are created by your institution, not through this form.
      </p>
      <SignupForm action={signupAction} />
    </>
  );
}
