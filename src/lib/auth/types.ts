export type UserRole =
  | "student"
  | "faculty"
  | "admin"
  | "employer"
  | "super_admin";

export interface SessionUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  fullName: string;
}

/**
 * Everything the rest of the app is allowed to know about authentication.
 *
 * Two implementations exist: `local` (self-hosted email + password, used in
 * development and for pilots without external dependencies) and `supabase`
 * (Supabase Auth issues the JWT; this app verifies it and maps it to a row in
 * `users`). Both produce the same `SessionUser`, and both feed the same
 * database GUCs that RLS reads, so swapping providers changes no policy and
 * no query.
 */
export interface AuthProvider {
  readonly name: "local" | "supabase";
  /** Resolve the current request's user, or null when signed out. */
  getSessionUser(): Promise<SessionUser | null>;
  /** Only meaningful for `local`; Supabase issues its own tokens. */
  signIn?(email: string, password: string): Promise<SessionUser>;
  signOut(): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_credentials"
      | "unknown_tenant"
      | "email_taken"
      | "weak_password"
      | "not_supported" = "invalid_credentials",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const STAFF_ROLES: readonly UserRole[] = ["faculty", "admin", "super_admin"];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}
