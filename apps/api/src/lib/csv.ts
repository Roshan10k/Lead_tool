import type { Lead } from "../db/schema";

export function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_COLUMNS = [
  "businessName",
  "ownerName",
  "ownerTitle",
  "location",
  "phone",
  "email",
  "emailVerified",
  "isRoleBasedEmail",
  "website",
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "description",
  "outreachStatus",
  "notes",
  "latitude",
  "longitude",
  "sourceUrl",
] as const;

/** Flattens a lead's row for CSV — pulls each social platform's link into its own column. */
function leadToCsvRow(lead: Lead): Record<(typeof CSV_COLUMNS)[number], string> {
  return {
    businessName: lead.businessName,
    ownerName: lead.ownerName ?? "",
    ownerTitle: lead.ownerTitle ?? "",
    location: lead.location ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    // "" (not e.g. "unknown") when null — matches every other absent-field
    // column's convention in this CSV, and null covers both "no email" and
    // "DNS lookup was inconclusive" (see verifyEmail.ts), neither of which
    // should be conflated with a confirmed "no" (false).
    emailVerified: lead.emailVerified === null ? "" : String(lead.emailVerified),
    isRoleBasedEmail: lead.isRoleBasedEmail === null ? "" : String(lead.isRoleBasedEmail),
    website: lead.website ?? "",
    facebook: lead.socialLinks?.facebook ?? "",
    instagram: lead.socialLinks?.instagram ?? "",
    linkedin: lead.socialLinks?.linkedin ?? "",
    twitter: lead.socialLinks?.twitter ?? "",
    description: lead.description ?? "",
    outreachStatus: lead.outreachStatus,
    notes: lead.notes ?? "",
    latitude: lead.latitude?.toString() ?? "",
    longitude: lead.longitude?.toString() ?? "",
    sourceUrl: lead.sourceUrl,
  };
}

export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((lead) => {
    const row = leadToCsvRow(lead);
    return CSV_COLUMNS.map((col) => csvEscape(row[col])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
