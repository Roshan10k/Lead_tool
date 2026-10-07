"use client";

import { useRef, useState } from "react";
import { Search, MapPin, Loader2, ArrowRight, Sparkles, Upload, FileText } from "lucide-react";

export type SearchMode = "exact" | "goal" | "import";

interface Props {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  keyword: string;
  location: string;
  onKeywordChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSearch: (keyword: string, location: string) => void;
  goal: string;
  onGoalChange: (value: string) => void;
  onSearchGoal: (goal: string) => void;
  // Reads the file's text client-side (same pattern as ExclusionsPanel) and
  // hands the raw CSV content + a label up, rather than passing a File
  // object around — keeps the parent's handling identical to the exact/goal
  // modes (just another string payload to POST).
  onImportCsv: (csv: string, label: string) => void;
  isLoading: boolean;
}

export function SearchForm({
  mode,
  onModeChange,
  keyword,
  location,
  onKeywordChange,
  onLocationChange,
  onSearch,
  goal,
  onGoalChange,
  onSearchGoal,
  onImportCsv,
  isLoading,
}: Props) {
  const [importLabel, setImportLabel] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="mb-2 flex items-center gap-1 self-start rounded-lg bg-slate-900/70 p-1 ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => onModeChange("exact")}
          disabled={isLoading}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
            mode === "exact" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Exact search
        </button>
        <button
          type="button"
          onClick={() => onModeChange("goal")}
          disabled={isLoading}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
            mode === "goal" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          Describe your goal
        </button>
        <button
          type="button"
          onClick={() => onModeChange("import")}
          disabled={isLoading}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
            mode === "import" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Upload className="h-3 w-3" aria-hidden />
          Import list
        </button>
      </div>

      {mode === "exact" && (
        <form
          className="flex flex-col gap-1.5 rounded-2xl bg-slate-900/80 p-1.5 shadow-card ring-1 ring-white/10 backdrop-blur-xl transition-shadow duration-300 focus-within:shadow-glow-teal-lg sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyword.trim() && location.trim()) onSearch(keyword.trim(), location.trim());
          }}
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800">
            <Search className="h-[18px] w-[18px] shrink-0 text-teal-400" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Target keyword
              </span>
              <input
                className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
                placeholder="e.g. Cleaning Business"
                value={keyword}
                onChange={(e) => onKeywordChange(e.target.value)}
                disabled={isLoading}
                aria-label="Business keyword"
              />
            </div>
          </div>

          <div className="hidden h-8 w-px shrink-0 bg-slate-700/60 sm:block" />

          <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800">
            <MapPin className="h-[18px] w-[18px] shrink-0 text-cyan-400" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Location
              </span>
              <input
                className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
                placeholder="e.g. Australia"
                value={location}
                onChange={(e) => onLocationChange(e.target.value)}
                disabled={isLoading}
                aria-label="Location"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !keyword.trim() || !location.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-glow-teal transition-all hover:shadow-glow-teal-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:py-3"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Searching…
              </>
            ) : (
              <>
                Search
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </form>
      )}

      {mode === "goal" && (
        <form
          className="flex flex-col gap-1.5 rounded-2xl bg-slate-900/80 p-1.5 shadow-card ring-1 ring-white/10 backdrop-blur-xl transition-shadow duration-300 focus-within:shadow-glow-teal-lg sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (goal.trim()) onSearchGoal(goal.trim());
          }}
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800">
            <Sparkles className="h-[18px] w-[18px] shrink-0 text-teal-400" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                What are you looking for?
              </span>
              <input
                className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
                placeholder="e.g. boutique gyms in London that might want a new website"
                value={goal}
                onChange={(e) => onGoalChange(e.target.value)}
                disabled={isLoading}
                aria-label="Search goal"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !goal.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-glow-teal transition-all hover:shadow-glow-teal-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:py-3"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Planning…
              </>
            ) : (
              <>
                Search
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </form>
      )}

      {mode === "import" && (
        <form
          className="flex flex-col gap-1.5 rounded-2xl bg-slate-900/80 p-1.5 shadow-card ring-1 ring-white/10 backdrop-blur-xl transition-shadow duration-300 focus-within:shadow-glow-teal-lg sm:flex-row sm:items-center"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!importFile) return;
            const csv = await importFile.text();
            onImportCsv(csv, importLabel.trim());
          }}
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800">
            <FileText className="h-[18px] w-[18px] shrink-0 text-teal-400" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Batch label
              </span>
              <input
                className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
                placeholder="e.g. My company list"
                value={importLabel}
                onChange={(e) => setImportLabel(e.target.value)}
                disabled={isLoading}
                aria-label="Import batch label"
              />
            </div>
          </div>

          <div className="hidden h-8 w-px shrink-0 bg-slate-700/60 sm:block" />

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 text-left transition-colors hover:bg-slate-800 disabled:cursor-not-allowed"
          >
            <Upload className="h-[18px] w-[18px] shrink-0 text-cyan-400" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                CSV file — needs a website/url column
              </span>
              <span className="truncate text-[15px] font-medium text-slate-100">
                {importFile ? importFile.name : "Choose a file…"}
              </span>
            </div>
          </button>

          <button
            type="submit"
            disabled={isLoading || !importFile}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-glow-teal transition-all hover:shadow-glow-teal-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:py-3"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Importing…
              </>
            ) : (
              <>
                Import
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
