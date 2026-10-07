import { eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { searches, leads, excludedDomains } from "../db/schema";
import { discoverCandidates } from "./discovery";
import { scrapePage } from "./scrape";
import { extractLead } from "./extract";
import { findContactDetails, type ContactPayload } from "./contactFinder";
import { planSearch } from "./searchAgent";
import { verifyEmailDomain } from "./verifyEmail";
import { normalizeDedupeKey } from "../lib/dedupe";
import { isRoleBasedEmail } from "../lib/email";
import { extractDomain } from "../lib/domain";
import { getCached, setCached } from "../lib/cache";
import type { ExtractedLead, SocialLinks, CandidateUrl } from "../types";

const CONCURRENCY = 3;

// What actually gets cached per URL: the LLM-derived fields plus the
// scrape-derived social links, bundled together. Caching them separately
// would mean a cache hit on one still had to re-scrape for the other,
// defeating the point of caching at all.
type CachedContactPayload = ContactPayload;
type CachedFullPayload = ExtractedLead & { socialLinks: SocialLinks; logoUrl: string | null };

// Businesses already surfaced by ANY past search — not scoped to this exact
// keyword+location — so a repeat search for "Cleaning Business in Australia"
// (or a differently-worded search that happens to surface the same
// businesses) returns genuinely new leads instead of the same companies
// again. See discovery.ts's MAX_PAGES for the cost bound this is weighed
// against, and schema.ts's leads.placeId for why this is permanent rather
// than scoped/expiring. Shared by both the direct and agent-planned entry
// points below, since a search-strategy probe should skip already-seen
// businesses too — otherwise the agent could judge a query "good" based on
// candidates the pipeline would immediately filter back out anyway.
async function computeExclusionSets(): Promise<{ excludePlaceIds: Set<string>; excludeDomains: Set<string> }> {
  const seenPlaceIdRows = await db.select({ placeId: leads.placeId }).from(leads).where(isNotNull(leads.placeId));
  const excludePlaceIds = new Set(seenPlaceIdRows.map((r) => r.placeId!));

  // Domains imported from an external "already contacted" list (see
  // POST /api/exclusions/import) — extends the exclusion above to
  // businesses this app hasn't found itself yet, but the user already knows
  // about from outside it.
  const excludedDomainRows = await db.select({ domain: excludedDomains.domain }).from(excludedDomains);
  const excludeDomains = new Set(excludedDomainRows.map((r) => r.domain));

  return { excludePlaceIds, excludeDomains };
}

/**
 * Plans a search from a free-text goal (see searchAgent.ts), writes the
 * resolved keyword/location/goal/steps onto the search row, then hands off
 * to the same runSearchPipeline used by a direct keyword+location search —
 * everything from discovery onward is identical either way.
 */
export async function runAgentSearchPipeline(searchId: string, goal: string) {
  try {
    await setStatus(searchId, "planning");
    const { excludePlaceIds, excludeDomains } = await computeExclusionSets();
    const planned = await planSearch(goal, excludePlaceIds, excludeDomains);

    await db
      .update(searches)
      .set({ keyword: planned.keyword, location: planned.location, searchSteps: planned.steps })
      .where(eq(searches.id, searchId));

    await runSearchPipeline(searchId, planned.keyword, planned.location);
  } catch (err) {
    await markFailed(searchId, err);
  }
}

/**
 * Runs the full discovery -> scrape -> extract -> store pipeline for one
 * search, updating its status as it goes. Runs in the background (fire and
 * forget from the route handler) so the API can respond immediately with a
 * searchId and the frontend polls for progress.
 */
export async function runSearchPipeline(searchId: string, keyword: string, location: string) {
  try {
    await setStatus(searchId, "discovering");

    const { excludePlaceIds, excludeDomains } = await computeExclusionSets();

    const candidates = await discoverCandidates(keyword, location, excludePlaceIds, excludeDomains);

    await db
      .update(searches)
      .set({ candidateCount: candidates.length })
      .where(eq(searches.id, searchId));

    if (candidates.length === 0) {
      await db
        .update(searches)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(searches.id, searchId));
      return;
    }

    await processCandidates(searchId, candidates);
  } catch (err) {
    await markFailed(searchId, err);
  }
}

/**
 * Runs the same scrape -> extract -> store pipeline as a direct search, but
 * over a caller-supplied list of already-known businesses (name + website)
 * instead of running discovery — see POST /api/search/import. Each
 * candidate goes through the exact same "known business name" branch of
 * processCandidates() that a Serper Places result does (it already handles
 * a candidate with no phone/location/placeId of its own, which is all a CSV
 * row ever has), so this reuses that fully-tested path unchanged rather
 * than duplicating it.
 */
export async function runCsvImportPipeline(searchId: string, candidates: CandidateUrl[]) {
  try {
    // Same "already contacted elsewhere" exclusion list a real search
    // respects (see computeExclusionSets) — no reason to re-scrape a
    // business the user already told this app to skip, just because this
    // time it showed up in an imported spreadsheet instead of a live search.
    const { excludeDomains } = await computeExclusionSets();
    const filtered = excludeDomains.size
      ? candidates.filter((c) => {
          const domain = c.knownWebsite ? extractDomain(c.knownWebsite) : null;
          return !(domain && excludeDomains.has(domain));
        })
      : candidates;

    await db.update(searches).set({ candidateCount: filtered.length }).where(eq(searches.id, searchId));

    if (filtered.length === 0) {
      await db
        .update(searches)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(searches.id, searchId));
      return;
    }

    await processCandidates(searchId, filtered);
  } catch (err) {
    await markFailed(searchId, err);
  }
}

async function markFailed(searchId: string, err: unknown) {
  await db
    .update(searches)
    .set({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      completedAt: new Date(),
    })
    .where(eq(searches.id, searchId));
}

/**
 * The shared scrape -> extract -> dedup -> store loop, used by every entry
 * point above once it has a concrete candidate list in hand (however that
 * list was obtained — real-time discovery or a CSV import).
 */
async function processCandidates(searchId: string, candidates: CandidateUrl[]) {
  await setStatus(searchId, "scraping");

  const seenBusinessNames = new Set<string>();
  let processed = 0;

  // Simple bounded-concurrency worker pool so we don't hammer target sites
  // or the LLM provider all at once.
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];

      let lead: {
        businessName: string;
        location: string | null;
        phone: string | null;
        email: string | null;
        website: string | null;
        description: string | null;
        ownerName: string | null;
        ownerTitle: string | null;
        socialLinks: SocialLinks;
        latitude: number | null;
        longitude: number | null;
        logoUrl: string | null;
      } | null = null;

      if (candidate.knownBusinessName) {
        // Structured candidate (Serper Places, or a CSV import — see
        // runCsvImportPipeline) — identity is already trusted. Only hit the
        // LLM to pull contact details the known source didn't already have;
        // social links are parsed directly out of the same page's HTML (see
        // scrape.ts), not LLM-derived.
        let contactDetails: CachedContactPayload | null = null;
        if (candidate.knownWebsite) {
          // Check the page cache before scraping/calling the LLM at all —
          // the same business website is often surfaced again across
          // different searches. A cache hit skips both the network
          // request to the target site (fewer repeat requests = lower
          // blocking risk) and the LLM call (cost).
          const cached = await getCached<CachedContactPayload>(candidate.knownWebsite, "contact_details");
          if (cached.hit) {
            contactDetails = cached.payload;
          } else {
            await db.update(searches).set({ status: "extracting" }).where(eq(searches.id, searchId));
            // Most business sites don't put their email on the homepage —
            // this also tries /contact, /contact-us, /about before giving
            // up. See contactFinder.ts.
            const result = await findContactDetails(candidate.knownWebsite);
            contactDetails = result?.contactDetails ?? null;
            await setCached(candidate.knownWebsite, "contact_details", contactDetails);
          }
        }
        lead = {
          businessName: candidate.knownBusinessName,
          location: candidate.knownLocation ?? null,
          // Prefer Places' structured phone when we have it; fall back to
          // whatever the site's own pages gave us (the only source at all
          // for a CSV-imported candidate, which never has knownPhone).
          phone: candidate.knownPhone ?? contactDetails?.phone ?? null,
          email: contactDetails?.email ?? null,
          website: candidate.knownWebsite ?? null,
          description: contactDetails?.description ?? null,
          ownerName: contactDetails?.ownerName ?? null,
          ownerTitle: contactDetails?.ownerTitle ?? null,
          socialLinks: contactDetails?.socialLinks ?? {},
          latitude: candidate.knownLatitude ?? null,
          longitude: candidate.knownLongitude ?? null,
          logoUrl: contactDetails?.logoUrl ?? null,
        };
      } else {
        // Unstructured candidate (DuckDuckGo organic search) — full LLM
        // extraction, including judging whether the page is a business at all.
        const cached = await getCached<CachedFullPayload>(candidate.url, "full");
        let extracted: CachedFullPayload | null;
        if (cached.hit) {
          extracted = cached.payload;
        } else {
          const page = await scrapePage(candidate.url);
          if (page) {
            await db.update(searches).set({ status: "extracting" }).where(eq(searches.id, searchId));
            const result = await extractLead(page);
            // See contactFinder.ts's pageEmail handling — same fix, same
            // reason: an icon-only mailto link or a Cloudflare-obfuscated
            // address has no plain visible text for the LLM to read.
            extracted = result
              ? { ...result, email: result.email ?? page.pageEmail, socialLinks: page.socialLinks, logoUrl: page.logoUrl }
              : null;
          } else {
            extracted = null;
          }
          await setCached(candidate.url, "full", extracted);
        }
        if (extracted) lead = { ...extracted, latitude: null, longitude: null };
      }

      processed++;
      await db.update(searches).set({ processedCount: processed }).where(eq(searches.id, searchId));

      if (!lead) continue;

      // Basic dedup on normalized business name (Day 6 "nice to have").
      const dedupeKey = normalizeDedupeKey(lead.businessName);
      if (seenBusinessNames.has(dedupeKey)) continue;
      seenBusinessNames.add(dedupeKey);

      // DNS-only domain check (see verifyEmail.ts) — cheap enough to run
      // inline for every lead with an email, unlike qualifyLeads.ts's
      // per-offering LLM judgment which needs a separate on-demand job.
      const emailVerified = lead.email ? await verifyEmailDomain(lead.email) : null;
      const isRoleBasedEmailValue = isRoleBasedEmail(lead.email);

      await db.insert(leads).values({
        searchId,
        businessName: lead.businessName,
        location: lead.location,
        phone: lead.phone,
        email: lead.email,
        emailVerified,
        isRoleBasedEmail: isRoleBasedEmailValue,
        website: lead.website,
        description: lead.description,
        ownerName: lead.ownerName,
        ownerTitle: lead.ownerTitle,
        socialLinks: lead.socialLinks,
        latitude: lead.latitude,
        longitude: lead.longitude,
        logoUrl: lead.logoUrl,
        placeId: candidate.knownPlaceId ?? null,
        sourceUrl: candidate.url,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

  await db
    .update(searches)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(searches.id, searchId));
}

async function setStatus(searchId: string, status: (typeof searches.$inferSelect)["status"]) {
  await db.update(searches).set({ status }).where(eq(searches.id, searchId));
}
