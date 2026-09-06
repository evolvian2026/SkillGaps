import { expect, test, type Page } from "@playwright/test";
import {
  ACCOUNTS,
  DEMO_PASSWORD,
  completeDiagnostic,
  login,
  signUpStudent,
} from "./helpers";

/**
 * Security and isolation, exercised through the real HTTP surface.
 *
 * The Vitest RLS suites already prove the database policies in isolation. This
 * file proves the application actually runs behind them: that a URL guessed by
 * a signed-in user of the wrong tenant, role, or identity does not return
 * somebody else's data.
 */

const PROTECTED_ROUTES = [
  "/dashboard",
  "/interview",
  "/resume",
  "/account",
  "/account/sharing",
  "/account/profile",
  "/admin",
  "/admin/students",
  "/admin/curriculum",
  "/admin/outcomes",
  "/admin/settings",
  "/admin/employers",
  "/admin/validation",
  "/admin/requests",
  "/employer",
  "/employer/candidates",
  "/employer/assessments",
  "/employer/access",
];

test.describe("Unauthenticated access", () => {
  test("every protected route redirects to login", async ({ page }) => {
    for (const route of PROTECTED_ROUTES) {
      await page.goto(route);
      await expect(page, `${route} did not require a session`).toHaveURL(/\/login/);
    }
  });

  test("the CSV export refuses without a session", async ({ request }) => {
    const response = await request.get("/api/admin/export");
    expect(response.status()).toBe(403);
  });

  test("public pages remain public", async ({ page }) => {
    for (const route of ["/", "/login", "/signup", "/privacy", "/employer-signup"]) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} was not reachable`).toBe(200);
    }
  });
});

test.describe("Cross-tenant isolation over HTTP", () => {
  test.describe.configure({ mode: "serial" });

  let sunrisePage: Page;
  let meridianPage: Page;
  let sunriseReportUrl: string;

  test.beforeAll(async ({ browser }) => {
    sunrisePage = await browser.newPage();
    meridianPage = await browser.newPage();
  });

  test.afterAll(async () => {
    await sunrisePage.close();
    await meridianPage.close();
  });

  test("a Sunrise student produces a report", async () => {
    await signUpStudent(sunrisePage, "Isolation Probe", "sunrise.edu.in");
    await sunrisePage.locator('form button:has-text("Start assessment")').first().click();
    // The paper is randomised, so the answer control differs per question:
    // the helper handles whichever kind comes up.
    await completeDiagnostic(sunrisePage);
    sunriseReportUrl = sunrisePage.url();
  });

  test("a Meridian TPO cannot open that report by URL", async () => {
    await login(meridianPage, ACCOUNTS.meridianTpo, DEMO_PASSWORD);
    await meridianPage.waitForURL("**/admin");

    const response = await meridianPage.goto(sunriseReportUrl);
    // Not found, not a redirect to a partly-rendered page.
    expect(response?.status()).toBe(404);
  });

  test("a Meridian TPO's dashboard contains no Sunrise students", async () => {
    await meridianPage.goto("/admin/students");
    const emails = await meridianPage.locator("tbody tr").allInnerTexts();
    expect(emails.join(" ")).not.toContain("sunrise.edu.in");
  });

  test("a Meridian CSV export contains no Sunrise students", async () => {
    const response = await meridianPage.request.get("/api/admin/export");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("sunrise.edu.in");
    expect(body).toContain("meridian.ac.in");
  });

  test("a student from another tenant cannot open the report either", async ({
    browser,
  }) => {
    const outsider = await browser.newPage();
    await signUpStudent(outsider, "Meridian Outsider", "meridian.ac.in");
    const response = await outsider.goto(sunriseReportUrl);
    expect(response?.status()).toBe(404);
    await outsider.close();
  });
});

test.describe("Role boundaries", () => {
  test("a student cannot reach any admin page", async ({ page }) => {
    await signUpStudent(page, "Role Probe");
    for (const route of [
      "/admin",
      "/admin/students",
      "/admin/settings",
      "/admin/employers",
      "/admin/validation",
    ]) {
      await page.goto(route);
      await expect(page, `${route} was reachable by a student`).toHaveURL(/\/dashboard/);
    }
  });

  test("a student cannot reach the employer portal", async ({ page }) => {
    await signUpStudent(page, "Role Probe 2");
    for (const route of ["/employer", "/employer/candidates", "/employer/assessments"]) {
      const response = await page.goto(route);
      // Sent home, and the redirect terminates rather than ping-ponging
      // between guards.
      expect(response?.status(), `${route} did not resolve`).toBe(200);
      await expect(page, `${route} was reachable by a student`).toHaveURL(/\/dashboard/);
    }
  });

  test("a student cannot export the cohort CSV", async ({ page }) => {
    await signUpStudent(page, "Role Probe 3");
    const response = await page.request.get("/api/admin/export");
    expect(response.status()).toBe(403);
  });
});

test.describe("Peer isolation within one tenant", () => {
  test("one student cannot open another's report", async ({ browser }) => {
    const first = await browser.newPage();
    await signUpStudent(first, "Peer One");
    await first.locator('form button:has-text("Start assessment")').first().click();
    await completeDiagnostic(first);
    const reportUrl = first.url();
    const attemptId = reportUrl.split("/report/")[1];

    const second = await browser.newPage();
    await signUpStudent(second, "Peer Two");

    // The report page, and the assessment runner for the same attempt.
    expect((await second.goto(reportUrl))?.status()).toBe(404);
    expect((await second.goto(`/assess/${attemptId}`))?.status()).toBe(404);

    await first.close();
    await second.close();
  });
});

test.describe("Verification links", () => {
  test("a malformed or unknown token is a plain 404", async ({ page }) => {
    for (const token of [
      "not-a-real-token",
      "../../etc/passwd",
      "'%20OR%201=1--",
      "a".repeat(64),
    ]) {
      const response = await page.goto(`/verify/${encodeURIComponent(token)}`);
      expect(response?.status(), `${token} was not rejected`).toBe(404);
    }
  });

  test("a revoked token stops resolving", async ({ browser }) => {
    // Issue a real link, then revoke it, and confirm the same URL dies. The
    // student journey covers the happy path; this covers the security one.
    const page = await browser.newPage();
    await signUpStudent(page, "Revocation Probe");

    await page.locator('form button:has-text("Start assessment")').first().click();
    await completeDiagnostic(page);

    await page.goto("/account/profile");
    await page.click('button:has-text("Create verification link")');
    const shareUrl = await page.locator("code").first().innerText();
    const token = shareUrl.split("/verify/")[1].trim();

    const anon = await browser.newPage();
    expect((await anon.goto(`/verify/${token}`))?.status()).toBe(200);

    // A verification link is a credential, not content: keep it out of indexes.
    const html = await anon.content();
    expect(html).toContain("noindex");

    await page.goto("/account/profile");
    await page.click('button:has-text("Revoke")');
    await expect(page.getByText("Revoked", { exact: true }).first()).toBeVisible();

    expect((await anon.goto(`/verify/${token}`))?.status()).toBe(404);

    await anon.close();
    await page.close();
  });
});
