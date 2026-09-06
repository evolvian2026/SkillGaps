import "server-only";
import { judge0Config } from "@/lib/env";

/**
 * Judge0 client.
 *
 * Student-submitted code is executed only here, in Judge0's sandbox, and never
 * in the application process. When Judge0 is not configured the caller falls
 * back to storing the submission unscored (see gradeCodeAnswer) rather than
 * running anything locally.
 */

export interface TestCase {
  stdin: string;
  expectedStdout: string;
  isHidden: boolean;
}

export interface CaseResult {
  passed: boolean;
  isHidden: boolean;
  statusDescription: string;
  /** Omitted for hidden cases so the expected output stays private. */
  stdout?: string;
  stderr?: string;
}

export interface RunResult {
  ran: boolean;
  passedCount: number;
  totalCount: number;
  cases: CaseResult[];
  error?: string;
}

const ACCEPTED_STATUS_ID = 3;

function normalise(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").trimEnd();
}

function decode(value: string | null | undefined): string {
  if (!value) return "";
  return Buffer.from(value, "base64").toString("utf8");
}

export function isJudge0Configured(): boolean {
  return judge0Config() !== null;
}

/**
 * Runs one submission against every test case.
 *
 * Uses the batch endpoint with `wait=true`: for the short programs a
 * diagnostic asks for this keeps the request simple. Long-running or
 * high-volume execution belongs on the Phase 2 job queue, not here.
 */
export async function runCode(
  sourceCode: string,
  languageId: number,
  cases: readonly TestCase[],
  timeoutMs = 20_000,
): Promise<RunResult> {
  const config = judge0Config();
  if (!config) {
    return { ran: false, passedCount: 0, totalCount: cases.length, cases: [] };
  }
  if (cases.length === 0) {
    return { ran: false, passedCount: 0, totalCount: 0, cases: [] };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["X-RapidAPI-Key"] = config.apiKey;
  if (config.apiHost) headers["X-RapidAPI-Host"] = config.apiHost;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${config.url}/submissions/batch?base64_encoded=true&wait=true`,
      {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          submissions: cases.map((testCase) => ({
            language_id: languageId,
            source_code: Buffer.from(sourceCode).toString("base64"),
            stdin: Buffer.from(testCase.stdin).toString("base64"),
            expected_output: Buffer.from(testCase.expectedStdout).toString("base64"),
            cpu_time_limit: 5,
            memory_limit: 128_000,
          })),
        }),
      },
    );

    if (!response.ok) {
      return {
        ran: false,
        passedCount: 0,
        totalCount: cases.length,
        cases: [],
        error: `Judge0 returned ${response.status}`,
      };
    }

    const body = (await response.json()) as {
      submissions?: Array<{
        status?: { id: number; description: string };
        stdout?: string | null;
        stderr?: string | null;
        compile_output?: string | null;
      }>;
    };
    const submissions = body.submissions ?? [];

    const results: CaseResult[] = cases.map((testCase, index) => {
      const submission = submissions[index];
      const stdout = decode(submission?.stdout);
      const stderr = decode(submission?.stderr) || decode(submission?.compile_output);
      // Compare ourselves as well as trusting Judge0's verdict: expected_output
      // matching is whitespace-sensitive in ways students trip over constantly.
      const passed =
        submission?.status?.id === ACCEPTED_STATUS_ID ||
        normalise(stdout) === normalise(testCase.expectedStdout);

      return {
        passed,
        isHidden: testCase.isHidden,
        statusDescription: submission?.status?.description ?? "Unknown",
        ...(testCase.isHidden ? {} : { stdout, stderr }),
      };
    });

    return {
      ran: true,
      passedCount: results.filter((r) => r.passed).length,
      totalCount: results.length,
      cases: results,
    };
  } catch (err) {
    return {
      ran: false,
      passedCount: 0,
      totalCount: cases.length,
      cases: [],
      error: err instanceof Error ? err.message : "Execution failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
