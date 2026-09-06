import { expect, test, type Page } from "@playwright/test";
import {
  completeDiagnostic,
  pollUntil,
  signUpStudent,
  type StudentAccount,
} from "./helpers";

/**
 * The full student journey, in the order a real student would walk it.
 *
 * Serial: each step builds on the last, and the point is to prove the pieces
 * connect — a diagnostic feeding a readiness score feeding a verification
 * link — not to test them in isolation.
 */
test.describe.configure({ mode: "serial" });

const STRONG_ANSWER = `Our college fest registration site started timing out on the
morning tickets opened. Every page load ran a count query over the whole registrations
table, which had grown past 40,000 rows.

First I reproduced it locally with the same data volume. Then I added logging around the
slow endpoint and found the query was taking 3.2 seconds. I decided to add an index on
the event_id column and cache the count in Redis with a 30 second TTL.

As a result response time dropped from 3.2 seconds to about 90 milliseconds, and we
handled around 1,200 concurrent users that day without a further outage. In the end the
lesson I took was to load-test with realistic data volumes before launch, not after.`;

const RESUME = `Priya Sharma
B.Tech Computer Science, 2026

SKILLS
Python, SQL (PostgreSQL), pandas, Git, Docker

PROJECTS
Built a churn prediction model using scikit-learn and pandas, evaluated with cross
validation and F1 score. Wrote unit tests with pytest and deployed behind a REST API.`;

const JOB_DESCRIPTION = `Data Analyst — Acme Analytics

About us
We are a fast growing analytics company that values curiosity and ownership.

Requirements
- Strong SQL, including query optimization and indexing
- Experience with Python and pandas for data cleaning
- Solid grounding in statistics and hypothesis testing
- Excellent communication skills

Nice to have
- Exposure to Power BI or Tableau dashboarding`;

test.describe("Student journey", () => {
  let student: StudentAccount;
  // One page for the whole journey. Playwright gives each test a fresh context
  // by default, which would drop the session between steps — and this file is
  // deliberately one continuous session, the way a real student experiences it.
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("signs up, recording explicit consent", async () => {
    student = await signUpStudent(page, "Priya Sharma");
    await expect(page.getByRole("heading", { name: /Hello, Priya/ })).toBeVisible();

    // The consent record must exist and be visible to the student.
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Consent" })).toBeVisible();
    await expect(page.getByText(/Granted on/)).toBeVisible();
  });

  test("cannot sign up without agreeing to the notice", async ({ browser }) => {
    // Own context: signing up would replace the shared session.
    const scratch = await browser.newPage();
    const page = scratch;
    await page.goto("/signup");
    await page.fill('input[name="fullName"]', "No Consent");
    await page.fill('input[name="email"]', "noconsent@sunrise.edu.in");
    await page.fill('input[name="password"]', "E2ePassword123");
    // Deliberately leave the consent box unchecked.
    await page.click('button[type="submit"]');
    // The browser blocks submission on the required checkbox, so we stay put.
    await expect(page).toHaveURL(/\/signup/);
    await scratch.close();
  });

  test("is refused when the email matches no institution", async ({ browser }) => {
    const scratch = await browser.newPage();
    const page = scratch;
    await page.goto("/signup");
    await page.fill('input[name="fullName"]', "Orphan Student");
    await page.fill('input[name="email"]', `orphan${Date.now()}@nowhere.example`);
    await page.fill('input[name="password"]', "E2ePassword123");
    await page.check('input[name="consent"]');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/could not match you to a university/i)).toBeVisible();
    await scratch.close();
  });

  test("takes a diagnostic and gets a gap report", async () => {
    await page.goto("/dashboard");
    await page.locator('form button:has-text("Start assessment")').first().click();
    await completeDiagnostic(page);

    await expect(page.getByRole("heading", { name: "Your skill-gap report" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Where you stand, area by area" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Focus here first" })).toBeVisible();

    // Benchmarks must be labelled provisional wherever they appear.
    await expect(page.getByText("Provisional benchmark")).toBeVisible();
    await expect(
      page.getByText(/have not yet been validated against real placement outcomes/i),
    ).toBeVisible();

    // Curated resources are mapped to the weakest areas.
    const resourceLinks = page.locator('a[target="_blank"]');
    expect(await resourceLinks.count()).toBeGreaterThan(0);
  });

  test("sees the attempt in their history and can retake", async () => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your attempts" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View report" }).first()).toBeVisible();
    // A completed track offers a retake rather than a first attempt.
    await expect(
      page.locator('button:has-text("Retake assessment")').first(),
    ).toBeVisible();
  });

  test("completes a mock interview and receives per-question feedback", async () => {
    await page.goto("/interview");
    await page.locator('form button:has-text("Start interview")').first().click();
    await page.waitForURL(/\/interview\/[0-9a-f-]{36}$/);

    const jump = page.locator('ol[aria-label="Jump to question"] button');
    const total = await jump.count();
    expect(total).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < total; i++) {
      await jump.nth(i).click();
      await expect(page.getByText(`Question ${i + 1} of ${total}`)).toBeVisible();
      await page.fill("textarea", STRONG_ANSWER);
      // Autosave is debounced; wait for it to settle before moving on.
      await expect(page.getByText("Saved").last()).toBeVisible();
      await page.waitForTimeout(1400);
    }

    await jump.nth(total - 1).click();
    await page.click('button:has-text("Submit for feedback")');
    await page.waitForURL(/\/feedback$/);

    // Evaluation runs in the worker, so the page starts pending.
    const scored = await pollUntil(page, async () =>
      (await page.getByRole("heading", { name: "Question by question" }).count()) > 0 &&
      (await page.locator("p.text-3xl").count()) > 0,
    );
    expect(scored, "interview was never evaluated by the worker").toBe(true);

    const overall = await page.locator("p.text-3xl").first().innerText();
    expect(Number(overall.replace("%", ""))).toBeGreaterThan(50);

    // Feedback must be actionable, and the method must be disclosed.
    await expect(page.getByText(/Evaluated by:/)).toBeVisible();
    await expect(page.getByText("What interviewers look for here").first()).toBeVisible();
  });

  test("uploads a resume, adds a JD, and gets a gap-highlighted match", async () => {
    await page.goto("/resume");

    await page.setInputFiles('input[type="file"]', {
      name: "priya-resume.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(RESUME),
    });
    await page.click('button:has-text("Upload resume")');

    const parsed = await pollUntil(page, async () =>
      (await page.getByText("Ready", { exact: true }).count()) > 0,
      { attempts: 15 },
    );
    expect(parsed, "resume was never parsed").toBe(true);

    // The retention date must be stated to the student.
    await expect(page.getByText(/deleted on/)).toBeVisible();

    await page.fill('input[name="title"]', "Data Analyst");
    await page.fill('input[name="company"]', "Acme Analytics");
    await page.fill('textarea[name="rawText"]', JOB_DESCRIPTION);
    await page.click('button:has-text("Save job description")');

    const jdReady = await pollUntil(page, async () =>
      (await page.locator('button:has-text("Compare")').count()) > 0,
      { attempts: 15 },
    );
    expect(jdReady, "job description was never analysed").toBe(true);

    await page.click('button:has-text("Compare")');
    await page.waitForURL(/\/resume\/[0-9a-f-]{36}$/);

    const matched = await pollUntil(page, async () =>
      (await page.getByRole("heading", { name: /What this role asks for/ }).count()) > 0,
      { attempts: 15 },
    );
    expect(matched, "match never completed").toBe(true);

    // Gaps are shown, must-haves are flagged, and the honest caveat is present.
    await expect(page.getByText("must-have").first()).toBeVisible();
    await expect(
      page.getByText(/means the words are not in your resume — not that you lack the skill/i),
    ).toBeVisible();
    // The platform must never offer to rewrite the resume.
    await expect(page.getByText(/rewrite/i)).toHaveCount(0);
  });

  test("has a readiness score built from the components they completed", async () => {
    const ready = await pollUntil(
      page,
      async () => {
        await page.goto("/account");
        return (
          await page.getByRole("heading", { name: "Placement readiness" }).count()
        ) > 0;
      },
      { attempts: 12 },
    );
    expect(ready, "readiness score was never computed").toBe(true);

    await expect(page.getByText(/based on \d of 3 components/)).toBeVisible();
    // All three components should be present after the journey above.
    for (const component of ["Diagnostic", "Mock interview", "Resume match"]) {
      await expect(page.getByRole("definition").or(page.getByText(component)).first())
        .toBeVisible();
    }
  });

  test("can raise a data export request", async () => {
    await page.goto("/account");
    await page.selectOption('select[name="type"]', "export");
    await page.click('button:has-text("Submit request")');
    await expect(page.getByText(/Export requested/i)).toBeVisible();
    await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  });

  test("issues a verification link and can revoke it", async () => {
    await page.goto("/account/profile");
    await page.fill('input[name="label"]', "Acme application");
    await page.click('button:has-text("Create verification link")');

    await expect(page.getByText(/Copy it now/i)).toBeVisible();
    const shareUrl = await page.locator("code").first().innerText();
    expect(shareUrl).toContain("/verify/");

    // The link resolves publicly, with no session.
    const token = shareUrl.split("/verify/")[1].trim();
    const anonContext = await page.context().browser()!.newContext();
    const anon = await anonContext.newPage();
    await anon.goto(`/verify/${token}`);
    await expect(anon.getByText("Verified by SkillGaps")).toBeVisible();
    await expect(anon.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
    // The public page must carry the provisional caveat.
    await expect(anon.getByText(/provisional estimates/i)).toBeVisible();
    // And must not leak contact details or the resume.
    await expect(anon.getByText(student.email)).toHaveCount(0);
    await expect(anon.getByText(/priya-resume/i)).toHaveCount(0);

    // Revoke, and the same link must stop resolving.
    await page.goto("/account/profile");
    await page.click('button:has-text("Revoke")');
    await expect(page.getByText("Revoked", { exact: true }).first()).toBeVisible();

    const response = await anon.goto(`/verify/${token}`);
    expect(response?.status()).toBe(404);
    await anonContext.close();
  });
});
