export type SearchStatus =
  | "pending"
  | "planning"
  | "discovering"
  | "scraping"
  | "extracting"
  | "completed"
  | "failed";

// One attempt the search-strategy agent made while turning a free-text goal
// into a keyword+location query — see the API's searchAgent.ts.
export interface SearchStep {
  keyword: string;
  location: string;
  candidateCount: number;
  verdict: string;
}

export interface SearchRecord {
  id: string;
  keyword: string;
  location: string;
  // The original natural-language input, when this search came from the
  // "describe your goal" mode rather than an exact keyword+location — null
  // otherwise. keyword/location above are always the resolved query either way.
  goal: string | null;
  searchSteps: SearchStep[] | null;
  status: SearchStatus;
  candidateCount: number;
  processedCount: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
}

export interface LeadGroup {
  keyword: string;
  location: string;
  leadCount: number;
  mostRecentAt: string;
}

export type OutreachStatus = "new" | "contacted" | "interested" | "not_interested" | "won";

export interface Lead {
  id: string;
  searchId: string;
  businessName: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  // Whether the email's domain can actually receive mail (DNS MX/A record
  // check) — null means no email, or the check was inconclusive. Not a real
  // SMTP mailbox check; see the API's verifyEmail.ts for why.
  emailVerified: boolean | null;
  // Whether the email looks like a shared/generic inbox (info@, contact@)
  // rather than a named person — null means no email, or it wasn't even a
  // plausible address. See the API's lib/email.ts isRoleBasedEmail.
  isRoleBasedEmail: boolean | null;
  website: string | null;
  description: string | null;
  ownerName: string | null;
  ownerTitle: string | null;
  socialLinks: SocialLinks | null;
  // The business's own favicon/apple-touch-icon URL, used as a stand-in
  // logo — extracted directly from its site, not a third-party logo API.
  // Not verified reachable; falls back to an initials avatar if it 404s.
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  // Google's stable per-business Place ID — set only when this lead's
  // identity came from Serper's Places API (trusted structured business
  // data), null when it came from the DuckDuckGo fallback path (an LLM's
  // best guess at whether a scraped page is even a real business). Used to
  // show an honest "Verified" badge — see LeadCards.tsx.
  placeId: string | null;
  outreachStatus: OutreachStatus;
  notes: string | null;
  sourceUrl: string;
  createdAt: string;
}

export type FitScore = "strong_fit" | "possible_fit" | "poor_fit";

export type QualificationJobStatus = "pending" | "processing" | "completed" | "failed";

export interface QualificationJob {
  id: string;
  offering: string;
  leadIds: string[];
  status: QualificationJobStatus;
  processedCount: number;
  totalCount: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface LeadQualification {
  id: string;
  leadId: string;
  offeringKey: string;
  offering: string;
  fitScore: FitScore;
  reasoning: string;
  // A ready-to-paste cold-outreach opening line, grounded in this lead's
  // facts and the qualification reasoning. Null for "poor_fit" — there's no
  // good reason to draft outreach for a lead that isn't worth contacting.
  opener: string | null;
  createdAt: string;
}
