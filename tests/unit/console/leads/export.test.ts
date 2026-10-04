import { describe, expect, it } from "vitest";
import { parseLeadFilters } from "@/console/leads/filters";
import { LEAD_DELETE_ACTION, LEAD_EXPORT_ACTION, LEAD_EXPORT_TARGET, leadDeleteValue, leadExportFileName, leadExportFilters, leadsCsv, type ExportedLead } from "@/console/leads/export";

// ---------------------------------------------------------------------------
// What a tap for Delete lead or Export is minted over, and what the export's
// file is. The strings here are digested in the browser and re-digested in the
// database from the very same bytes, so each has exactly one form.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-19T09:02:00Z");

describe("what the taps are minted over", () => {
  it("names the two acts as the database names them", () => {
    expect(LEAD_EXPORT_ACTION).toBe("Exported leads");
    expect(LEAD_EXPORT_TARGET).toBe("Leads");
    expect(LEAD_DELETE_ACTION).toBe("Deleted a lead");
  });

  it("writes the export's filters as one canonical object: keys in order, off as null, the deployment among them", () => {
    expect(leadExportFilters(parseLeadFilters({}), "production", NOW)).toBe('{"account":null,"environment":"production","news":null,"since":null,"source":null,"tag":null}');
    expect(leadExportFilters(parseLeadFilters({ news: "subscribed", account: "has", source: "footer", tag: "press", seen: "30d" }), "production", NOW)).toBe(
      '{"account":"has","environment":"production","news":"subscribed","since":"2026-08-20T09:02:00.000Z","source":"footer","tag":"press"}',
    );
  });

  it("leaves the page and the open record out: an export is the whole filtered list", () => {
    expect(leadExportFilters(parseLeadFilters({ page: "3", lead: "p:a1111111-1111-4111-8111-111111111111" }), "production", NOW)).toBe(leadExportFilters(parseLeadFilters({}), "production", NOW));
  });

  it("carries the deployment in Delete's value too", () => {
    expect(leadDeleteValue("production")).toBe('{"environment":"production"}');
  });
});

describe("the file", () => {
  it("is named for the day it was made, in India", () => {
    expect(leadExportFileName(NOW)).toBe("leads-2026-09-19.csv");
    expect(leadExportFileName(new Date("2026-09-19T20:00:00Z"))).toBe("leads-2026-09-20.csv");
  });

  it("has one row per lead, whole address first, tags in one cell, and no note anywhere", () => {
    const rows: readonly ExportedLead[] = [
      { email: "asha.verma@example.com", news: "subscribed", availability: true, account: "has", source: "footer", campaignSource: "google", campaignMedium: "cpc", campaignName: "diwali, 2026", tags: ["press", "beta"], firstSeen: "2026-09-02T04:44:00+00:00", lastActivity: "2026-09-18T15:42:00+00:00" },
      { email: "+plus@example.com", news: "none", availability: false, account: "none", source: "account", campaignSource: null, campaignMedium: null, campaignName: null, tags: [], firstSeen: "2026-08-11T04:00:00+00:00", lastActivity: "2026-09-19T04:00:00+00:00" },
    ];
    expect(leadsCsv(rows).split("\r\n")).toEqual([
      "﻿email,news,availability_list,account,source,campaign_source,campaign_medium,campaign_name,tags,first_seen,last_activity",
      'asha.verma@example.com,subscribed,true,has,footer,google,cpc,"diwali, 2026",press beta,2026-09-02T04:44:00+00:00,2026-09-18T15:42:00+00:00',
      // An address that begins with a plus would run as a formula: it is written with an apostrophe.
      "'+plus@example.com,none,false,none,account,,,,,2026-08-11T04:00:00+00:00,2026-09-19T04:00:00+00:00",
    ]);
  });
});
