"use client";

import { useState } from "react";
import { Phone, Mail, ExternalLink, Copy, Check, Inbox, MapPin, User, ShieldCheck, StickyNote, Target, MessageSquareText } from "lucide-react";
import { FacebookIcon, InstagramIcon, LinkedinIcon, XIcon } from "./SocialIcons";
import { useUpdateLeadMutation } from "@/lib/apiSlice";
import type { Lead, SocialLinks, OutreachStatus, FitScore, LeadQualification } from "@/lib/types";

const FIT_CONFIG: Record<FitScore, { label: string; className: string }> = {
  strong_fit: { label: "Strong fit", className: "bg-emerald-500/15 text-emerald-300" },
  possible_fit: { label: "Possible fit", className: "bg-amber-500/15 text-amber-300" },
  poor_fit: { label: "Poor fit", className: "bg-slate-800 text-slate-500" },
};

function FitBadge({ qualification }: { qualification: LeadQualification }) {
  const config = FIT_CONFIG[qualification.fitScore];
  return (
    <span
      title={qualification.reasoning}
      className={`inline-flex shrink-0 cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${config.className}`}
    >
      <Target className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {config.label}
    </span>
  );
}

// Only rendered for a qualified lead whose opener isn't null — poor_fit
// leads never get one (see qualifyLeads.ts), so there's nothing to show.
function OpenerBlock({ opener }: { opener: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Click to copy"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(opener);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard API can be unavailable — failing silently is fine, convenience-only.
        }
      }}
      className="mt-2.5 flex w-full items-start gap-2 rounded-lg bg-teal-500/5 px-3 py-2 text-left text-[12.5px] leading-relaxed text-slate-300 ring-1 ring-teal-400/20 transition-colors hover:bg-teal-500/10"
    >
      <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden />
      <span className="flex-1 italic">"{opener}"</span>
      {copied ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
      ) : (
        <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
      )}
    </button>
  );
}

const STATUS_CONFIG: Record<OutreachStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-800 text-slate-400" },
  contacted: { label: "Contacted", className: "bg-amber-500/15 text-amber-300" },
  interested: { label: "Interested", className: "bg-teal-500/15 text-teal-300" },
  not_interested: { label: "Not interested", className: "bg-slate-800 text-slate-500" },
  won: { label: "Won", className: "bg-emerald-500/15 text-emerald-300" },
};

function StatusSelect({ leadId, value }: { leadId: string; value: OutreachStatus }) {
  const [updateLead] = useUpdateLeadMutation();
  const config = STATUS_CONFIG[value];
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => updateLead({ id: leadId, outreachStatus: e.target.value as OutreachStatus })}
      className={`shrink-0 cursor-pointer rounded-full border-0 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide outline-none ${config.className}`}
    >
      {(Object.entries(STATUS_CONFIG) as [OutreachStatus, (typeof STATUS_CONFIG)[OutreachStatus]][]).map(
        ([key, cfg]) => (
          <option key={key} value={key} className="bg-slate-900 text-slate-200">
            {cfg.label}
          </option>
        )
      )}
    </select>
  );
}

function NotesField({ leadId, value }: { leadId: string; value: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [updateLead] = useUpdateLeadMutation();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value ?? "");
          setEditing(true);
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
      >
        <StickyNote className="h-3 w-3 shrink-0" aria-hidden />
        {value ? <span className="max-w-[200px] truncate">{value}</span> : "Add note"}
      </button>
    );
  }

  return (
    <textarea
      autoFocus
      rows={2}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== (value ?? "")) updateLead({ id: leadId, notes: draft || null });
      }}
      placeholder="Add a note…"
      className="mt-2 w-full rounded-lg bg-slate-800 px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-400/50"
    />
  );
}

const SOCIAL_ICON_MAP: { key: keyof SocialLinks; Icon: typeof FacebookIcon; hover: string }[] = [
  { key: "facebook", Icon: FacebookIcon, hover: "hover:text-blue-400" },
  { key: "instagram", Icon: InstagramIcon, hover: "hover:text-pink-400" },
  { key: "linkedin", Icon: LinkedinIcon, hover: "hover:text-sky-400" },
  { key: "twitter", Icon: XIcon, hover: "hover:text-slate-200" },
];

const AVATAR_GRADIENTS = [
  "from-rose-500/30 to-rose-500/5 text-rose-300",
  "from-amber-500/30 to-amber-500/5 text-amber-300",
  "from-emerald-500/30 to-emerald-500/5 text-emerald-300",
  "from-cyan-500/30 to-cyan-500/5 text-cyan-300",
  "from-indigo-500/30 to-indigo-500/5 text-indigo-300",
  "from-purple-500/30 to-purple-500/5 text-purple-300",
];

function avatarGradient(name: string) {
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// logoUrl is extracted directly from the business's own site (its favicon/
// apple-touch-icon — see the API's scrape.ts) and was never verified
// reachable at scrape time, so this falls back to the same initials avatar
// used when there's no logo at all if the image 404s or fails to load.
function LeadAvatar({ businessName, logoUrl }: { businessName: string; logoUrl: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setImgFailed(true)}
        className="h-11 w-11 shrink-0 rounded-xl bg-slate-800 object-contain p-1.5 ring-1 ring-white/10"
      />
    );
  }

  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-semibold ${avatarGradient(businessName)}`}
    >
      {initials(businessName)}
    </div>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// verified: true = domain confirmed able to receive mail (DNS check, not a
// real mailbox check — see the API's verifyEmail.ts); false = domain
// confirmed dead/nonexistent; undefined = not applicable (e.g. phone
// numbers) or no verification was ever run for this field.
// roleBased: folded into the tooltip rather than its own badge, to avoid
// re-cluttering the card with another visual element — true = looks like a
// shared inbox (info@, contact@), false = looks like it may reach a named
// person directly (tends to get a better response), null/undefined = n/a.
function CopyableField({
  icon: Icon,
  value,
  tone,
  verified,
  roleBased,
}: {
  icon: typeof Phone;
  value: string;
  tone: string;
  verified?: boolean | null;
  roleBased?: boolean | null;
}) {
  const [copied, setCopied] = useState(false);
  const title = [
    "Click to copy",
    verified === true ? "domain verified" : verified === false ? "domain does not appear to accept mail" : null,
    roleBased === true ? "shared inbox, not a named person" : roleBased === false ? "may reach a named person directly" : null,
  ]
    .filter(Boolean)
    .join(" — ");
  return (
    <button
      type="button"
      title={title}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard API can be unavailable (permissions, insecure context) —
          // failing silently is fine here, it's a convenience affordance only.
        }
      }}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium transition-colors hover:bg-slate-800 ${tone}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="max-w-[220px] truncate">{value}</span>
      {verified === true && <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden />}
      {verified === false && <ShieldCheck className="h-3 w-3 shrink-0 text-red-400/70" aria-hidden />}
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
      )}
    </button>
  );
}

interface Props {
  leads: Lead[];
  // Keyed by lead id, present only once QualifyPanel's job has completed —
  // omitted entirely (not just empty) in views that don't offer qualification.
  qualifications?: Record<string, LeadQualification>;
}

export function LeadCards({ leads, qualifications }: Props) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-900/50 py-16 text-center ring-1 ring-dashed ring-white/10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
          <Inbox className="h-5 w-5 text-slate-500" aria-hidden />
        </div>
        <p className="font-medium text-slate-300">No leads found for this search</p>
        <p className="max-w-sm text-sm text-slate-500">
          Try a broader keyword or a larger location — results depend on what's publicly
          discoverable on the web.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="group relative overflow-hidden rounded-2xl bg-slate-900/70 p-4 shadow-card ring-1 ring-white/10 backdrop-blur-xl transition-colors hover:bg-slate-900/90 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <LeadAvatar businessName={lead.businessName} logoUrl={lead.logoUrl} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-[15px] font-semibold text-slate-100" title={lead.businessName}>
                    {lead.businessName}
                  </h3>
                  <StatusSelect leadId={lead.id} value={lead.outreachStatus} />
                  {qualifications?.[lead.id] && <FitBadge qualification={qualifications[lead.id]} />}
                </div>

                {lead.ownerName && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <User className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                    {lead.ownerName}
                    {lead.ownerTitle ? ` · ${lead.ownerTitle}` : ""}
                  </p>
                )}

                {lead.location && (
                  <p className="mt-1 flex items-start gap-1 text-[13px] text-slate-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
                    <span className="truncate">{lead.location}</span>
                  </p>
                )}

                {lead.description && (
                  <p className="mt-1 max-w-lg truncate text-[13px] text-slate-500" title={lead.description}>
                    {lead.description}
                  </p>
                )}

                {/* Contact row */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 -ml-2">
                  {lead.phone && <CopyableField icon={Phone} value={lead.phone} tone="text-slate-300" />}
                  {lead.email && (
                    <CopyableField
                      icon={Mail}
                      value={lead.email}
                      tone="text-cyan-300"
                      verified={lead.emailVerified}
                      roleBased={lead.isRoleBasedEmail}
                    />
                  )}
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-800/70 px-2 py-1 text-[11px] text-slate-500">
                    <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
                    Source: {domainOf(lead.sourceUrl)}
                  </span>
                  {lead.placeId && (
                    <span
                      title="Business identity confirmed via Google Places, not just an LLM's guess at a scraped page"
                      className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-lg bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                      Verified
                    </span>
                  )}
                  {lead.socialLinks &&
                    SOCIAL_ICON_MAP.filter(({ key }) => lead.socialLinks?.[key]).map(({ key, Icon, hover }) => (
                      <a
                        key={key}
                        href={lead.socialLinks![key]}
                        target="_blank"
                        rel="noreferrer"
                        title={`${key.charAt(0).toUpperCase()}${key.slice(1)}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 ${hover}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </a>
                    ))}
                </div>

                {qualifications?.[lead.id]?.opener && (
                  <OpenerBlock opener={qualifications[lead.id].opener!} />
                )}

                <NotesField leadId={lead.id} value={lead.notes} />
              </div>
            </div>

            {lead.website && (
              <a
                href={lead.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-slate-800 px-3 py-1.5 text-[13px] font-medium text-slate-300 shadow-glow-teal transition-colors hover:bg-slate-700 hover:text-white"
              >
                {domainOf(lead.website)}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
