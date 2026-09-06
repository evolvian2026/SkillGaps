"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, issueSession } from "./session";
import { authenticate, registerEmployerUser, registerStudent } from "./signup";
import { AuthError } from "./types";
import { isStaff, type UserRole } from "./types";

export interface AuthFormState {
  error?: string;
  values?: { email?: string; fullName?: string; inviteCode?: string };
}

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter a password."),
  inviteCode: z.string().trim().optional(),
  consent: z.literal("on", {
    errorMap: () => ({ message: "You must agree before we can create your account." }),
  }),
});

function landingFor(role: UserRole): string {
  if (role === "employer") return "/employer";
  return isStaff(role) ? "/admin" : "/dashboard";
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    inviteCode: String(formData.get("inviteCode") ?? ""),
    consent: formData.get("consent") ?? "",
  };
  const values = {
    email: raw.email,
    fullName: raw.fullName,
    inviteCode: raw.inviteCode,
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, values };
  }

  let role: UserRole;
  try {
    const user = await registerStudent({
      email: parsed.data.email,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
      inviteCode: parsed.data.inviteCode || null,
      consentGranted: true,
    });
    role = user.role;
    await issueSession(user.userId);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message, values };
    throw err;
  }
  redirect(landingFor(role));
}

const employerSignupSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name."),
  email: z.string().trim().toLowerCase().email("Enter a valid work email address."),
  password: z.string().min(1, "Enter a password."),
});

export async function employerSignupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { email: raw.email, fullName: raw.fullName };

  const parsed = employerSignupSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  try {
    const user = await registerEmployerUser(parsed.data);
    await issueSession(user.userId);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message, values };
    throw err;
  }
  redirect("/employer");
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password.", values: { email } };
  }

  let role: UserRole;
  try {
    const user = await authenticate(email, password);
    role = user.role;
    await issueSession(user.userId);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message, values: { email } };
    throw err;
  }
  redirect(landingFor(role));
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
