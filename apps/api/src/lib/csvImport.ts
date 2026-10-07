// Minimal CSV cell split — handles simple quoted fields. Business names,
// domains, and URLs aren't generally expected to contain embedded commas,
// so this doesn't need full RFC 4180 quoting support the way a general CSV
// parser would. Shared by every CSV-import route (exclusions, lead import).
export function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

export interface ImportedCompanyRow {
  businessName: string;
  website: string;
}

// Keyword substrings recognized for each field, matched against a
// normalized header cell (lowercased, punctuation/whitespace stripped) —
// found live that exact-match column names (the original approach here,
// and what EXCLUSION_COLUMN_NAMES in app.ts still uses) are too brittle for
// real spreadsheet exports: a column literally named "Website/URL" matched
// neither "website" nor "url" as an exact value. Normalizing first means
// "Website/URL", "Web Site", "Company Website", and "website" all reduce to
// the same comparable form.
//
// Website is checked BEFORE name, and the matched index is excluded from
// the name search, so an ambiguous header like "Domain Name" — which
// contains both a website keyword and the word "name" — resolves to the
// website column rather than being misread as the business-name column.
const WEBSITE_KEYWORDS = ["website", "url", "domain", "homepage"];
const NAME_KEYWORDS = ["businessname", "companyname", "company", "organization", "business", "name"];

function normalizeHeaderCell(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Adds a protocol if missing and validates the result is a plausible, fetchable URL. */
function normalizeWebsiteUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) return null; // rejects garbage like "https://localhost"
    return url.toString();
  } catch {
    return null;
  }
}

function deriveNameFromWebsite(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

/**
 * Parses a spreadsheet export of (business name, website) pairs for the
 * "enrich my existing company list" import — see POST /api/search/import.
 * Requires a recognizable website/url column (there's nothing to scrape
 * without one); a business name column is optional and falls back to the
 * site's own domain as a reasonable display name when absent.
 *
 * De-dupes by normalized website WITHIN the file itself (the same company
 * listed twice in the spreadsheet shouldn't become two scrape jobs) — this
 * is separate from, and in addition to, the pipeline's own business-name
 * dedup and the global excludedDomains check, which both still apply once
 * these rows become real candidates.
 */
export function parseCompanyListCsv(csv: string): ImportedCompanyRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeaderCell);
  const websiteIndex = headerCells.findIndex((c) => WEBSITE_KEYWORDS.some((kw) => c.includes(kw)));
  if (websiteIndex < 0) return []; // nothing to scrape without a recognizable website column

  const nameIndex = headerCells.findIndex(
    (c, i) => i !== websiteIndex && NAME_KEYWORDS.some((kw) => c.includes(kw))
  );

  const rows: ImportedCompanyRow[] = [];
  const seenWebsites = new Set<string>();

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const website = normalizeWebsiteUrl(cells[websiteIndex]);
    if (!website || seenWebsites.has(website)) continue;
    seenWebsites.add(website);

    const rawName = nameIndex >= 0 ? cells[nameIndex]?.trim() : "";
    rows.push({ businessName: rawName || deriveNameFromWebsite(website), website });
  }

  return rows;
}
