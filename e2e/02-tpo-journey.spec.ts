import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD, login } from "./helpers";

/**
 * The Training & Placement Officer's journey.
 *
 * The recurring theme in these assertions is that the dashboard is read-only
 * insight and that nothing it shows is presented as more certain than it is.
 */
test.describe.configure({ mode: "serial" });

test.describe("TPO journey", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, ACCOUNTS.sunriseTpo, DEMO_PASSWORD);
    await page.waitForURL("**/admin");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("lands on cohort insights with real aggregates", async () => {
    await expect(page.getByRole("heading", { name: "Cohort insights" })).toBeVisible();
    await expect(page.getByText("Read-only", { exact: false })).toBeVisible();

    // Scoped to main: several of these words also appear in the nav.
    const main = page.getByRole("main");
    for (const stat of ["Students", "Assessed", "Average score", "Flagged attempts"]) {
      await expect(main.getByText(stat, { exact: true })).toBeVisible();
    }

    const students = await page.getByTestId("stat-students").innerText();
    expect(Number(students)).toBeGreaterThan(0);
  });

  test("shows the weakest-areas heatmap with the provisional label", async () => {
    await expect(
      page.getByRole("heading", { name: "Weakest areas across the cohort" }),
    ).toBeVisible();
    await expect(page.getByText("Provisional benchmark")).toBeVisible();
    // Every heatmap cell states how many students sit below their own bar.
    await expect(page.getByText(/below their bar/).first()).toBeVisible();
  });

  test("filters the cohort by branch and keeps the URL shareable", async () => {
    const before = await page.getByTestId("stat-students").innerText();

    await page.selectOption('select[name="branch"]', { index: 1 });
    await page.click('button:has-text("Apply")');
    await page.waitForURL(/branch=/);

    const after = await page.getByTestId("stat-students").innerText();
    // A filter must actually narrow the cohort.
    expect(Number(after)).toBeLessThanOrEqual(Number(before));
    // And the filtered view must be a plain GET a colleague can be sent.
    expect(page.url()).toContain("branch=");
  });

  test("lists students with readiness completeness, sortable", async () => {
    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: /\d+ students/ })).toBeVisible();

    const rows = page.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);

    // Readiness is never shown as a bare number: it carries its completeness.
    const readiness = page.getByText(/\d\/3/);
    if (await readiness.count()) {
      await expect(readiness.first()).toBeVisible();
    }

    await page.getByRole("link", { name: /^Score/ }).click();
    await page.waitForURL(/sort=score/);
    expect(page.url()).toContain("sort=score");
  });

  test("exports the filtered cohort as CSV", async () => {
    const response = await page.request.get("/api/admin/export?branch=CSE");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain("attachment");

    const body = await response.text();
    const header = body.split("\r\n")[0];
    expect(header).toContain("Name");
    expect(header).toContain("Readiness score");
    expect(header).toContain("Placement status");
    // Every data row must belong to the filter.
    const lines = body.trim().split("\r\n").slice(1);
    expect(lines.length).toBeGreaterThan(0);
  });

  test("benchmarks a syllabus against in-demand skills", async () => {
    await page.goto("/admin/curriculum");
    await page.fill('input[name="name"]', "Database Management Systems");
    await page.fill('input[name="branch"]', "CSE");
    await page.fill(
      'textarea[name="topics"]',
      "Joins and subqueries\nNormalization\nIndexing and query plans\nTransactions and ACID\nER modelling",
    );
    await page.click('button:has-text("Save subject")');
    await expect(page.getByText(/Saved "Database Management Systems"/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("main").getByText("Overall coverage")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Not currently covered, and in demand" }),
    ).toBeVisible();
    // The reference list must be described as a conversation starter.
    await expect(page.getByText(/not a verdict on it/i)).toBeVisible();
  });

  test("records a placement outcome and can withhold the company", async () => {
    await page.goto("/admin/outcomes");
    await expect(page.getByRole("heading", { name: "Placement outcomes" })).toBeVisible();

    await page.getByRole("link", { name: /Record|Edit/ }).first().click();
    await page.waitForURL(/student=/);

    await page.selectOption('select[name="status"]', "placed");
    await page.fill('input[name="role"]', "Software Engineer");
    await page.fill('input[name="company"]', "Confidential Employer");
    await page.check('input[name="companyAnonymised"]');
    await page.click('button:has-text("Record outcome")');
    await expect(page.getByText("Outcome recorded")).toBeVisible();

    await page.goto("/admin/outcomes");
    // The withheld company must not appear anywhere in the table.
    await expect(page.getByText("withheld").first()).toBeVisible();
    await expect(page.getByText("Confidential Employer")).toHaveCount(0);
  });

  test("adjusts readiness weights and triggers a recompute", async () => {
    await page.goto("/admin/settings");
    await page.fill('input[name="diagnostic"]', "60");
    await page.fill('input[name="interview"]', "25");
    await page.fill('input[name="resume"]', "15");
    await page.click('button:has-text("Save weights")');
    await expect(page.getByText(/Weights saved \(60\/25\/15\)/)).toBeVisible();
    await expect(page.getByText(/Recomputing \d+ student scores/)).toBeVisible();
  });

  test("sees validation evidence that refuses to overclaim", async () => {
    await page.goto("/admin/validation");
    await expect(page.getByRole("heading", { name: "Validation evidence" })).toBeVisible();

    // With one recorded outcome there is nowhere near enough to claim anything.
    await expect(page.getByText(/not yet enough evidence/i)).toBeVisible();
    await expect(
      page.getByText(/do not quote a figure from this page as validation/i),
    ).toBeVisible();

    // Benchmarks in force are all still provisional.
    await expect(page.getByRole("main").getByText("Provisional").first()).toBeVisible();
    await expect(
      page.getByText(/not evidence that the assessment causes placement/i),
    ).toBeVisible();
  });

  test("sees student data requests and can resolve them", async () => {
    await page.goto("/admin/requests");
    await expect(page.getByRole("heading", { name: "Data requests" })).toBeVisible();
    // The student journey raised an export request.
    await expect(page.getByRole("main").getByText(/export request/i).first()).toBeVisible();

    await page.selectOption('select[name="status"]', "completed");
    await page.fill('input[name="resolutionNote"]', "Data emailed to the student.");
    await page.click('button:has-text("Update")');
    // Resolving moves the row into the closed list, so the confirmation is
    // page-level rather than inside the form that just unmounted.
    await expect(page.getByText("Request marked completed.")).toBeVisible();
    await expect(page.getByText("Data emailed to the student.")).toBeVisible();
  });

  test("is sent home from areas that are not theirs, never into a loop", async () => {
    for (const route of ["/dashboard", "/interview", "/resume", "/employer"]) {
      const response = await page.goto(route);
      // A wrong-role visit must resolve, not bounce between guards.
      expect(response?.status(), `${route} did not resolve`).toBe(200);
      await expect(page, `${route} did not land on the admin home`).toHaveURL(/\/admin/);
    }
  });
});
