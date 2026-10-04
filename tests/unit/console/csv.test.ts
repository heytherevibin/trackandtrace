import { describe, expect, it } from "vitest";
import { csvField, csvFile } from "@/console/csv";

// ---------------------------------------------------------------------------
// The one CSV writer the console's exports share. The file is opened in a
// spreadsheet by the person doing a review, so it is written for that program:
// RFC 4180 quoting, CRLF, a byte-order mark, and no cell that runs as a formula.
// ---------------------------------------------------------------------------

describe("csvField", () => {
  it("writes nothing for nothing, and plain text as itself", () => {
    expect(csvField(null)).toBe("");
    expect(csvField("")).toBe("");
    expect(csvField("press")).toBe("press");
  });

  it("quotes a field that carries a comma, a quote or a line break, doubling its quotes", () => {
    expect(csvField("a, b")).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("one\r\ntwo")).toBe('"one\r\ntwo"');
  });

  it.each([["=1+1"], ["+user@example.com"], ["-5"], ["@cmd"], ["\tx"], ["\rx"]])("puts an apostrophe before %j, which a spreadsheet would run as a formula", (value) => {
    expect(csvField(value).replace(/^"/, "")).toMatch(/^'/);
  });
});

describe("csvFile", () => {
  it("is a byte-order mark, the header, then one CRLF-ended line per row", () => {
    expect(csvFile(["email", "tags"], [["a@example.com", "press beta"], ["b@example.com", null]])).toBe("﻿email,tags\r\na@example.com,press beta\r\nb@example.com,");
  });

  it("is the header alone when there are no rows", () => {
    expect(csvFile(["email"], [])).toBe("﻿email");
  });
});
