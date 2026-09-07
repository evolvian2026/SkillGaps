import { describe, expect, it } from "vitest";
import {
  MAX_ROSTER_ROWS,
  isPlausibleEmail,
  parseBatchYear,
  parseRosterCsv,
  splitCsvLine,
} from "@/lib/roster/csv";

/**
 * The parser's job is to survive a real college roster, which is an export
 * from whatever system the office already runs. These cases are the shapes
 * that file actually arrives in.
 */

describe("splitCsvLine", () => {
  it("splits plain fields and trims surrounding space", () => {
    expect(splitCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(splitCsvLine('"Sharma, Aarav",cse')).toEqual(["Sharma, Aarav", "cse"]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitCsvLine('"He said ""hi""",x')).toEqual(['He said "hi"', "x"]);
  });

  it("preserves empty trailing fields", () => {
    expect(splitCsvLine("a,,")).toEqual(["a", "", ""]);
  });
});

describe("parseBatchYear", () => {
  it("reads a plain year", () => {
    expect(parseBatchYear("2026")).toBe(2026);
  });

  it("reads a year out of a range like 2022-2026", () => {
    expect(parseBatchYear("2022-2026")).toBe(2022);
  });

  it("refuses a value that is not a plausible batch", () => {
    expect(parseBatchYear("1899")).toBeNull();
    expect(parseBatchYear("CS21B001")).toBeNull();
  });

  it("treats an empty value as simply absent", () => {
    expect(parseBatchYear("")).toBeNull();
  });
});

describe("isPlausibleEmail", () => {
  it("accepts ordinary college addresses", () => {
    expect(isPlausibleEmail("aarav.sharma@sunrise.edu.in")).toBe(true);
    expect(isPlausibleEmail("cs21b001@nit-x.ac.in")).toBe(true);
  });

  it("rejects what is obviously not an address", () => {
    for (const bad of ["", "aarav", "aarav@", "@sunrise.edu.in", "a b@c.in", "a@b"]) {
      expect(isPlausibleEmail(bad), bad).toBe(false);
    }
  });
});

describe("parseRosterCsv", () => {
  it("reads a well-formed file", () => {
    const { rows, errors } = parseRosterCsv(
      "Name,Email,Roll number,Branch,Section,Batch year\n" +
        "Aarav Sharma,aarav@sunrise.edu.in,CS21B001,CSE,A,2026\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        email: "aarav@sunrise.edu.in",
        fullName: "Aarav Sharma",
        rollNumber: "CS21B001",
        branch: "CSE",
        section: "A",
        batchYear: 2026,
      },
    ]);
  });

  it("survives a BOM, CRLF endings and padded cells", () => {
    const { rows, errors } = parseRosterCsv(
      "﻿Name, Email , Branch\r\n Aarav Sharma , AARAV@sunrise.edu.in , CSE \r\n",
    );
    expect(errors).toEqual([]);
    expect(rows[0].fullName).toBe("Aarav Sharma");
    // Addresses are lowercased so a re-import matches the first one.
    expect(rows[0].email).toBe("aarav@sunrise.edu.in");
  });

  it("recognises the many spellings a college uses for the same column", () => {
    const { rows } = parseRosterCsv(
      "Student Name,E-mail ID,Roll No.,Department,Div,Year of Passing\n" +
        "Diya Nair,diya@sunrise.edu.in,CS21B002,ECE,B,2027\n",
    );
    expect(rows[0]).toMatchObject({
      fullName: "Diya Nair",
      email: "diya@sunrise.edu.in",
      rollNumber: "CS21B002",
      branch: "ECE",
      section: "B",
      batchYear: 2027,
    });
  });

  it("ignores columns it does not know instead of refusing the file", () => {
    const { rows, ignoredColumns } = parseRosterCsv(
      "Sr. No.,Name,Email,Father's Name\n1,Aarav,aarav@sunrise.edu.in,Rakesh\n",
    );
    expect(rows).toHaveLength(1);
    expect(ignoredColumns).toEqual(["Sr. No.", "Father's Name"]);
  });

  it("reports bad rows by line and keeps the good ones", () => {
    const { rows, errors } = parseRosterCsv(
      "Name,Email\n" +
        "Aarav,aarav@sunrise.edu.in\n" +
        "Broken,not-an-email\n" +
        ",orphan@sunrise.edu.in\n" +
        "Diya,diya@sunrise.edu.in\n",
    );
    expect(rows.map((r) => r.fullName)).toEqual(["Aarav", "Diya"]);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
    expect(errors[0].message).toMatch(/not a valid email/i);
    expect(errors[1].message).toMatch(/no name/i);
  });

  it("flags a duplicate address and says where the first one was", () => {
    const { rows, errors } = parseRosterCsv(
      "Name,Email\nAarav,aarav@sunrise.edu.in\nAarav Again,AARAV@sunrise.edu.in\n",
    );
    expect(rows).toHaveLength(1);
    expect(errors[0].message).toMatch(/already appears on line 2/);
  });

  it("refuses a file with no email column, and says so once", () => {
    const { rows, errors } = parseRosterCsv("Name,Branch\nAarav,CSE\n");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/email column/i);
  });

  it("treats an empty file as an error rather than an empty import", () => {
    expect(parseRosterCsv("").errors[0].message).toMatch(/empty/i);
  });

  it("skips blank lines rather than counting them as rows", () => {
    const { rows, errors } = parseRosterCsv(
      "Name,Email\nAarav,aarav@sunrise.edu.in\n\n\n",
    );
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("rejects a batch year it cannot read rather than importing a wrong cohort", () => {
    const { rows, errors } = parseRosterCsv(
      "Name,Email,Batch\nAarav,aarav@sunrise.edu.in,CS21B001\n",
    );
    // A misaligned column must not silently become a null batch year: the
    // cohort filters are built on this, and a wrong one is invisible later.
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/not a batch year/i);
  });

  it("neutralises a formula so an exported name cannot execute later", () => {
    const { rows } = parseRosterCsv(
      "Name,Email\n\"=HYPERLINK(\"\"http://evil\"\")\",aarav@sunrise.edu.in\n",
    );
    expect(rows[0].fullName.startsWith("'=")).toBe(true);
  });

  it("stops at the row cap and says why", () => {
    const many =
      "Name,Email\n" +
      Array.from(
        { length: MAX_ROSTER_ROWS + 10 },
        (_, i) => `Student ${i},s${i}@sunrise.edu.in`,
      ).join("\n");
    const { rows, errors } = parseRosterCsv(many);
    expect(rows).toHaveLength(MAX_ROSTER_ROWS);
    expect(errors.at(-1)?.message).toMatch(/split the file/i);
  });
});
