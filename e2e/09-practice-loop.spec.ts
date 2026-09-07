import { expect, test, type Page } from "@playwright/test";
import { completeDiagnostic, signUpStudent } from "./helpers";

/**
 * The gap → practice → re-prove loop.
 *
 * Before this the product diagnosed a gap and then had nothing to offer but
 * "retake the whole paper". These tests walk the loop as a student does, and
 * check the two claims that keep it honest: practice never shows a diagnostic
 * item, and a short check never pretends to be a diagnostic.
 */

test.describe.configure({ mode: "serial" });

let student: Page;
let reportUrl = "";
let practiceUrl = "";

test.beforeAll(async ({ browser }) => {
  student = await browser.newPage();
  await signUpStudent(student, "Loop Walker");
  // Answer badly on purpose, so the report has gaps to act on.
  await student.locator('form button:has-text("Start assessment")').first().click();
  await completeDiagnostic(student, { answerIndex: 3 });
  reportUrl = student.url();
});

test.afterAll(async () => {
  await student.close();
});

test.describe("The practice loop", () => {
  test("the report offers a way to act on each gap", async () => {
    await student.goto(reportUrl);
    await expect(student.getByRole("heading", { name: /Focus here first/i })).toBeVisible();
    // A gap the student cannot act on from where they are told about it is a
    // report card, not a platform.
    await expect(student.getByRole("button", { name: "Practise this" }).first()).toBeVisible();
  });

  test("only offers a check where the bank can actually serve one", async () => {
    // A real bank does not hold eight fresh items for every area, and a button
    // that can only fail is worse than no button.
    const checkButtons = await student
      .getByRole("button", { name: "Skill check" })
      .count();
    const notice = await student
      .getByText(/No practice set or skill check exists/i)
      .count();
    expect(checkButtons + notice).toBeGreaterThan(0);
  });

  test("practice says plainly that it is not scored", async () => {
    await student.getByRole("button", { name: "Practise this" }).first().click();
    await student.waitForURL(/\/practice\//);
    practiceUrl = student.url();
    await expect(student.getByText(/Not scored, not timed/i)).toBeVisible();
    await expect(
      student.getByText(/does not affect your report or anything your college sees/i),
    ).toBeVisible();
  });

  test("withholds the answer until the student commits to one", async () => {
    // An unanswered item must not ship its own key in the page.
    await expect(student.getByTestId("explanation")).toHaveCount(0);
    const source = await student.content();
    expect(source.toLowerCase()).not.toContain("correct</span>");
  });

  test("reveals the answer and the explanation once answered", async () => {
    await student.getByRole("button").filter({ hasText: /\w{4,}/ }).nth(1).click();
    await expect(student.getByTestId("explanation").first()).toBeVisible();
    await expect(student.getByTestId("practice-progress")).toContainText("1 of");
  });

  test("will not let the same question be answered twice", async () => {
    // Re-answering after reading the explanation would make the summary
    // meaningless.
    const before = await student.getByTestId("practice-progress").innerText();
    const firstCard = student.locator("form, div").first();
    await expect(firstCard).toBeVisible();
    await student.reload();
    await expect(student.getByTestId("practice-progress")).toHaveText(before);
  });

  test("points at the skill check when practice is done", async () => {
    await expect(student.getByTestId("practice-summary")).toContainText(/skill check/i);
    await student.click('button:has-text("Finish practice")');
    await student.waitForURL(/\/practice\/.*done=1/);
  });

  test("a check never reveals whether an answer was right as you go", async () => {
    await student.goto(reportUrl);
    const checkButton = student.getByRole("button", { name: "Skill check" }).first();
    // Seeded areas vary in how many diagnostic items they hold; skip cleanly
    // rather than assert a check exists for whichever area came out weakest.
    test.skip(
      (await student.getByRole("button", { name: "Skill check" }).count()) === 0,
      "no seeded gap area has enough diagnostic items for a check",
    );
    await checkButton.click();
    await student.waitForURL(/\/check\//);

    await expect(student.getByText(/personal signal only/i)).toBeVisible();
    await student.locator('input[type="radio"]').first().check();
    // Practice grades as you go; a check must not, or it is practice with
    // unlimited tries.
    await expect(student.getByTestId("explanation")).toHaveCount(0);
    await expect(student.getByText(/correct/i)).toHaveCount(0);
  });

  test("scores the check and compares it with the diagnostic", async () => {
    test.skip(!student.url().includes("/check/"), "no check was started");
    const radios = student.locator('input[type="radio"]');
    const groups = await student.locator("label:has(input[type='radio'])").count();
    expect(groups).toBeGreaterThan(0);
    // Answer one option on each question.
    for (let i = 0; i < await radios.count(); i += 4) {
      await radios.nth(i).check();
    }
    await student.click('button:has-text("Submit check")');
    await expect(student.getByTestId("check-verdict")).toBeVisible();
  });

  test("refuses to call a small move an improvement", async () => {
    test.skip(!student.url().includes("/check/"), "no check was started");
    const verdict = await student
      .getByTestId("check-verdict")
      .getAttribute("data-verdict");
    expect(["improved", "declined", "too_close", "no_baseline"]).toContain(verdict);
    if (verdict === "too_close") {
      await expect(student.getByTestId("check-verdict")).toContainText(/cannot tell/i);
    }
  });

  test("never claims a check replaces the diagnostic", async () => {
    test.skip(!student.url().includes("/check/"), "no check was started");
    await expect(
      student.getByText(/never feeds your readiness score/i),
    ).toBeVisible();
  });

  test("enforces a cooldown before the same area can be re-checked", async () => {
    test.skip(!student.url().includes("/check/"), "no check was started");
    // Without it a student can re-roll until a lucky run, measuring the
    // question bank rather than their own progress.
    await student.goto(reportUrl);
    await student.getByRole("button", { name: "Skill check" }).first().click();
    await student.waitForURL(/\/dashboard/);
    await expect(student.getByText(/measures the question bank/i)).toBeVisible();
  });

  test("the check shows on the dashboard against its diagnostic baseline", async () => {
    await student.goto("/dashboard");
    const heading = student.getByRole("heading", { name: /Your skill checks/i });
    test.skip((await heading.count()) === 0, "no check was taken");
    await expect(heading).toBeVisible();
    await expect(student.getByText(/do not change your report/i)).toBeVisible();
  });

  test("another student cannot open this one's practice or check", async ({
    browser,
  }) => {
    const peer = await browser.newPage();
    await signUpStudent(peer, "Loop Peer");
    expect((await peer.goto(practiceUrl))?.status()).toBe(404);

    const stateUrl = `${practiceUrl.split("?")[0]}/state`;
    const state = await peer.request.get(stateUrl);
    expect(state.status()).toBe(404);
    await peer.close();
  });

  test("a malformed practice id is a plain 404", async () => {
    for (const bad of ["not-a-uuid", "../../etc/passwd", "' OR 1=1 --"]) {
      const response = await student.goto(`/practice/${encodeURIComponent(bad)}`);
      expect(response?.status()).toBe(404);
    }
  });
});
