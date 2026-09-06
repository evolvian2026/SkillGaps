import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-form";
import { loginAction } from "@/lib/auth/actions";
import { getSessionUser, isStaff } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(isStaff(user.role) ? "/admin" : "/dashboard");

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-ink-600">
        Students and Training &amp; Placement staff use the same sign-in.
      </p>
      <LoginForm action={loginAction} />
    </>
  );
}
