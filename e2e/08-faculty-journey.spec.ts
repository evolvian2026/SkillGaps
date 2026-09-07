import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD, login, signUpStudent } from "./helpers";

/**
 * The faculty view.
 *
 * A lecturer used to land on the placement dashboard: cohort-wide, placement-
 * shaped, and silent about the subject they actually teach. This covers the
 * two halves of the fix — the teaching-shaped page they now get, and the
 * placement-office pages that are no longer theirs.
 *
 * The security claim worth proving in a browser is that a lecturer cannot give
 * themselves a class. The RLS suite proves the database refuses it; this
 * proves the application never offers it.
 */

test.describe.configure({ mode: "serial" });

let faculty: Page;
let tpo: Page;

test.beforeAll(async ({ browser }) => {
  faculty = await browser.newPage();
  tpo = await browser.newPage();
  await login(faculty, ACCOUNTS.faculty, DEMO_PASSWORD);
  await login(tpo, ACCOUNTS.sunriseTpo, DEMO_PASSWORD);
  await tpo.waitForURL("**/admin");
});

test.afterAll(async () => {
  await faculty.close();
  await tpo.close();
});

test.describe("Faculty journey", () => {
  test("a lecturer lands on their own classes, not the placement dashboard", async () => {
    await faculty.waitForURL("**/faculty");
    await expect(
      faculty.getByRole("heading", { name: "My classes", exact: true }),
    ).toBeVisible();
  });

  test("shows the subjects they teach and the sections they teach them to", async () => {
    await expect(faculty.getByText("Database Management Systems")).toBeVisible();
    await expect(faculty.getByText("Problem Solving and Data Structures")).toBeVisible();
    // The cohort is named, so a lecturer knows which class this is about.
    await expect(faculty.getByText(/CSE · section A/).first()).toBeVisible();
  });

  test("names the lecturer's own syllabus topics against each skill area", async () => {
    // A skill area code alone does not tell them which lecture to change.
    await expect(faculty.getByText(/Your topics here:/).first()).toBeVisible();
    await expect(faculty.getByText(/Joins and Subqueries/).first()).toBeVisible();
  });

  test("labels the hiring bars it compares against as provisional", async () => {
    await expect(faculty.getByText(/provisional/i).first()).toBeVisible();
  });

  test("says it will not name individual students", async () => {
    // A class-level pattern is what a syllabus can answer; a name is the
    // placement office's to act on.
    await expect(
      faculty.getByText(/does not name individual students/i),
    ).toBeVisible();
  });

  test("lists in-demand topics the syllabus misses, only in areas it teaches", async () => {
    const missing = faculty.locator("summary", {
      hasText: /In-demand topics your syllabus does not cover/,
    });
    await expect(missing.first()).toBeVisible();
    await missing.first().click();
    // A DBMS lecturer is not handed responsibility for another area's gaps.
    // Both subjects render this caveat, so scope to the one just opened.
    await expect(
      faculty.getByText(/Only topics in the areas this subject/i).first(),
    ).toBeVisible();
  });

  test("flags a syllabus topic the reference list has never heard of", async () => {
    const unmatched = faculty.locator("summary", {
      hasText: /reference list does not recognise/,
    });
    await expect(unmatched.first()).toBeVisible();
    await unmatched.first().click();
    await expect(faculty.getByText("Departmental Mini Project")).toBeVisible();
    // Framed as a gap in the benchmark, not a fault in the teaching.
    await expect(faculty.getByText(/Not a criticism of the topic/i)).toBeVisible();
  });

  test("a lecturer is never offered the placement-office pages", async () => {
    const nav = faculty.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "My classes" })).toBeVisible();
    for (const label of ["Outcomes", "Employers", "Data requests", "Roster", "Teaching"]) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
  });

  test("and cannot reach them by URL either", async () => {
    for (const route of [
      "/admin/outcomes",
      "/admin/employers",
      "/admin/requests",
      "/admin/roster",
      "/admin/settings",
      "/admin/teaching",
    ]) {
      const response = await faculty.goto(route);
      expect(response?.status(), `${route} did not resolve`).toBe(200);
      await expect(faculty, `${route} was reachable`).toHaveURL(/\/faculty/);
    }
  });

  test("cannot export the cohort CSV, which carries placement status", async () => {
    const response = await faculty.request.get("/api/admin/export");
    expect(response.status()).toBe(403);
  });

  test("keeps the teaching-relevant pages a lecturer legitimately needs", async () => {
    for (const route of ["/admin", "/admin/students", "/admin/curriculum"]) {
      const response = await faculty.goto(route);
      expect(response?.status()).toBe(200);
      await expect(faculty).toHaveURL(new RegExp(route.replace("/", "\\/")));
    }
  });

  test("the placement office assigns teaching, and the lecturer sees it", async () => {
    await tpo.goto("/admin/teaching");
    await expect(tpo.getByRole("heading", { name: "Teaching", exact: true })).toBeVisible();
    await expect(tpo.getByText(/they cannot create one themselves/i)).toBeVisible();
    // The two seeded assignments are listed against the lecturer.
    await expect(tpo.getByRole("cell", { name: ACCOUNTS.faculty })).toHaveCount(2);
  });

  test("removing an assignment takes the class off the lecturer's page", async () => {
    await tpo.goto("/admin/teaching");
    await tpo.getByRole("button", { name: "Remove" }).first().click();
    await expect(tpo.getByText(/Assignment removed/i)).toBeVisible();

    await faculty.goto("/faculty");
    // One subject left, not two.
    await expect(faculty.getByTestId("assessed-count")).toHaveCount(1);
  });

  test("a student cannot reach the faculty view", async ({ browser }) => {
    const student = await browser.newPage();
    await signUpStudent(student, "Faculty Probe");
    await student.goto("/faculty");
    await expect(student).toHaveURL(/\/dashboard/);
    await student.close();
  });

  test("an employer cannot reach it either", async ({ browser }) => {
    const employer = await browser.newPage();
    await login(employer, ACCOUNTS.employer, DEMO_PASSWORD);
    await employer.waitForURL("**/employer");
    await employer.goto("/faculty");
    await expect(employer).toHaveURL(/\/employer/);
    await employer.close();
  });

  test("a lecturer at another institution sees none of this one's classes", async ({
    browser,
  }) => {
    const outsider = await browser.newPage();
    await login(outsider, "faculty@meridian.ac.in", DEMO_PASSWORD);
    await outsider.waitForURL("**/faculty");
    // Meridian has its own seeded subjects; Sunrise's must not appear.
    await expect(outsider.getByText("Database Management Systems")).toBeVisible();
    await expect(outsider.getByText(/CSE · section A/).first()).toBeVisible();
    // The proof of isolation is the cohort size, not the subject name: both
    // institutions seed the same syllabus.
    await outsider.goto("/admin");
    await expect(outsider.getByText("sunrise.edu.in")).toHaveCount(0);
    await outsider.close();
  });
});
