/**
 * Roster CSV parsing.
 *
 * Deliberately pure and I/O-free: the interesting behaviour here is what
 * happens to a messy file, and that should be testable without a database.
 *
 * Real rosters arrive as an export from whatever the college already uses.
 * They have a BOM, CRLF endings, a "Sr. No." column nobody needs, headers
 * spelled six different ways, trailing blank lines, and a stray space after
 * every comma. Rejecting the whole file over any of that would send the TPO
 * back to a spreadsheet, so the parser accepts what it can read unambiguously
 * and reports the rest row by row rather than failing wholesale.
 */

export interface RosterRow {
  email: string;
  fullName: string;
  rollNumber: string | null;
  branch: string | null;
  section: string | null;
  batchYear: number | null;
}

export interface RosterRowError {
  /** 1-based line in the uploaded file, so the message matches what they see. */
  line: number;
  message: string;
}

export interface ParsedRoster {
  rows: RosterRow[];
  errors: RosterRowError[];
  /** Header names present in the file that we did not recognise. */
  ignoredColumns: string[];
}

export const MAX_ROSTER_ROWS = 5000;

/**
 * Header aliases, normalised to lowercase alphanumerics before lookup, so
 * "Roll No.", "roll_no" and "Roll Number" all land on the same field.
 */
const HEADER_ALIASES: Record<string, keyof RosterRow> = {
  email: "email",
  emailaddress: "email",
  emailid: "email",
  collegeemail: "email",
  studentemail: "email",
  mail: "email",

  name: "fullName",
  fullname: "fullName",
  studentname: "fullName",
  student: "fullName",

  roll: "rollNumber",
  rollno: "rollNumber",
  rollnumber: "rollNumber",
  registrationnumber: "rollNumber",
  regno: "rollNumber",
  enrollmentnumber: "rollNumber",
  universityrollno: "rollNumber",

  branch: "branch",
  department: "branch",
  dept: "branch",
  stream: "branch",
  discipline: "branch",

  section: "section",
  sec: "section",
  div: "section",
  division: "section",
  class: "section",

  batch: "batchYear",
  batchyear: "batchYear",
  year: "batchYear",
  gradyear: "batchYear",
  graduationyear: "batchYear",
  passingyear: "batchYear",
  yearofpassing: "batchYear",
};

function normaliseHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Splits one CSV line, honouring quoted fields and doubled quotes.
 *
 * Hand-rolled rather than pulled from a dependency: the format we accept is
 * small, and a parser is easier to reason about than a config surface.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

/** RFC 4180 allows a quoted field to contain newlines; split on real breaks. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

// Deliberately permissive: this validates shape, not deliverability, and an
// over-strict pattern rejects real addresses. Delivery proves the rest.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export function isPlausibleEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/**
 * A batch year students could plausibly be graduating in. Bounded so a stray
 * roll number in the batch column becomes a row error rather than a cohort
 * filter nobody can explain later.
 */
export function parseBatchYear(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.match(/\d{4}/);
  if (!digits) return null;
  const year = Number(digits[0]);
  const thisYear = new Date().getFullYear();
  if (year < thisYear - 20 || year > thisYear + 10) return null;
  return year;
}

/**
 * Strips a formula trigger from a field before it is stored.
 *
 * The same CSV injection concern as the export side, in the other direction: a
 * name of `=HYPERLINK(...)` imported and later exported would execute on
 * someone's machine. Neutralised at the boundary so the stored value is inert
 * wherever it ends up.
 */
function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cleanText(value: string, max: number): string | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return neutralise(trimmed).slice(0, max);
}

export function parseRosterCsv(text: string): ParsedRoster {
  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise corrupt the
  // first header name and make the email column unrecognisable.
  const body = text.replace(/^﻿/, "");
  const lines = splitLines(body).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }], ignoredColumns: [] };
  }

  const headerFields = splitCsvLine(lines[0]);
  const columns: (keyof RosterRow | null)[] = [];
  const ignoredColumns: string[] = [];

  for (const raw of headerFields) {
    const field = HEADER_ALIASES[normaliseHeader(raw)] ?? null;
    columns.push(field);
    if (!field && raw) ignoredColumns.push(raw);
  }

  if (!columns.includes("email")) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            "No email column found. The first row must be a header containing a column named Email.",
        },
      ],
      ignoredColumns,
    };
  }

  const rows: RosterRow[] = [];
  const errors: RosterRowError[] = [];
  // Tracks the first line each address appeared on, so a duplicate can say
  // where the original was rather than just that one exists.
  const seen = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;

    if (rows.length >= MAX_ROSTER_ROWS) {
      errors.push({
        line,
        message: `More than ${MAX_ROSTER_ROWS} rows. Split the file and import it in parts.`,
      });
      break;
    }

    const fields = splitCsvLine(lines[i]);
    const get = (name: keyof RosterRow): string => {
      const at = columns.indexOf(name);
      return at === -1 ? "" : (fields[at] ?? "").trim();
    };

    const email = get("email").toLowerCase();
    if (!email) {
      errors.push({ line, message: "No email address." });
      continue;
    }
    if (!isPlausibleEmail(email)) {
      errors.push({ line, message: `"${email}" is not a valid email address.` });
      continue;
    }
    const previous = seen.get(email);
    if (previous !== undefined) {
      errors.push({
        line,
        message: `${email} already appears on line ${previous}.`,
      });
      continue;
    }

    const fullName = cleanText(get("fullName"), 120);
    if (!fullName) {
      errors.push({ line, message: `No name for ${email}.` });
      continue;
    }

    const rawBatch = get("batchYear");
    const batchYear = parseBatchYear(rawBatch);
    if (rawBatch && batchYear === null) {
      errors.push({
        line,
        message: `"${rawBatch}" is not a batch year we can read for ${email}.`,
      });
      continue;
    }

    seen.set(email, line);
    rows.push({
      email,
      fullName,
      rollNumber: cleanText(get("rollNumber"), 40),
      branch: cleanText(get("branch"), 60),
      section: cleanText(get("section"), 20),
      batchYear,
    });
  }

  return { rows, errors, ignoredColumns };
}

/** The template offered for download, so a TPO never has to guess the shape. */
export const ROSTER_TEMPLATE =
  "Name,Email,Roll number,Branch,Section,Batch year\r\n" +
  "Aarav Sharma,aarav.sharma@example.edu.in,CS21B001,CSE,A,2026\r\n" +
  "Diya Nair,diya.nair@example.edu.in,CS21B002,CSE,A,2026\r\n";
