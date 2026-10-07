import { describe, expect, test } from "bun:test";
import { csvEscape, leadsToCsv } from "./csv";
import type { Lead } from "../db/schema";

function fakeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    searchId: "00000000-0000-0000-0000-000000000002",
    businessName: "Clean Co",
    location: "Sydney NSW",
    phone: "+61 2 9189 4164",
    email: "info@clean-co.com.au",
    emailVerified: true,
    isRoleBasedEmail: true,
    website: "https://commercial-cleaning.com.au",
    description: "Commercial cleaning in Sydney.",
    ownerName: null,
    ownerTitle: null,
    socialLinks: null,
    logoUrl: null,
    latitude: null,
    longitude: null,
    placeId: null,
    outreachStatus: "new",
    notes: null,
    sourceUrl: "https://commercial-cleaning.com.au",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("csvEscape", () => {
  test("passes plain values through unchanged", () => {
    expect(csvEscape("Clean Co")).toBe("Clean Co");
  });

  test("quotes values containing a comma", () => {
    expect(csvEscape("Sydney, Australia")).toBe('"Sydney, Australia"');
  });

  test("quotes and doubles embedded quotes", () => {
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
  });

  test("quotes values containing a newline", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  test("empty string passes through unchanged", () => {
    expect(csvEscape("")).toBe("");
  });
});

describe("leadsToCsv", () => {
  test("header includes owner, social, and geo columns", () => {
    const csv = leadsToCsv([]);
    expect(csv).toBe(
      "businessName,ownerName,ownerTitle,location,phone,email,emailVerified,isRoleBasedEmail,website,facebook,instagram,linkedin,twitter,description,outreachStatus,notes,latitude,longitude,sourceUrl"
    );
  });

  test("flattens each social platform into its own column", () => {
    const csv = leadsToCsv([
      fakeLead({
        socialLinks: {
          facebook: "https://facebook.com/cleanco",
          instagram: "https://instagram.com/cleanco",
        },
      }),
    ]);
    const [, row] = csv.split("\n");
    const cols = row.split(",");
    expect(cols).toContain("https://facebook.com/cleanco");
    expect(cols).toContain("https://instagram.com/cleanco");
  });

  test("null fields (owner, social, lat/long) render as empty, not the string 'null'", () => {
    const csv = leadsToCsv([fakeLead()]);
    expect(csv).not.toContain("null");
  });

  test("latitude/longitude render as plain numbers", () => {
    const csv = leadsToCsv([fakeLead({ latitude: -33.86, longitude: 151.2 })]);
    const [, row] = csv.split("\n");
    expect(row).toContain("-33.86");
    expect(row).toContain("151.2");
  });

  test("a comma inside a field (e.g. an address) gets quoted, not left to corrupt the column count", () => {
    const csv = leadsToCsv([fakeLead({ location: "1 Main St, Sydney NSW" })]);
    const [, row] = csv.split("\n");
    expect(row).toContain('"1 Main St, Sydney NSW"');
  });

  test("emailVerified renders as true/false, and null (inconclusive/no email) as empty rather than 'null'", () => {
    const verifiedCsv = leadsToCsv([fakeLead({ emailVerified: true })]);
    expect(verifiedCsv.split("\n")[1]).toContain("true");

    const unverifiedCsv = leadsToCsv([fakeLead({ emailVerified: false })]);
    expect(unverifiedCsv.split("\n")[1]).toContain("false");

    const unknownCsv = leadsToCsv([fakeLead({ emailVerified: null })]);
    expect(unknownCsv).not.toContain("null");
  });

  test("isRoleBasedEmail renders as true/false, and null as empty rather than 'null'", () => {
    const roleCsv = leadsToCsv([fakeLead({ isRoleBasedEmail: true })]);
    expect(roleCsv.split("\n")[1]).toContain("true");

    const personalCsv = leadsToCsv([fakeLead({ isRoleBasedEmail: false })]);
    expect(personalCsv.split("\n")[1]).toContain("false");

    const unknownCsv = leadsToCsv([fakeLead({ isRoleBasedEmail: null })]);
    expect(unknownCsv).not.toContain("null");
  });
});
