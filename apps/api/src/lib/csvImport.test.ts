import { describe, expect, test } from "bun:test";
import { parseCsvLine, parseCompanyListCsv } from "./csvImport";

describe("parseCsvLine", () => {
  test("splits on commas and trims whitespace", () => {
    expect(parseCsvLine("a, b , c")).toEqual(["a", "b", "c"]);
  });

  test("strips surrounding quotes from each cell", () => {
    expect(parseCsvLine('"Acme",website.com')).toEqual(["Acme", "website.com"]);
  });

  test("does not support an embedded comma inside a quoted field — documented limitation, not full RFC 4180", () => {
    // A real quoted-comma cell like "Acme, Inc." splits into two cells here,
    // same as a naive split(",") would — see parseCsvLine's comment.
    expect(parseCsvLine('"Acme, Inc.",website.com')).toEqual(["Acme", "Inc.", "website.com"]);
  });
});

describe("parseCompanyListCsv", () => {
  test("parses business name + website columns", () => {
    const csv = "Business Name,Website\nAcme Plumbing,acme-plumbing.example\nClean Co,https://clean-co.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toEqual([
      { businessName: "Acme Plumbing", website: "https://acme-plumbing.example/" },
      { businessName: "Clean Co", website: "https://clean-co.example/" },
    ]);
  });

  test("recognizes alternate column names case-insensitively", () => {
    const csv = "COMPANY,URL\nAcme Plumbing,acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toEqual([{ businessName: "Acme Plumbing", website: "https://acme-plumbing.example/" }]);
  });

  test("falls back to the domain as the business name when no name column is present", () => {
    const csv = "Website\nacme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toEqual([{ businessName: "acme-plumbing.example", website: "https://acme-plumbing.example/" }]);
  });

  test("adds https:// when the website has no protocol", () => {
    const csv = "Name,Website\nAcme,acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows[0].website).toBe("https://acme-plumbing.example/");
  });

  test("keeps an existing http:// protocol rather than forcing https", () => {
    const csv = "Name,Website\nAcme,http://acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows[0].website).toBe("http://acme-plumbing.example/");
  });

  test("skips rows with a blank or garbage website", () => {
    const csv = "Name,Website\nAcme,\nBroken,not a url\nReal Co,real-co.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toEqual([{ businessName: "Real Co", website: "https://real-co.example/" }]);
  });

  test("de-dupes rows with the same normalized website within the file", () => {
    const csv = "Name,Website\nAcme,acme-plumbing.example\nAcme Plumbing Ltd,acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toHaveLength(1);
  });

  test("returns an empty array when no recognizable website column exists", () => {
    const csv = "Name,Notes\nAcme,some notes";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toEqual([]);
  });

  // Found live: a real user's export had a column literally named
  // "Website/URL" — the original exact-match approach matched neither
  // "website" nor "url" as a full cell value, so the whole import failed
  // with "no usable rows". These exercise the substring-based fix.
  test("recognizes a combined header like 'Website/URL'", () => {
    const csv = "Company Name,Website/URL\nAcme Plumbing,acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows).toEqual([{ businessName: "Acme Plumbing", website: "https://acme-plumbing.example/" }]);
  });

  test("recognizes 'Web Site' with a space the same as 'Website'", () => {
    const csv = "Name,Web Site\nAcme,acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows[0].website).toBe("https://acme-plumbing.example/");
  });

  test("recognizes 'Company Website' as the website column, not the name column", () => {
    const csv = "Name,Company Website\nAcme,acme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    expect(rows[0].businessName).toBe("Acme");
    expect(rows[0].website).toBe("https://acme-plumbing.example/");
  });

  test("resolves an ambiguous 'Domain Name' header to the website column, not the name column", () => {
    const csv = "Domain Name\nacme-plumbing.example";
    const rows = parseCompanyListCsv(csv);
    // No separate name column was found (the only column was claimed as
    // website), so the business name correctly falls back to the domain.
    expect(rows).toEqual([{ businessName: "acme-plumbing.example", website: "https://acme-plumbing.example/" }]);
  });

  test("returns an empty array for an empty file", () => {
    expect(parseCompanyListCsv("")).toEqual([]);
    expect(parseCompanyListCsv("   \n  \n")).toEqual([]);
  });
});
