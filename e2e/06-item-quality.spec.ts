import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD, login, signUpStudent } from "./helpers";

/**
 * Item quality, end to end.
 *
 * Two claims worth proving in a browser. First, that the report is reachable
 * only by the platform owner — it pools responses across every institution and
 * describes a bank no single college owns, so a TPO reaching it would be both
 * a tenancy leak and a message they cannot act on. Second, that when there is
 * no analysis it says so plainly rather than rendering an empty page that
 * looks like "the bank is fine".
 */

test.describe.configure({ mode: "serial" });

let owner: Page;

test.beforeAll(async ({ browser }) => {
  owner = await browser.newPage();
  await login(owner, ACCOUNTS.superAdmin, DEMO_PASSWORD);
  await owner.waitForURL("**/admin");
});

test.afterAll(async () => {
  await owner.close();
});

test.describe("Item quality", () => {
  test("the platform owner can open the report", async () => {
    await owner.goto("/admin/items");
    await expect(
      owner.getByRole("heading", { name: "Item quality", exact: true }),
    ).toBeVisible();
    // The purpose is stated: this is about the questions, not the students.
    await expect(owner.getByText(/rests on the questions underneath/i)).toBeVisible();
  });

  test("says plainly when nothing has been analysed yet", async () => {
    await owner.goto("/admin/items");
    // An empty page here would read as "the bank is fine", which is the one
    // thing it must not imply.
    await expect(owner.getByText(/No analysis has been run yet/i)).toBeVisible();
    await expect(owner.getByText("python analyse_items.py")).toBeVisible();
  });

  test("the owner sees the item quality link in their navigation", async () => {
    await owner.goto("/admin");
    await expect(
      owner.getByRole("navigation").getByRole("link", { name: "Item quality" }),
    ).toBeVisible();
  });

  test("a TPO is sent home, and never offered the link", async ({ browser }) => {
    const tpo = await browser.newPage();
    await login(tpo, ACCOUNTS.sunriseTpo, DEMO_PASSWORD);
    await tpo.waitForURL("**/admin");

    // Not offered.
    await expect(
      tpo.getByRole("navigation").getByRole("link", { name: "Item quality" }),
    ).toHaveCount(0);

    // And not reachable by typing the URL either.
    const response = await tpo.goto("/admin/items");
    expect(response?.status()).toBe(200);
    await expect(tpo).toHaveURL(/\/admin$/);
    await expect(tpo.getByRole("heading", { name: "Item quality" })).toHaveCount(0);
    await tpo.close();
  });

  test("a student cannot reach it", async ({ browser }) => {
    const student = await browser.newPage();
    await signUpStudent(student, "Item Probe");
    await student.goto("/admin/items");
    await expect(student).toHaveURL(/\/dashboard/);
    await student.close();
  });

  test("an employer cannot reach it", async ({ browser }) => {
    const employer = await browser.newPage();
    await login(employer, ACCOUNTS.employer, DEMO_PASSWORD);
    await employer.waitForURL("**/employer");
    await employer.goto("/admin/items");
    await expect(employer).toHaveURL(/\/employer/);
    await employer.close();
  });

  test("an unauthenticated visitor is sent to login", async ({ browser }) => {
    const anon = await browser.newPage();
    await anon.goto("/admin/items");
    await expect(anon).toHaveURL(/\/login/);
    await anon.close();
  });
});
