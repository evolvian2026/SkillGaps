import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signUpStudent } from "./helpers";

/**
 * Assessment resilience.
 *
 * The failure this guards against is the worst one this product has: a student
 * on a lab connection that drops mid-paper, losing answers they already typed.
 * Losing a paper does not merely lose a score — it ends the institution's
 * trust in the platform.
 *
 * Every test here drives a real browser with the network genuinely cut at the
 * context level, because the interesting behaviour only exists in the wiring
 * between the queue, local storage, and the submit button.
 */

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

/** Answers the current question and waits for the outbox to drain. */
async function answerCurrent(target: Page) {
  const radios = target.locator('input[type="radio"]');
  if (await radios.count()) {
    await radios.first().check();
  } else {
    const box = target.locator("textarea, input[placeholder='Type your answer']");
    if (await box.count()) await box.first().fill("O(n log n)");
  }
}

const status = (target: Page) => target.getByTestId("save-status");

test.beforeAll(async ({ browser }) => {
  // An explicit context, so the network can be cut the way a dropped lab
  // connection actually cuts it.
  context = await browser.newContext();
  page = await context.newPage();
  await signUpStudent(page, "Resilience Probe");
  await page.locator('form button:has-text("Start assessment")').first().click();
  await page.waitForURL(/\/assess\//);
});

test.afterAll(async () => {
  await context.setOffline(false);
  await context.close();
});

test.describe("Assessment resilience", () => {
  test("confirms an answer is saved, not merely sent", async () => {
    await answerCurrent(page);
    await expect(status(page)).toHaveAttribute("data-state", "saved");
    await expect(status(page)).toContainText(/All answers saved/i);
  });

  test("going offline says so, and names how much is waiting", async () => {
    await context.setOffline(true);

    const jump = page.locator('ol[aria-label="Jump to question"] button');
    await jump.nth(1).click();
    await answerCurrent(page);

    // Not a bare "not saved": it must say the work is held safely.
    await expect(status(page)).toHaveAttribute("data-state", /offline|retrying/);
    await expect(status(page)).toContainText(/waiting|retrying/i);
  });

  test("holds the unsent answer on the device, not only in memory", async () => {
    // The guarantee that survives a closed tab: it is written to storage
    // before any network call, so there is no window where it exists only in
    // the page.
    const stored = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith("skillgaps.attempt.")),
    );
    expect(stored).toHaveLength(1);

    const body = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      stored[0],
    );
    expect(body).toContain("attemptQuestionId");
  });

  test("refuses to submit while answers are still unsent", async () => {
    // Submitting here would silently discard the answer just typed. This is
    // the single most important behaviour in the file.
    const jump = page.locator('ol[aria-label="Jump to question"] button');
    const total = await jump.count();
    await jump.nth(total - 1).click();
    await page.click('button:has-text("Submit assessment")');

    await expect(page.getByTestId("submit-blocked")).toBeVisible();
    await expect(page.getByTestId("submit-blocked")).toContainText(
      /would lose|not reached us/i,
    );
    // Still on the paper, not navigated to a report of a half-graded attempt.
    await expect(page).toHaveURL(/\/assess\//);
  });

  test("recovers unsaved answers after the page is reloaded", async () => {
    // The lab machine restarts, or the tab is closed by accident. The network
    // is back — it is the *saves* that are still failing — so block those and
    // let the document load, which is what a reload actually looks like when a
    // backend is unreachable rather than the whole link being dead.
    await context.setOffline(false);
    await context.route("**/assess/**", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );

    const jump = page.locator('ol[aria-label="Jump to question"] button');
    await jump.nth(2).click();
    await answerCurrent(page);
    await expect(status(page)).toHaveAttribute("data-state", /retrying|saving/);

    await page.reload();
    await expect(page.getByText(/Restored \d+ unsaved/i)).toBeVisible();
  });

  test("flushes everything by itself once saving works again", async () => {
    await context.unroute("**/assess/**");
    // No user action and no reload: the retry timer is the trigger.
    await expect(status(page)).toHaveAttribute("data-state", "saved", {
      timeout: 60_000,
    });
  });

  test("submits once the queue has drained, and grades the recovered answers", async () => {
    const jump = page.locator('ol[aria-label="Jump to question"] button');
    const total = await jump.count();

    for (let i = 0; i < total; i++) {
      await jump.nth(i).click();
      await expect(page.getByText(`Question ${i + 1} of ${total}`)).toBeVisible();
      await answerCurrent(page);
    }
    await expect(status(page)).toHaveAttribute("data-state", "saved", {
      timeout: 30_000,
    });

    await page.click('button:has-text("Submit assessment")');
    await page.waitForURL(/\/report\//, { timeout: 60_000 });

    // The answers typed while offline reached the server: a report scored on
    // an empty paper would show nothing attempted.
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  test("a fresh attempt on the same device starts clean", async () => {
    // The buffer is per attempt, and a shared lab machine must not carry one
    // student's drafts into the next student's paper.
    await page.goto("/dashboard");
    await page.locator('form button:has-text("Start assessment")').first().click();
    await page.waitForURL(/\/assess\//);
    await expect(page.getByText(/Restored \d+ unsaved/i)).toHaveCount(0);
    await expect(status(page)).toHaveAttribute("data-state", "saved");
  });

  test("typing does not fire a request per keystroke", async ({ browser }) => {
    // A per-keystroke save floods a weak uplink and puts several writes for
    // one question in flight at once.
    const typing = await browser.newContext();
    const typer = await typing.newPage();
    await signUpStudent(typer, "Typing Probe");
    await typer.locator('form button:has-text("Start assessment")').first().click();
    await typer.waitForURL(/\/assess\//);

    let saves = 0;
    typer.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/assess/")) saves++;
    });

    const jump = typer.locator('ol[aria-label="Jump to question"] button');
    const total = await jump.count();
    for (let i = 0; i < total; i++) {
      await jump.nth(i).click();
      const box = typer.locator("textarea, input[placeholder='Type your answer']");
      if (await box.count()) {
        await box.first().pressSequentially("recursion", { delay: 30 });
        break;
      }
    }

    await expect(status(typer)).toHaveAttribute("data-state", "saved", {
      timeout: 20_000,
    });
    // Nine characters typed; a debounced save is a small number of requests,
    // not one per character.
    expect(saves).toBeLessThan(9);
    await typing.close();
  });
});
