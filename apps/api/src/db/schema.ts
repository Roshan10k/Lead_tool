import { pgTable, text, timestamp, uuid, integer, doublePrecision, jsonb, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import type { SocialLinks, SearchStep } from "../types";

export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyword: text("keyword").notNull(),
  location: text("location").notNull(),
  // The original natural-language input, when the search came from the
  // agent-planned path (see POST /api/search and searchAgent.ts) rather than
  // an exact keyword+location. Null for a direct search — `keyword`/
  // `location` above are always the resolved, final query either way, so
  // every downstream consumer (dedup, grouping, export) is unaffected by
  // which path created the search.
  goal: text("goal"),
  searchSteps: jsonb("search_steps").$type<SearchStep[]>(),
  status: text("status", {
    enum: ["pending", "planning", "discovering", "scraping", "extracting", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  candidateCount: integer("candidate_count").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  searchId: uuid("search_id")
    .notNull()
    .references(() => searches.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  location: text("location"),
  phone: text("phone"),
  email: text("email"),
  // Whether the email's domain can actually receive mail (an MX or fallback
  // A record exists) — DNS-only, not a real SMTP mailbox check (port 25 is
  // blocked on most networks this app runs on, confirmed live rather than
  // assumed — see verifyEmail.ts). Null when there's no email to check, or
  // the DNS lookup itself was inconclusive (never set to false just because
  // a lookup timed out — see verifyEmail.ts's null-vs-false distinction).
  emailVerified: boolean("email_verified"),
  // Whether the email looks like a shared/generic inbox (info@, contact@)
  // rather than a named person — a named contact tends to get a better
  // outreach response than an inbox several people read, or none do. Null
  // when there's no email, or it wasn't a plausible address to begin with.
  // See lib/email.ts's isRoleBasedEmail for the (deliberately simple,
  // non-LLM) heuristic.
  isRoleBasedEmail: boolean("is_role_based_email"),
  website: text("website"),
  description: text("description"),
  ownerName: text("owner_name"),
  ownerTitle: text("owner_title"),
  socialLinks: jsonb("social_links").$type<SocialLinks>(),
  // The business's own favicon/apple-touch-icon URL, used as a stand-in
  // logo — extracted directly from the page we already scrape (see
  // scrape.ts's extractLogoUrl), not a third-party logo API, so a lead's
  // domain is never sent to an external service just to fetch an image for
  // it. Not verified reachable at scrape time; the frontend falls back to
  // an initials avatar if it 404s when the browser actually loads it.
  logoUrl: text("logo_url"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // Google's stable per-business Place ID (Serper Places' `cid`), null for
  // leads discovered via the DuckDuckGo fallback (no stable ID available
  // there). Used to permanently exclude a business from ever being
  // resurfaced as a "new" lead once it's been shown once, across ALL past
  // searches — not just repeats of the exact same keyword+location. See
  // pipeline.ts for how this set is built and passed into discovery.
  placeId: text("place_id"),
  sourceUrl: text("source_url").notNull(),
  // Outreach pipeline state — separate concept from `searches.status` (which
  // tracks the discovery job itself, not what a human did with a result
  // afterward). Named distinctly (not just `status`) so the two are never
  // confused when a query touches both tables.
  outreachStatus: text("outreach_status", {
    enum: ["new", "contacted", "interested", "not_interested", "won"],
  })
    .notNull()
    .default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Caches the (scrape + LLM extraction) result for a given URL so that the
// same business page is not re-fetched and re-sent to the LLM on every
// search that happens to surface it again. This is the concrete mechanism
// behind "avoid getting blocked while scraping": fewer repeat requests to
// the same target site. `id` is `${kind}::${url}` since the same URL could
// in principle be processed by either extraction path.
export const pageCache = pgTable("page_cache", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  kind: text("kind", { enum: ["full", "contact_details"] }).notNull(),
  // JSON-serialized extraction payload, or null to cache a confirmed
  // negative result (e.g. "not a business listing") so a dead/irrelevant
  // page isn't re-scraped and re-sent to the LLM either.
  payload: text("payload"),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
});

// A business's own domain, imported from an external list (e.g. a CRM
// export of already-contacted companies) so discovery skips it in future
// searches too — extends the placeId-based dedup above to businesses the
// user already knows about from outside this app, not just what this app
// has found before.
export const excludedDomains = pgTable("excluded_domains", {
  domain: text("domain").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tracks a batch "qualify these leads against this offering" run, so the
// frontend can poll it the same way it polls a search — qualifying a
// batch of leads means one LLM call per lead, too slow to do inline in a
// single request. See qualifyLeads.ts.
export const qualificationJobs = pgTable("qualification_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  offering: text("offering").notNull(),
  leadIds: jsonb("lead_ids").$type<string[]>().notNull(),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
    .notNull()
    .default("pending"),
  processedCount: integer("processed_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// One lead's fit judgment for one offering — kept separate from `leads`
// itself (rather than a column on it) because the same lead can legitimately
// be qualified differently against different offerings over time (a lead
// that's a poor fit for "web design" might be a great fit for "SEO
// services"), and a user should be able to re-qualify an existing pool of
// leads for a new pitch without losing past judgments or re-scraping
// anything. Unique on (leadId, offeringKey) so re-running qualification with
// the same offering text is a cache hit, not a duplicate LLM call — same
// "don't pay twice for the same answer" reasoning as pageCache.
export const leadQualifications = pgTable(
  "lead_qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    // Normalized (trim + lowercase) offering text, used only as the cache
    // key — `offering` below keeps the original for display.
    offeringKey: text("offering_key").notNull(),
    offering: text("offering").notNull(),
    fitScore: text("fit_score", { enum: ["strong_fit", "possible_fit", "poor_fit"] }).notNull(),
    reasoning: text("reasoning").notNull(),
    // A ready-to-paste cold-outreach opening line, grounded in this lead's
    // facts and why it matched (or didn't) the offering — generated in the
    // same LLM call as fitScore/reasoning rather than a separate pass, since
    // it needs exactly the same context to be genuinely personalized rather
    // than generic filler. Null for "poor_fit" — found live that forcing a
    // pitch for a mismatched offering produces incoherent copy (e.g.
    // pitching a hotel partnership to a coffee shop), and there's no reason
    // to draft outreach for a lead that isn't worth contacting. See
    // qualifyLeads.ts.
    opener: text("opener"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadOffering: uniqueIndex("lead_qualifications_lead_offering_idx").on(table.leadId, table.offeringKey),
  })
);

export type Search = typeof searches.$inferSelect;
export type NewSearch = typeof searches.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type PageCache = typeof pageCache.$inferSelect;
export type NewPageCache = typeof pageCache.$inferInsert;
export type ExcludedDomain = typeof excludedDomains.$inferSelect;
export type QualificationJob = typeof qualificationJobs.$inferSelect;
export type LeadQualification = typeof leadQualifications.$inferSelect;
