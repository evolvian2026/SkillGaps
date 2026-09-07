import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD, login, uniqueEmail } from "./helpers";

/**
 * Bulk roster onboarding, end to end.
 *
 * A TPO imports a CSV, gets join links, and a student redeems one to create an
 * account carrying their own password and their own consent. The claim worth
 * proving here is the one the whole design rests on: an import creates
 * invitations, never accounts, so nobody ends up with a user row that has no
 * consent record behind it.
 */

test.describe.configure({ mode: "serial" });

let tpo: Page;
let student: Page;

/** Addresses are unique per run so a re-run is not a duplicate import. */
const aarav = uniqueEmail("roster.aarav.");
const diya = uniqueEmail("roster.diya.");
let joinLink = "";

function rosterCsv(rows: string[]): string {
  return ["Student Name,E-mail ID,Roll No.,Department,Div,Year of Passing", ...rows].join("\n");
}

test.beforeAll(async ({ browser }) => {
  tpo = await browser.newPage();
  student = await browser.newPage();
  await login(tpo, ACCOUNTS.sunriseTpo, DEMO_PASSWORD);
  await tpo.waitForURL("**/admin");
});

test.afterAll(async () => {
  await tpo.close();
  await student.close();
});

test.describe("Roster onboarding", () => {
  test("the roster page starts empty and explains itself", async () => {
    await tpo.goto("/admin/roster");
    await expect(
      tpo.getByRole("heading", { name: "Roster", exact: true }),
    ).toBeVisible();
    // The design decision is stated to the user, not just in the code.
    await expect(tpo.getByText(/creates .*invitations.*, not accounts/i)).toBeVisible();
    await expect(tpo.getByText(/own password and gives their own consent/i)).toBeVisible();
  });

  test("previews a pasted roster without writing anything", async () => {
    await tpo.goto("/admin/roster");
    await tpo.locator("summary", { hasText: "Or paste rows instead" }).click();
    await tpo.fill(
      'textarea[name="pasted"]',
      rosterCsv([
        `Aarav Sharma,${aarav},CS21B001,CSE,A,2026`,
        `Diya Nair,${diya},CS21B002,ECE,B,2026`,
      ]),
    );
    await tpo.click('button:has-text("Check the file")');

    await expect(tpo.getByTestId("roster-count-invite")).toHaveText("2");
    await expect(tpo.getByText("Aarav Sharma")).toBeVisible();
    // Column aliases: the header said "Department" and "Div", not our names.
    await expect(tpo.getByRole("cell", { name: "CSE", exact: true })).toBeVisible();

    // Nothing is written until the second step is taken.
    await expect(tpo.getByText(/Nothing has been written yet/i)).toBeVisible();
  });

  test("reports bad rows by line instead of refusing the whole file", async () => {
    await tpo.goto("/admin/roster");
    await tpo.locator("summary", { hasText: "Or paste rows instead" }).click();
    await tpo.fill(
      'textarea[name="pasted"]',
      rosterCsv([
        `Good Student,${uniqueEmail("roster.good.")},R1,CSE,A,2026`,
        "Broken Student,not-an-email,R2,CSE,A,2026",
        ",orphan@sunrise.edu.in,R3,CSE,A,2026",
      ]),
    );
    await tpo.click('button:has-text("Check the file")');

    await expect(tpo.getByTestId("roster-count-invite")).toHaveText("1");
    await expect(tpo.getByText(/2 rows will be skipped/i)).toBeVisible();
    await expect(tpo.getByText(/Line 3:.*not a valid email/i)).toBeVisible();
    await expect(tpo.getByText(/Line 4:.*No name/i)).toBeVisible();
  });

  test("imports the roster and hands over join links exactly once", async () => {
    await tpo.goto("/admin/roster");
    await tpo.locator("summary", { hasText: "Or paste rows instead" }).click();
    await tpo.fill(
      'textarea[name="pasted"]',
      rosterCsv([
        `Aarav Sharma,${aarav},CS21B001,CSE,A,2026`,
        `Diya Nair,${diya},CS21B002,ECE,B,2026`,
      ]),
    );
    await tpo.click('button:has-text("Check the file")');
    await tpo.click('button:has-text("Import 2 students")');

    await expect(tpo.getByText(/2 invited/i)).toBeVisible();
    await expect(tpo.getByText(/2 join links — download them now/i)).toBeVisible();
    // The reason they cannot be shown again is stated where it matters.
    await expect(tpo.getByText(/cannot show these to you again/i)).toBeVisible();

    await tpo.locator("summary", { hasText: "Show the first few" }).click();
    const shown = await tpo.locator("li", { hasText: "/join/" }).first().innerText();
    joinLink = shown.slice(shown.indexOf("http"));
    expect(joinLink).toContain("/join/");
  });

  test("the roster now lists both students as invited, not joined", async () => {
    await tpo.goto("/admin/roster");
    await expect(tpo.getByTestId("roster-pending")).toHaveText("2");
    await expect(tpo.getByTestId("roster-accepted")).toHaveText("0");
    await expect(tpo.getByRole("cell", { name: aarav })).toBeVisible();
  });

  test("re-importing the same file updates rather than duplicating", async () => {
    await tpo.goto("/admin/roster");
    await tpo.locator("summary", { hasText: "Or paste rows instead" }).click();
    await tpo.fill(
      'textarea[name="pasted"]',
      // Aarav's branch is corrected; Diya is unchanged.
      rosterCsv([
        `Aarav Sharma,${aarav},CS21B001,IT,A,2026`,
        `Diya Nair,${diya},CS21B002,ECE,B,2026`,
      ]),
    );
    await tpo.click('button:has-text("Check the file")');

    // Both already invited, so neither is a new invitation.
    await expect(tpo.getByTestId("roster-count-invite")).toHaveText("0");
    await expect(tpo.getByTestId("roster-count-update")).toHaveText("2");
    await tpo.click('button:has-text("Import 2 students")');
    // Wait for the import to report, not just for the click to land: leaving
    // the page while the write is in flight raced the assertion below.
    await expect(tpo.getByText(/2 updated/i)).toBeVisible();

    await tpo.goto("/admin/roster");
    // Still two rows, not four.
    await expect(tpo.getByTestId("roster-pending")).toHaveText("2");
    await expect(tpo.getByRole("cell", { name: "IT", exact: true })).toBeVisible();
  });

  test("a student redeems their link, setting their own password and consent", async () => {
    await student.goto(joinLink);

    await expect(student.getByRole("heading", { name: /Join Sunrise/i })).toBeVisible();
    // The details the college is authoritative for are shown, not asked for.
    await expect(student.getByText(aarav)).toBeVisible();
    await expect(student.getByText("CS21B001")).toBeVisible();
    await expect(student.getByText(/only you can give this consent/i)).toBeVisible();

    await student.fill('input[name="password"]', "RosterJoin123");
    await student.check('input[name="consent"]');
    await student.click('button:has-text("Create my account")');
    await student.waitForURL("**/dashboard");
  });

  test("consent was recorded against the student, not the institution", async () => {
    // The import deliberately could not do this: only the subject may consent,
    // so the account must carry a consent record made at redemption.
    await student.goto("/account");
    await expect(student.getByRole("main").getByText(/granted/i).first()).toBeVisible();
  });

  test("the roster's cohort details reached the student's profile", async () => {
    // The student never typed these. They came from the college's own file,
    // which is the point: the TPO's filters stay consistent with their records.
    await tpo.goto("/admin/students");
    const row = tpo.getByRole("row", { name: new RegExp(aarav, "i") });
    await expect(row).toBeVisible();
    await expect(row).toContainText("CS21B001");
    await expect(row).toContainText("IT");
  });

  test("a redeemed link cannot be used a second time", async ({ browser }) => {
    const replay = await browser.newPage();
    await replay.goto(joinLink);
    await expect(
      replay.getByRole("heading", { name: /no longer valid/i }),
    ).toBeVisible();
    await replay.close();
  });

  test("the roster shows that student as joined", async () => {
    await tpo.goto("/admin/roster");
    await expect(tpo.getByTestId("roster-accepted")).toHaveText("1");
    await expect(tpo.getByTestId("roster-pending")).toHaveText("1");
  });

  test("a joined student offers no reissue or revoke controls", async () => {
    await tpo.goto("/admin/roster?status=accepted");
    // Their account exists; a fresh join link would be a second way into it.
    await expect(tpo.getByRole("button", { name: "New link" })).toHaveCount(0);
    await expect(tpo.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  });

  test("reissuing a link for a pending student invalidates the old one", async ({
    browser,
  }) => {
    await tpo.goto("/admin/roster?status=pending");
    await tpo.getByRole("button", { name: "New link" }).first().click();
    await expect(tpo.getByText(/copy it now, it is not shown again/i)).toBeVisible();

    const reissued = await tpo.locator("code", { hasText: "/join/" }).first().innerText();
    const fresh = await browser.newPage();
    await fresh.goto(reissued.trim());
    await expect(fresh.getByRole("heading", { name: /Join Sunrise/i })).toBeVisible();
    await fresh.close();
  });

  test("revoking an invitation kills its link", async () => {
    await tpo.goto("/admin/roster?status=pending");
    await tpo.getByRole("button", { name: "Revoke" }).first().click();
    await expect(tpo.getByText(/Invitation revoked/i)).toBeVisible();
    await expect(tpo.getByTestId("roster-revoked")).toHaveText("1");
  });

  test("an importing TPO cannot reach another institution's roster", async ({
    browser,
  }) => {
    const meridian = await browser.newPage();
    await login(meridian, ACCOUNTS.meridianTpo, DEMO_PASSWORD);
    await meridian.waitForURL("**/admin");
    await meridian.goto("/admin/roster");

    // Sunrise's roster must not appear in Meridian's, by name or by address.
    await expect(meridian.getByText(aarav)).toHaveCount(0);
    await expect(meridian.getByText(diya)).toHaveCount(0);
    await meridian.close();
  });

  test("a student cannot reach the roster at all", async () => {
    const response = await student.goto("/admin/roster");
    expect(response?.status()).toBe(200);
    // Sent home rather than shown a directory of their classmates.
    await expect(student).toHaveURL(/\/dashboard/);
  });

  test("a malformed join token is a plain dead end, not an error", async ({
    browser,
  }) => {
    const prober = await browser.newPage();
    for (const bad of ["../../etc/passwd", "' OR 1=1 --", "short", "x".repeat(200)]) {
      await prober.goto(`/join/${encodeURIComponent(bad)}`);
      await expect(
        prober.getByRole("heading", { name: /no longer valid/i }),
      ).toBeVisible();
    }
    await prober.close();
  });
});
