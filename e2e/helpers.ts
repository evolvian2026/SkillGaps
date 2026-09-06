import { expect, type Page } from "@playwright/test";

/** Password every seeded demo account shares. */
export const DEMO_PASSWORD = "SkillGaps2026";

export const ACCOUNTS = {
  sunriseTpo: "tpo@sunrise.edu.in",
  meridianTpo: "tpo@meridian.ac.in",
  employer: "recruiter@northwind.example",
} as const;

/** A unique address per run, so tests never collide with earlier runs. */
export function uniqueEmail(prefix: string, domain = "sunrise.edu.in"): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@${domain}`;
}

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

export async function logout(page: Page) {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/login");
}

export interface StudentAccount {
  email: string;
  name: string;
}

/** Registers a student and lands on their dashboard. */
export async function signUpStudent(
  page: Page,
  name = "E2E Student",
  domain = "sunrise.edu.in",
): Promise<StudentAccount> {
  const email = uniqueEmail("e2e.student.", domain);
  await page.goto("/signup");
  await page.fill('input[name="fullName"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "E2ePassword123");
  await page.check('input[name="consent"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  return { email, name };
}

/**
 * Completes a diagnostic attempt.
 *
 * Answers by clicking a radio on each question and waits for the autosave
 * indicator to settle, because the runner debounces saves and racing it
 * produces a paper that is mostly blank — which looks like a scoring bug and
 * is not one.
 */
export async function completeDiagnostic(
  page: Page,
  options: { answerIndex?: number } = {},
): Promise<void> {
  await page.waitForURL(/\/assess\/[0-9a-f-]{36}$/);
  const jump = page.locator('ol[aria-label="Jump to question"] button');
  const total = await jump.count();
  expect(total).toBeGreaterThan(0);

  for (let i = 0; i < total; i++) {
    await jump.nth(i).click();
    await expect(
      page.getByText(`Question ${i + 1} of ${total}`),
    ).toBeVisible();

    const radios = page.locator('input[type="radio"]');
    const count = await radios.count();
    if (count > 0) {
      await radios.nth(Math.min(options.answerIndex ?? 0, count - 1)).check();
    } else {
      // Short-answer or code question.
      const box = page.locator("textarea, input[placeholder='Type your answer']");
      if (await box.count()) await box.first().fill("O(n)");
    }
    await expect(page.getByText("Answers saved automatically")).toBeVisible();
  }

  await jump.nth(total - 1).click();
  await page.click('button:has-text("Submit assessment")');
  await page.waitForURL(/\/report\/[0-9a-f-]{36}$/);
}

/**
 * Polls a page until a condition holds.
 *
 * Interview evaluation, resume parsing and matching all complete in a
 * background worker, so the UI shows a pending state first. This reloads
 * rather than waiting on a selector, because the page is server-rendered and
 * will not update on its own.
 */
export async function pollUntil(
  page: Page,
  condition: () => Promise<boolean>,
  { attempts = 20, intervalMs = 1500 } = {},
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await condition()) return true;
    await page.waitForTimeout(intervalMs);
    await page.reload();
  }
  return condition();
}
