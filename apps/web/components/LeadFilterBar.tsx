import { Mail, Sparkles, ArrowUpDown, Trophy, Download } from "lucide-react";
import type { SortMode } from "@/lib/useLeadFilters";

interface Props {
  emailOnly: boolean;
  onToggleEmailOnly: () => void;
  newOnly: boolean;
  onToggleNewOnly: () => void;
  sortMode: SortMode;
  onSetSortMode: (mode: SortMode) => void;
  exportUrl: string;
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Mail;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-glow-teal"
          : "bg-slate-900/70 text-slate-400 ring-1 ring-white/10 hover:text-slate-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}

export function LeadFilterBar({
  emailOnly,
  onToggleEmailOnly,
  newOnly,
  onToggleNewOnly,
  sortMode,
  onSetSortMode,
  exportUrl,
}: Props) {
  // Clicking an already-active sort button turns sorting off, rather than
  // being stuck once toggled on — matches how the other filter buttons behave.
  function toggleSort(mode: SortMode) {
    onSetSortMode(sortMode === mode ? "none" : mode);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleButton active={emailOnly} onClick={onToggleEmailOnly} icon={Mail}>
        Has email
      </ToggleButton>
      <ToggleButton active={newOnly} onClick={onToggleNewOnly} icon={Sparkles}>
        New only
      </ToggleButton>
      <ToggleButton
        active={sortMode === "score"}
        onClick={() => toggleSort("score")}
        icon={Trophy}
        title="Ranks by qualified fit first (if you've qualified any leads), then verified email, then Google Places-confirmed identity"
      >
        Best leads
      </ToggleButton>
      <ToggleButton active={sortMode === "az"} onClick={() => toggleSort("az")} icon={ArrowUpDown}>
        A–Z
      </ToggleButton>
      <a
        href={exportUrl}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-3 py-1.5 text-sm text-slate-400 ring-1 ring-white/10 transition hover:text-slate-200 hover:shadow-glow-cyan"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export CSV
      </a>
    </div>
  );
}
