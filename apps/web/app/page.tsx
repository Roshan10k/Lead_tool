"use client";

import { useState } from "react";
import { AlertTriangle, Radar } from "lucide-react";
import { SearchForm, type SearchMode } from "@/components/SearchForm";
import { LeadCards } from "@/components/LeadCards";
import { StatusPanel } from "@/components/StatusPanel";
import { StatsBar } from "@/components/StatsBar";
import { LeadsMap } from "@/components/LeadsMap";
import { LeadFilterBar } from "@/components/LeadFilterBar";
import { LeadGroupsList } from "@/components/LeadGroupsList";
import { LeadGroupDetail } from "@/components/LeadGroupDetail";
import { QualifyPanel } from "@/components/QualifyPanel";
import {
  useCreateSearchMutation,
  useImportSearchCsvMutation,
  useGetSearchStatusQuery,
  useGetSearchResultsQuery,
} from "@/lib/apiSlice";
import { useLeadFilters } from "@/lib/useLeadFilters";
import { extractErrorMessage } from "@/lib/apiError";
import type { LeadQualification } from "@/lib/types";

const IN_PROGRESS_STATUSES = new Set(["pending", "planning", "discovering", "scraping", "extracting"]);

const EXAMPLES = [
  { keyword: "Cleaning Business", location: "Australia" },
  { keyword: "Bakery", location: "Toronto" },
  { keyword: "Plumbers", location: "London" },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function Home() {
  const [view, setView] = useState<"search" | "all-leads">("search");
  const [selectedGroup, setSelectedGroup] = useState<{ keyword: string; location: string } | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("exact");
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [goal, setGoal] = useState("");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [qualifications, setQualifications] = useState<Record<string, LeadQualification>>({});

  const [createSearch, { isLoading: isCreating }] = useCreateSearchMutation();
  const [importSearchCsv, { isLoading: isImporting }] = useImportSearchCsvMutation();

  const {
    data: status,
    isError: statusFetchFailed,
    refetch: refetchStatus,
  } = useGetSearchStatusQuery(searchId!, {
    skip: !searchId,
    pollingInterval: 1500,
    skipPollingIfUnfocused: true,
  });

  // Once a search has been started, treat "status not yet loaded FOR THIS
  // SEARCH" as in-progress too. Two related traps here, not one:
  //  1. Right after a new searchId is set, `status` is briefly undefined —
  //     without handling that, isInProgress reads false and the results
  //     query fires against a search that just started (0 leads).
  //  2. RTK Query does NOT clear `data` just because a query's argument
  //     changed — when searchId changes to a new id, `status` keeps showing
  //     the PREVIOUS search's last-fetched value (e.g. "completed") until
  //     the new fetch resolves. So `status` can be truthy and "completed"
  //     even though it's stale data belonging to the search that just
  //     finished, not the new one that just started — which caused this bug
  //     to resurface specifically on the *second* search in a session, since
  //     that's the first time stale-but-truthy status data exists at all.
  // Checking `status?.id === searchId` closes both gaps: only trust status
  // once it actually belongs to the current search.
  // Still gated on `searchId` so this doesn't disable the form before any
  // search has been started — otherwise the inputs are permanently disabled
  // on page load.
  //
  // statusFetchFailed guards a THIRD trap, found live: if a poll never
  // successfully resolves for this searchId at all (e.g. a transient
  // disconnect right as the search was created), `status` stays undefined
  // forever and looked identical to "still in progress" — the UI showed a
  // permanently-spinning status panel even after the search had actually
  // completed on the backend. Surfaced instead as a visible, recoverable
  // error rather than an indefinite spinner.
  const statusMatchesCurrentSearch = status?.id === searchId;
  const isInProgress =
    !!searchId &&
    !statusFetchFailed &&
    (!statusMatchesCurrentSearch || IN_PROGRESS_STATUSES.has(status!.status));

  // Poll results continuously WHILE a search is running, not just once at
  // the end — the backend already inserts each lead the moment it's found,
  // so there's no reason to make the user wait for every candidate to
  // finish before showing anything. This reopens the exact same trap the
  // status query had: RTK Query keeps showing the previous search's last
  // fetched data across an arg change, so `resultsData` can briefly be a
  // PREVIOUS search's leads right after a new one starts. Guarded below via
  // `resultsMatchCurrentSearch`, the same fix pattern as `statusMatchesCurrentSearch`.
  const { data: resultsData } = useGetSearchResultsQuery(searchId!, {
    skip: !searchId,
    pollingInterval: isInProgress ? 1500 : 0,
    skipPollingIfUnfocused: true,
  });
  const resultsMatchCurrentSearch = resultsData?.search?.id === searchId;

  async function handleSearch(nextKeyword: string, nextLocation: string) {
    setCreateError(null);
    setSearchId(null);
    setQualifications({}); // a new search's leads are unrelated to the last search's fit judgments
    try {
      const res = await createSearch({ keyword: nextKeyword, location: nextLocation }).unwrap();
      setSearchId(res.searchId);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    }
  }

  async function handleSearchGoal(nextGoal: string) {
    setCreateError(null);
    setSearchId(null);
    setQualifications({});
    try {
      const res = await createSearch({ goal: nextGoal }).unwrap();
      setSearchId(res.searchId);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    }
  }

  async function handleImportCsv(csv: string, label: string) {
    setCreateError(null);
    setSearchId(null);
    setQualifications({});
    try {
      const res = await importSearchCsv({ csv, label: label || undefined }).unwrap();
      setSearchId(res.searchId);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    }
  }

  function runExample(example: (typeof EXAMPLES)[number]) {
    setKeyword(example.keyword);
    setLocation(example.location);
    handleSearch(example.keyword, example.location);
  }

  // Show the results section as soon as there's at least one lead, even
  // while the search is still running — or once it's fully completed (so a
  // genuine zero-result search still gets a clean final "no leads" state
  // instead of nothing rendering at all).
  const showResults =
    resultsMatchCurrentSearch &&
    !!resultsData &&
    (resultsData.leads.length > 0 || (statusMatchesCurrentSearch && status?.status === "completed"));

  const { visibleLeads, emailOnly, setEmailOnly, newOnly, setNewOnly, sortMode, setSortMode } = useLeadFilters(
    resultsMatchCurrentSearch ? (resultsData?.leads ?? []) : [],
    qualifications
  );

  return (
    <main className="min-h-screen bg-slate-950">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-4xl items-center justify-between gap-2.5 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 shadow-glow-teal">
              <Radar className="h-4 w-4 text-white" aria-hidden />
            </div>
            <span className="font-mono text-xs uppercase tracking-wider text-slate-300">Lead Discovery</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-900/70 p-1 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setView("search")}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                view === "search" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              New Search
            </button>
            <button
              type="button"
              onClick={() => {
                setView("all-leads");
                setSelectedGroup(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                view === "all-leads" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              All Leads
            </button>
          </div>
        </div>
      </header>

      {view === "search" ? (
        <>
          <div className="relative overflow-hidden border-b border-white/5 pt-16">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-radial-fade" />
            <div className="relative mx-auto max-w-4xl px-4 py-14 sm:py-20">
              <span className="font-mono text-[11px] uppercase tracking-widest text-teal-400">
                Find real businesses. Get real leads.
              </span>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
                Find real businesses from the public{" "}
                <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                  web
                </span>
              </h1>
              <p className="mt-3 max-w-xl text-[15px] text-slate-400">
                Enter a business keyword and a location. We'll discover matching businesses, scrape
                their public pages, and use an LLM to pull out contact details - with a source link
                for every result.
              </p>

              <div className="mt-9">
                <SearchForm
                  mode={searchMode}
                  onModeChange={setSearchMode}
                  keyword={keyword}
                  location={location}
                  onKeywordChange={setKeyword}
                  onLocationChange={setLocation}
                  onSearch={handleSearch}
                  goal={goal}
                  onGoalChange={setGoal}
                  onSearchGoal={handleSearchGoal}
                  onImportCsv={handleImportCsv}
                  isLoading={isCreating || isImporting || isInProgress}
                />
                {searchMode === "exact" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">Try:</span>
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex.keyword}
                        type="button"
                        onClick={() => runExample(ex)}
                        disabled={isCreating || isInProgress}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1 text-xs text-slate-400 ring-1 ring-white/10 transition hover:text-slate-200 hover:ring-teal-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        {ex.keyword} · {ex.location}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-4xl px-4 py-8">
            {createError && (
              <div className="flex items-start gap-3 rounded-2xl bg-red-950/40 p-4 ring-1 ring-red-500/30">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
                <div>
                  <p className="font-medium text-red-300">Couldn't start search</p>
                  <p className="mt-1 text-sm text-red-400/80">{createError}</p>
                </div>
              </div>
            )}

            {statusMatchesCurrentSearch && status && <StatusPanel status={status} />}

            {searchId && statusFetchFailed && (
              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-amber-950/30 p-4 ring-1 ring-amber-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
                  <div>
                    <p className="font-medium text-amber-300">Lost track of this search's progress</p>
                    <p className="mt-1 text-sm text-amber-400/80">
                      It may have already finished — the connection to check just failed.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => refetchStatus()}
                  className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/25"
                >
                  Retry
                </button>
              </div>
            )}

            {showResults && (
              <div className="mt-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-slate-500">
                    {resultsData.search.location === "CSV Import" ? (
                      <>
                        Imported list: <span className="text-slate-200">"{resultsData.search.keyword}"</span>
                      </>
                    ) : (
                      <>
                        Results for <span className="text-slate-200">"{resultsData.search.keyword}"</span> in{" "}
                        <span className="text-slate-200">{resultsData.search.location}</span>
                        {resultsData.search.goal && (
                          <span className="ml-1.5 text-slate-600">(from: "{resultsData.search.goal}")</span>
                        )}
                      </>
                    )}
                    {isInProgress && (
                      <span className="ml-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-teal-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                        still working — more may appear
                      </span>
                    )}
                  </h2>
                  <LeadFilterBar
                    emailOnly={emailOnly}
                    onToggleEmailOnly={() => setEmailOnly((v) => !v)}
                    newOnly={newOnly}
                    onToggleNewOnly={() => setNewOnly((v) => !v)}
                    sortMode={sortMode}
                    onSetSortMode={setSortMode}
                    exportUrl={`${API_BASE_URL}/api/search/${searchId}/export`}
                  />
                </div>
                <QualifyPanel
                  leadIds={visibleLeads.map((l) => l.id)}
                  onResults={(results) => setQualifications((prev) => ({ ...prev, ...results }))}
                />
                <StatsBar leads={visibleLeads} />
                <LeadsMap leads={visibleLeads} />
                <LeadCards leads={visibleLeads} qualifications={qualifications} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-24">
          {selectedGroup ? (
            <LeadGroupDetail
              keyword={selectedGroup.keyword}
              location={selectedGroup.location}
              onBack={() => setSelectedGroup(null)}
            />
          ) : (
            <LeadGroupsList onSelectGroup={setSelectedGroup} />
          )}
        </div>
      )}
    </main>
  );
}
