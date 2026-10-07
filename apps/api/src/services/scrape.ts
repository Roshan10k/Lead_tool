import type { CheerioAPI } from "cheerio";
import type { SocialLinks } from "../types";
import { isPlausibleEmail } from "../lib/email";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 6000; // keep LLM prompts small/cheap

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  socialLinks: SocialLinks;
  // An email found directly in the page's HTML markup — a `mailto:` link's
  // href, or a Cloudflare-obfuscated address decoded back out — independent
  // of the LLM's text-based reading. See extractPageEmail for why this
  // exists: both cases involve markup an LLM given only visible text can
  // never see the real value of.
  pageEmail: string | null;
  // The business's own favicon/apple-touch-icon URL, used as a stand-in
  // logo — see extractLogoUrl. Not verified reachable at scrape time; the
  // frontend falls back to an initials avatar if it 404s when the browser
  // actually loads it.
  logoUrl: string | null;
}

// Matches a business's own social media page links, not e.g. Facebook's own
// footer links to "facebook.com/policies" etc. — restricted to the profile-
// path shape of each platform, and excludes their app-sharing/login utility
// paths so a page's "Share on Facebook" button isn't mistaken for a profile.
const SOCIAL_PATTERNS: { platform: keyof SocialLinks; hostname: RegExp; excludePath: RegExp }[] = [
  { platform: "facebook", hostname: /(^|\.)facebook\.com$/i, excludePath: /^\/(sharer|share|dialog|policies|help|login|plugins)(\/|$)/i },
  { platform: "instagram", hostname: /(^|\.)instagram\.com$/i, excludePath: /^\/(accounts|explore|p|reel)(\/|$)/i },
  { platform: "linkedin", hostname: /(^|\.)linkedin\.com$/i, excludePath: /^\/(sharing|shareArticle|login|uas)(\/|$)/i },
  { platform: "twitter", hostname: /(^|\.)(twitter\.com|x\.com)$/i, excludePath: /^\/(intent|share|login|i)(\/|$)/i },
];

/**
 * Extracts links to the business's own social media profiles from its
 * website — a deterministic, cheap alternative to scraping the social
 * platforms themselves (which sit behind login walls, aggressively block
 * automated access, and prohibit it in their own Terms of Service; see
 * README for the fuller reasoning). Scanned from the full, unmodified page
 * before script/nav/footer stripping, since these links live almost
 * entirely in the footer or header — code that ran after that stripping
 * would find nothing.
 */
function extractSocialLinks($: CheerioAPI): SocialLinks {
  const found: SocialLinks = {};

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      return; // relative or malformed href — not a social link
    }

    for (const { platform, hostname, excludePath } of SOCIAL_PATTERNS) {
      if (found[platform]) continue; // keep the first match per platform
      if (hostname.test(parsed.hostname) && !excludePath.test(parsed.pathname) && parsed.pathname.length > 1) {
        found[platform] = parsed.toString();
      }
    }
  });

  return found;
}

/**
 * Pulls an email address straight out of a `mailto:` link's href — found
 * live during testing: some sites put their email only on an icon-only
 * "envelope" button (no visible text at all, just the href), which the
 * text-only LLM extraction below can never see no matter how good the
 * prompt is. Same rationale and same "read hrefs before stripping" approach
 * as extractSocialLinks above.
 *
 * Rejects anything that isn't a plausible "x@y.z" once the query-string/
 * whitespace stripping below has run — found live against a real site whose
 * mailto href had a malformed query string (a literal space instead of
 * "?subject=..."), which without this check leaked straight into the
 * "email" field as "info@example.com subject=complaints".
 */
function extractMailtoEmail($: CheerioAPI): string | null {
  let found: string | null = null;
  $("a[href^='mailto:']").each((_, el) => {
    if (found) return;
    const href = $(el).attr("href");
    if (!href) return;

    let raw = href.slice("mailto:".length);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // malformed percent-encoding — fall through and use it as-is
    }
    const email = raw.split(/[?\s]/)[0].trim();
    if (isPlausibleEmail(email)) found = email;
  });
  return found;
}

/**
 * Decodes Cloudflare's email-obfuscation encoding: a site using it renders
 * "[email protected]" as the visible text (which is exactly what an LLM
 * reading page text would — and, found live, did — mistake for a real
 * address) while the actual email is XOR-encoded in a `data-cfemail`
 * attribute. The encoding is Cloudflare's own public, undocumented-but-
 * well-known scheme: first byte is the XOR key, every following byte pair
 * is one ciphertext byte to XOR-decode with it.
 */
function decodeCloudflareEmail(encodedHex: string): string | null {
  const bytes = encodedHex.match(/../g)?.map((byte) => parseInt(byte, 16));
  if (!bytes || bytes.length < 2 || bytes.some(Number.isNaN)) return null;

  const key = bytes[0];
  const decoded = bytes
    .slice(1)
    .map((byte) => String.fromCharCode(byte ^ key))
    .join("");
  return isPlausibleEmail(decoded) ? decoded : null;
}

function extractCloudflareEmail($: CheerioAPI): string | null {
  let found: string | null = null;
  $("[data-cfemail]").each((_, el) => {
    if (found) return;
    const encoded = $(el).attr("data-cfemail");
    if (!encoded) return;
    found = decodeCloudflareEmail(encoded);
  });
  return found;
}

/** Tries every deterministic (non-LLM) source of an email on the page, in order. */
function extractPageEmail($: CheerioAPI): string | null {
  return extractMailtoEmail($) ?? extractCloudflareEmail($);
}

const ICON_LINK_SELECTOR =
  "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel='apple-touch-icon-precomposed']";

/**
 * Picks the business's favicon/apple-touch-icon as a stand-in logo — checked
 * live against real business sites: these are frequently a genuine shrunk
 * logo, not a generic placeholder (one real site's icon file was literally
 * named "...-Logo-Domestic-roundal-192x192.avif"). Prefers apple-touch-icon
 * (usually a cleaner square crop meant to look good at a larger size) and
 * the largest declared `sizes=`, falling back to the near-universal
 * `/favicon.ico` convention when a page declares no icon `<link>` at all.
 */
function extractLogoUrl($: CheerioAPI, pageUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return null;
  }

  const candidates: { url: string; score: number }[] = [];
  $(ICON_LINK_SELECTOR).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let resolved: string;
    try {
      resolved = new URL(href, base).toString();
    } catch {
      return;
    }

    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const isAppleTouch = rel.includes("apple-touch-icon");
    const sizeMatch = ($(el).attr("sizes") ?? "").match(/(\d+)x\d+/i);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
    candidates.push({ url: resolved, score: size + (isAppleTouch ? 1000 : 0) });
  });

  if (candidates.length === 0) return `${base.origin}/favicon.ico`;
  return candidates.reduce((a, b) => (b.score > a.score ? b : a)).url;
}

/**
 * Fetches a public page and reduces it to visible text. Deliberately simple —
 * no headless browser, no JS rendering — which is enough for most business
 * listing / directory / "about us" pages within a 1-week MVP budget.
 */
export async function scrapePage(url: string): Promise<ScrapedPage | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadDiscoveryBot/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    const socialLinks = extractSocialLinks($);
    const pageEmail = extractPageEmail($);
    const logoUrl = extractLogoUrl($, url);

    $("script, style, noscript, svg, nav, footer").remove();

    const title = $("title").first().text().trim();
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);

    if (!text) return null;
    return { url, title, text, socialLinks, pageEmail, logoUrl };
  } catch {
    // Failed/timed-out page — the pipeline treats this as a skip, not a fatal error.
    return null;
  }
}
