"use client";

import { useState } from "react";
import { Loader2, ChevronDown, ChevronLeft } from "lucide-react";
import { useGetAllLeadsQuery } from "@/lib/apiSlice";
import { useLeadFilters } from "@/lib/useLeadFilters";
import { StatsBar } from "./StatsBar";
import { LeadsMap } from "./LeadsMap";
import { LeadCards } from "./LeadCards";
import { LeadFilterBar } from "./LeadFilterBar";
import { QualifyPanel } from "./QualifyPanel";
import type { LeadQualification } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const PAGE_SIZE = 50;

interface Props {
  keyword: string;
  location: string;
  onBack: () => void;
}

export function LeadGroupDetail({ keyword, location, onBack }: Props) {
  // Starts small rather than fetching a whole group at once — some groups
  // (e.g. after many repeat searches) can still run into the hundreds, and
  // rendering that many full lead cards at once is genuinely slow and
  // unusable to scroll through. Same "load more" pattern as before grouping
  // existed, just scoped to one group's leads instead of the entire dataset.
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [qualifications, setQualifications] = useState<Record<string, LeadQualification>>({});

  // refetchOnMountOrArgChange: without it, re-entering a group would just
  // keep showing whatever was last fetched for it in this session, stale
  // the moment a new search adds more leads to it.
  const { data, isFetching } = useGetAllLeadsQuery(
    { limit, keyword, location },
    { refetchOnMountOrArgChange: true }
  );
  const { visibleLeads, emailOnly, setEmailOnly, newOnly, setNewOnly, sortMode, setSortMode } = useLeadFilters(
    data?.leads ?? [],
    qualifications
  );

  const exportUrl = `${API_BASE_URL}/api/leads/export?${new URLSearchParams({ keyword, location })}`;
  const hasMore = !!data && data.leads.length < data.total;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-300"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All searches
      </button>

      {!data && isFetching ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-slate-500">
              <span className="text-slate-200">"{keyword}"</span> in{" "}
              <span className="text-slate-200">{location}</span> ·{" "}
              <span className="text-slate-200">{data?.total ?? 0}</span> leads
              {hasMore && (
                <span className="ml-2 text-xs text-slate-600">(showing most recent {data!.leads.length})</span>
              )}
            </h2>
            <LeadFilterBar
              emailOnly={emailOnly}
              onToggleEmailOnly={() => setEmailOnly((v) => !v)}
              newOnly={newOnly}
              onToggleNewOnly={() => setNewOnly((v) => !v)}
              sortMode={sortMode}
              onSetSortMode={setSortMode}
              exportUrl={exportUrl}
            />
          </div>
          <QualifyPanel
            leadIds={visibleLeads.map((l) => l.id)}
            onResults={(results) => setQualifications((prev) => ({ ...prev, ...results }))}
          />
          <StatsBar leads={visibleLeads} />
          <LeadsMap leads={visibleLeads} />
          <LeadCards leads={visibleLeads} qualifications={qualifications} />
          {hasMore && (
            <div className="flex justify-center pb-4">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-4 py-2 text-sm text-slate-400 ring-1 ring-white/10 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                )}
                Load {Math.min(PAGE_SIZE, data!.total - data!.leads.length)} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
