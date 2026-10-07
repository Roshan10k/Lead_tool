export interface CandidateUrl {
  url: string;
  title?: string;
  // Present when discovery came from a structured source (Serper Places /
  // Google Maps data) that already identified a real business. The pipeline
  // trusts these directly instead of asking the LLM to guess business
  // identity from page text, and only uses the LLM to fill in owner/contact
  // details from the business's own website.
  knownBusinessName?: string;
  knownLocation?: string;
  knownPhone?: string;
  knownWebsite?: string;
  knownLatitude?: number;
  knownLongitude?: number;
  // Google's stable per-business Place ID (Serper Places' `cid`). Used for
  // permanent cross-search deduplication — see leads.placeId in schema.ts.
  knownPlaceId?: string;
}

export interface ExtractedLead {
  businessName: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  ownerName: string | null;
  ownerTitle: string | null;
}

/** The narrower extraction result used for structured (Places/CSV) candidates. */
export interface ExtractedContactDetails {
  email: string | null;
  phone: string | null;
  description: string | null;
  ownerName: string | null;
  ownerTitle: string | null;
}

/**
 * Links to a business's own social media profiles, parsed directly out of
 * its website's HTML (see scrape.ts) rather than by scraping the social
 * platforms themselves.
 */
export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
}

/**
 * One attempt the search-strategy agent made while turning a free-text goal
 * into a keyword+location query — see searchAgent.ts. Stored on the search
 * row (schema.ts) so the UI can show the agent's reasoning trail instead of
 * a black box ("tried X, too few results, tried Y instead").
 */
export interface SearchStep {
  keyword: string;
  location: string;
  candidateCount: number;
  verdict: string;
}
