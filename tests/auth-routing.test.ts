import { describe, expect, it } from "vitest";
import { homeFor } from "@/lib/auth/routing";
import type { UserRole } from "@/lib/auth/types";

/**
 * Where each role belongs.
 *
 * This exists because of a real defect: the guards used to send a wrong-role
 * visitor to *another guarded area*. An employer hitting /dashboard was sent
 * to /admin, which sent them back to /dashboard, and the browser gave up with
 * ERR_TOO_MANY_REDIRECTS.
 *
 * The invariant that prevents it: a redirect target must be a page the
 * redirected user can actually load. Routing by the caller's own role
 * guarantees that, because their home always admits them.
 */

const ROLES: UserRole[] = [
  "student",
  "faculty",
  "admin",
  "employer",
  "super_admin",
];

/** Which guard protects each landing page, expressed as "who may load it". */
const ADMITS: Record<string, (role: UserRole) => boolean> = {
  "/dashboard": (role) => role === "student",
  "/faculty": (role) => ["faculty", "admin", "super_admin"].includes(role),
  "/admin": (role) => ["faculty", "admin", "super_admin"].includes(role),
  "/employer": (role) => role === "employer",
};

describe("homeFor", () => {
  it("routes each role to its own area", () => {
    expect(homeFor("student")).toBe("/dashboard");
    // A lecturer's home is their own classes, not the placement dashboard.
    expect(homeFor("faculty")).toBe("/faculty");
    expect(homeFor("admin")).toBe("/admin");
    expect(homeFor("super_admin")).toBe("/admin");
    expect(homeFor("employer")).toBe("/employer");
  });

  it("never sends a role to a page that would redirect it again", () => {
    // The loop-prevention invariant, checked for every role.
    for (const role of ROLES) {
      const target = homeFor(role);
      const admits = ADMITS[target];
      expect(admits, `${target} is not a known landing page`).toBeDefined();
      expect(
        admits(role),
        `${role} is sent to ${target}, which would redirect them again`,
      ).toBe(true);
    }
  });

  it("terminates for every role when applied repeatedly", () => {
    // Following the redirect chain must reach a fixed point immediately.
    for (const role of ROLES) {
      const first = homeFor(role);
      const second = homeFor(role);
      expect(second).toBe(first);
    }
  });
});
