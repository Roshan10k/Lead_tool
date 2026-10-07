// Loose but sufficient shape check: requires "x@y.z", nothing else. Applied
// at every point an email enters the system — LLM output, a mailto href, a
// decoded Cloudflare-obfuscation string — as a single, shared plausibility
// gate. Found live that an LLM extraction call returned the literal string
// "[email protected]" (Cloudflare's obfuscation placeholder — its real
// email was hidden behind a `data-cfemail` attribute the LLM never saw as
// text) as if it were a real address; this regex rejects it outright, since
// "protected]" has no dot and isn't a valid domain shape.
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(value: string | null | undefined): value is string {
  return !!value && PLAUSIBLE_EMAIL.test(value);
}

// Common shared/generic inbox prefixes — reaching a named person directly
// tends to get a better outreach response than a generic inbox several
// people (or no one) actually reads regularly. Deliberately a plain
// substring/word check, not a "does this look like a real first name"
// classifier — that would need a name database or an LLM call for a signal
// cheap enough to be worth neither.
const ROLE_BASED_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "sales",
  "admin",
  "support",
  "hello",
  "hi",
  "office",
  "enquiries",
  "enquiry",
  "inquiries",
  "team",
  "mail",
  "help",
  "service",
  "services",
  "bookings",
  "booking",
  "reservations",
  "general",
  "marketing",
  "hr",
  "jobs",
  "careers",
  "press",
  "media",
  "webmaster",
  "postmaster",
  "noreply",
  "no-reply",
]);

/**
 * Whether an email looks like a shared/generic inbox (info@, contact@) as
 * opposed to a named person — a cheap, deterministic local-part check, not
 * an LLM call. Returns null (not false) for an implausible/missing email,
 * same null-means-"can't tell" convention as verifyEmailDomain.
 */
export function isRoleBasedEmail(email: string | null | undefined): boolean | null {
  if (!isPlausibleEmail(email)) return null;
  const localPart = email.split("@")[0].toLowerCase();
  // Split on separators rather than a plain substring check, so
  // "sales-team@" or "info.uk@" are caught without "informant@" false-
  // positive matching on "info".
  const tokens = localPart.split(/[._+-]+/).filter(Boolean);
  return tokens.some((token) => ROLE_BASED_LOCAL_PARTS.has(token));
}
