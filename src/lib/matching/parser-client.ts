import "server-only";

/**
 * HTTP client for the Python parser service.
 *
 * The main app never parses PDFs or extracts keywords itself — those concerns
 * live in `services/parser`. This module is the only place that knows the
 * service exists.
 */

export interface ExtractedSkill {
  skill: string;
  skillArea: string;
  weight: number;
  occurrences: number;
  required: boolean;
}

export interface ParsedResume {
  text: string;
  charCount: number;
  skills: ExtractedSkill[];
}

export class ParserUnavailableError extends Error {}
/** The input could not be used — a scanned PDF, an empty file. User-facing. */
export class ParserRejectedError extends Error {}

const TIMEOUT_MS = 30_000;

function baseUrl(): string | null {
  const url = process.env.PARSER_SERVICE_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

export function isParserConfigured(): boolean {
  return baseUrl() !== null;
}

function authHeaders(): Record<string, string> {
  const token = process.env.PARSER_SERVICE_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const url = baseUrl();
  if (!url) {
    throw new ParserUnavailableError(
      "The document parsing service is not configured.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...authHeaders(), ...(init.headers ?? {}) },
    });
  } catch (err) {
    throw new ParserUnavailableError(
      err instanceof Error && err.name === "AbortError"
        ? "The parsing service timed out."
        : "The parsing service could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 422 || response.status === 413) {
    // The service distinguishes bad input from its own failure, and so must
    // we: a student needs to be told their PDF is a scan, not that we broke.
    const body = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new ParserRejectedError(
      body?.detail ?? "That file could not be read.",
    );
  }

  if (!response.ok) {
    throw new ParserUnavailableError(
      `Parsing service returned ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

export async function parseResume(args: {
  fileName: string;
  contentType: string;
  data: Buffer;
}): Promise<ParsedResume> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(args.data)], { type: args.contentType }),
    args.fileName,
  );
  return call<ParsedResume>("/parse/resume", { method: "POST", body: form });
}

export async function parseResumeText(text: string): Promise<ParsedResume> {
  const form = new FormData();
  form.append("text", text);
  return call<ParsedResume>("/parse/resume", { method: "POST", body: form });
}

export async function extractJdKeywords(
  text: string,
): Promise<{ skills: ExtractedSkill[]; charCount: number }> {
  return call("/extract/keywords", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function parserHealth(): Promise<{
  status: string;
  pdfSupport: boolean;
} | null> {
  try {
    return await call("/health", { method: "GET" });
  } catch {
    return null;
  }
}
