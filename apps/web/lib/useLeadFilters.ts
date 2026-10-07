import { useMemo, useState } from "react";
import type { Lead, LeadQualification, FitScore } from "./types";

export type SortMode = "none" | "az" | "score";

// Unqualified sits between "possible_fit" and "poor_fit" — we don't know
// yet, so it shouldn't be assumed as bad as an explicit poor_fit judgment,
// but a confirmed strong/possible fit should still rank above "unknown".
const FIT_RANK: Record<FitScore, number> = { strong_fit: 3, possible_fit: 2, poor_fit: 0 };
const UNQUALIFIED_RANK = 1;

// Weighted so fit score dominates the sort, email-domain verification
// breaks ties within a fit tier, and confirmed Google Places identity
// breaks ties within that.
function scoreRank(lead: Lead, qualification: LeadQualification | undefined): number {
  const fitRank = qualification ? FIT_RANK[qualification.fitScore] : UNQUALIFIED_RANK;
  const emailRank = lead.emailVerified === true ? 2 : lead.emailVerified === false ? 0 : 1;
  const placeRank = lead.placeId ? 1 : 0;
  return fitRank * 100 + emailRank * 10 + placeRank;
}

/**
 * Shared "Has email" / "New only" filters + sort, used by the search
 * results, group detail, and All Leads views.
 *
 * @param qualifications Optional fit-judgment map (see QualifyPanel) —
 *   only needed to support "score" sort; omitted entirely in a context that
 *   doesn't offer qualification, in which case "score" sort still works but
 *   treats every lead as unqualified.
 */
export function useLeadFilters(leads: Lead[], qualifications?: Record<string, LeadQualification>) {
  const [emailOnly, setEmailOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("none");

  const visibleLeads = useMemo(() => {
    let filtered = emailOnly ? leads.filter((l) => l.email) : leads;
    if (newOnly) filtered = filtered.filter((l) => l.outreachStatus === "new");

    if (sortMode === "az") {
      return [...filtered].sort((a, b) => a.businessName.localeCompare(b.businessName));
    }
    if (sortMode === "score") {
      return [...filtered].sort((a, b) => {
        const diff = scoreRank(b, qualifications?.[b.id]) - scoreRank(a, qualifications?.[a.id]);
        return diff !== 0 ? diff : a.businessName.localeCompare(b.businessName);
      });
    }
    return filtered;
  }, [leads, emailOnly, newOnly, sortMode, qualifications]);

  return { visibleLeads, emailOnly, setEmailOnly, newOnly, setNewOnly, sortMode, setSortMode };
}
