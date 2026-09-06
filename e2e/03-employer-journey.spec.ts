import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD, login, signUpStudent, uniqueEmail } from "./helpers";

/**
 * The employer journey, and the two-key access model that governs it.
 *
 * The assertions are arranged around one question: at each stage, exactly what
 * can this employer see? A grant alone must buy anonymised counts and nothing
 * more; a named student must require that student's own decision.
 */
test.describe.configure({ mode: "serial" });

test.describe("Employer journey", () => {
  let employer: Page;
  let tpo: Page;
  let student: Page;
  let studentName: string;

  test.beforeAll(async ({ browser }) => {
    employer = await browser.newPage();
    tpo = await browser.newPage();
    student = await browser.newPage();
  });

  test.afterAll(async () => {
    await employer.close();
    await tpo.close();
    await student.close();
  });

  test("registers against a known organisation by email domain", async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("/employer-signup");
    await page.fill('input[name="fullName"]', "New Recruiter");
    await page.fill('input[name="email"]', uniqueEmail("recruiter.", "northwind.example"));
    await page.fill('input[name="password"]', "E2ePassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/employer");
    await expect(page.getByText("Northwind Technologies").first()).toBeVisible();
    await page.close();
  });

  test("is refused when the domain matches no registered organisation", async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await page.goto("/employer-signup");
    await page.fill('input[name="fullName"]', "Unknown Recruiter");
    await page.fill('input[name="email"]', uniqueEmail("x.", "unknown-company.example"));
    await page.fill('input[name="password"]', "E2ePassword123");
    await page.click('button[type="submit"]');
    await expect(
      page.getByText(/could not match that email address to a registered employer/i),
    ).toBeVisible();
    await page.close();
  });

  test("sees nothing at all before a university grants access", async () => {
    await login(employer, ACCOUNTS.employer, DEMO_PASSWORD);
    await employer.waitForURL("**/employer");

    await expect(employer.getByText(/do not have access to any institution/i)).toBeVisible();

    await employer.goto("/employer/candidates");
    await expect(employer.getByText(/No pool data yet/i)).toBeVisible();
    await expect(employer.getByText(/No student has shared a profile/i)).toBeVisible();
  });

  test("can request access but cannot grant it to itself", async () => {
    await employer.goto("/employer/access");
    await expect(employer.getByRole("heading", { name: "Institutions" })).toBeVisible();
    // The seeded request to Sunrise is already pending.
    await expect(employer.getByText("Pending").first()).toBeVisible();
    // There is no control anywhere in the employer UI that approves a grant.
    await expect(employer.getByRole("button", { name: /Grant access/i })).toHaveCount(0);
  });

  test("the university sees the request and approves it", async () => {
    await login(tpo, ACCOUNTS.sunriseTpo, DEMO_PASSWORD);
    await tpo.waitForURL("**/admin");
    await tpo.goto("/admin/employers");

    await expect(tpo.getByText("Northwind Technologies").first()).toBeVisible();
    // The TPO must be told exactly what a grant does and does not permit.
    await expect(tpo.getByText(/anonymised/i).first()).toBeVisible();
    await expect(
      tpo.getByText(/always requires that student to share their own profile/i),
    ).toBeVisible();

    await tpo.getByRole("button", { name: "Grant access" }).first().click();
    await expect(tpo.getByText(/Access granted/i)).toBeVisible();
  });

  test("now sees anonymised counts, and no names", async () => {
    await employer.goto("/employer/candidates");

    const rows = employer.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);

    // Suppression must be explained on the page, not silently applied.
    await expect(
      employer.getByText(/fewer than five students are withheld/i),
    ).toBeVisible();

    // Not one student email may appear anywhere on the anonymised view.
    const body = await employer.locator("body").innerText();
    expect(body).not.toContain("sunrise.edu.in");
    await expect(employer.getByText(/No student has shared a profile/i)).toBeVisible();
  });

  test("creates a campus drive scoped to granted cohorts only", async () => {
    await employer.goto("/employer/assessments");
    await employer.fill('input[name="title"]', "Northwind 2026 Graduate Drive");
    await employer.fill(
      'textarea[name="description"]',
      "Screening assessment for our graduate intake.",
    );
    await employer.click('button:has-text("Create assessment")');
    await expect(employer.getByText(/open to your granted cohorts/i)).toBeVisible();

    // Only granted institutions are offered as a scope.
    const options = await employer.locator('input[name="tenantIds"]').count();
    expect(options).toBeGreaterThan(0);
  });

  test("the drive reaches students at the granted institution", async () => {
    const account = await signUpStudent(student, "Drive Candidate");
    studentName = account.name;

    await expect(
      student.getByRole("heading", { name: "Campus drives open to you" }),
    ).toBeVisible();
    await expect(student.getByText("Northwind 2026 Graduate Drive")).toBeVisible();
    // Taking a drive must not itself expose the student.
    await expect(
      student.getByText(/does not share your identity with them/i),
    ).toBeVisible();
  });

  test("a student at an ungranted institution does not see the drive", async ({
    browser,
  }) => {
    const outsider = await browser.newPage();
    await signUpStudent(outsider, "Meridian Candidate", "meridian.ac.in");
    await expect(
      outsider.getByRole("heading", { name: "Campus drives open to you" }),
    ).toHaveCount(0);
    await outsider.close();
  });

  test("the student opts in, and only then becomes visible by name", async () => {
    await student.goto("/account/sharing");
    await expect(student.getByText("Northwind Technologies").first()).toBeVisible();
    // The student must be told exactly what sharing exposes before deciding.
    await expect(student.getByText(/does not share your email address/i)).toBeVisible();

    await student.click('button:has-text("Share my profile")');
    await expect(student.getByRole("button", { name: "Withdraw sharing" })).toBeVisible();

    await employer.goto("/employer/candidates");
    await expect(employer.getByText(studentName)).toBeVisible();
  });

  test("withdrawal removes the employer's access immediately", async () => {
    await student.goto("/account/sharing");
    await student.click('button:has-text("Withdraw sharing")');
    await expect(student.getByRole("button", { name: "Share my profile" })).toBeVisible();

    await employer.goto("/employer/candidates");
    await expect(employer.getByText(studentName)).toHaveCount(0);
    await expect(employer.getByText(/No student has shared a profile/i)).toBeVisible();
  });

  test("revoking the grant removes everything, consent notwithstanding", async () => {
    // Re-share first, so the only thing changing below is the grant.
    await student.goto("/account/sharing");
    await student.click('button:has-text("Share my profile")');
    await expect(student.getByRole("button", { name: "Withdraw sharing" })).toBeVisible();

    await tpo.goto("/admin/employers");
    await tpo.getByRole("button", { name: "Revoke access" }).first().click();
    await expect(tpo.getByText(/Access revoked/i)).toBeVisible();

    await employer.goto("/employer/candidates");
    await expect(employer.getByText(studentName)).toHaveCount(0);
    await expect(employer.getByText(/No pool data yet/i)).toBeVisible();
  });

  test("the student no longer sees a revoked employer to share with", async () => {
    await student.goto("/account/sharing");
    await expect(
      student.getByText(/No employer currently has access/i),
    ).toBeVisible();
  });

  test("employers are sent home from areas that are not theirs", async () => {
    // Regression guard: sending a wrong-role visitor to another guarded area
    // used to bounce an employer between /dashboard and /admin until the
    // browser gave up with ERR_TOO_MANY_REDIRECTS.
    for (const route of [
      "/dashboard",
      "/interview",
      "/resume",
      "/admin",
      "/admin/students",
    ]) {
      const response = await employer.goto(route);
      expect(response?.status(), `${route} did not resolve`).toBe(200);
      await expect(employer, `${route} did not land on the employer home`)
        .toHaveURL(/\/employer/);
    }

    // /account is the exception on purpose: seeing and exporting your own data
    // is a right every signed-in user has, not a student feature. It must open
    // for an employer — and it must not hand them student navigation they
    // would only be bounced out of.
    const account = await employer.goto("/account");
    expect(account?.status()).toBe(200);
    await expect(employer).toHaveURL(/\/account$/);
    await expect(
      employer.getByRole("navigation").getByRole("link", { name: "Candidates" }),
    ).toBeVisible();
    await expect(
      employer.getByRole("navigation").getByRole("link", { name: "Mock interviews" }),
    ).toHaveCount(0);

    const response = await employer.request.get("/api/admin/export");
    expect(response.status()).toBe(403);
  });
});
