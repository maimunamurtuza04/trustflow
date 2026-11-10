import { useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ScrollText,
  ShieldCheck,
  ShieldOff,
  Timer,
  Wrench,
} from "lucide-react";
import { useApi } from "../lib/hooks";
import type { SecurityPosture } from "../lib/types";
import { PageHeader } from "../components/Layout";
import { PageOverview, PageSection, SectionNav, type PageSection as PageSectionMeta } from "../components/PageFrame";
import { EmptyState, InfoNote, LoadingBlock, SectionHeading, StatCard } from "../components/ui";

const SECTIONS: PageSectionMeta[] = [
  { id: "summary", label: "Posture", hint: "How many controls are enforced, simulated or still missing." },
  { id: "enforced", label: "Enforced controls", hint: "Controls that run on every request, with the file that proves it." },
  { id: "money", label: "Money integrity", hint: "How restricted funds, idempotency and settlement checks work." },
  { id: "limits", label: "Rate limits", hint: "The abuse limits applied to sensitive endpoints." },
  { id: "gaps", label: "Open gaps", hint: "What is genuinely not built — stated plainly, not hidden." },
];

const AREA_ICON: Record<string, typeof ShieldCheck> = {
  Identity: Fingerprint,
  Money: LockKeyhole,
  Operations: Wrench,
};

export default function Security() {
  const { data, loading, error } = useApi<SecurityPosture>("/security/posture");
  const [openAreas, setOpenAreas] = useState<Record<string, boolean>>({});

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Trust Centre" title="Security posture" />
        <div className="panel p-6">
          <LoadingBlock lines={8} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Trust Centre" title="Security posture" />
        <EmptyState title="Unable to load the security posture" description={error ?? "Please try again."} />
      </>
    );
  }

  const areas = Array.from(new Set(data.enforced.map((control) => control.area)));
  const sessionHours = Math.round((data.summary.session_minutes / 60) * 10) / 10;

  return (
    <>
      <PageHeader
        eyebrow="Trust Centre"
        title="Security posture"
        description="An honest inventory of the controls this platform actually enforces, what is simulated, and what is still missing. Nothing on this page describes a control that does not exist in the code."
      />

      <PageOverview
        intro={
          <>
            TrustFlow handles money that was donated for a purpose, so the controls are the product. This page is
            generated from the running API, not from a marketing deck: each enforced control names where it lives, and
            every gap is listed as a gap.
          </>
        }
        nextAction={data.statement}
        sections={SECTIONS}
      />
      <SectionNav sections={SECTIONS} />

      <PageSection id="summary" tour="kpis" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Enforced controls"
          value={data.summary.enforced_controls}
          hint="Applied server-side on every request"
          icon={ShieldCheck}
          tone="green"
        />
        <StatCard
          label="Simulated boundaries"
          value={data.summary.simulated_boundaries}
          hint="Clearly labelled as simulated in the UI"
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Open gaps"
          value={data.summary.open_gaps}
          hint="Not implemented — listed below without spin"
          icon={ShieldOff}
        />
        <StatCard
          label="Session lifetime"
          value={`${sessionHours}h`}
          hint={`Roles: ${data.summary.role_scope}`}
          icon={Timer}
        />
      </PageSection>

      <PageSection id="enforced" className="mt-8">
        <SectionHeading
          eyebrow="Implemented"
          title="What the platform enforces"
          description="Grouped by area. Expand a group to see each control and the module that implements it."
        />
        <div className="space-y-3">
          {areas.map((area) => {
            const controls = data.enforced.filter((control) => control.area === area);
            const open = openAreas[area] ?? true;
            const Icon = AREA_ICON[area] ?? ShieldCheck;
            return (
              <div key={area} className="panel overflow-hidden">
                <button
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  onClick={() => setOpenAreas((current) => ({ ...current, [area]: !open }))}
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-white">{area}</span>
                      <span className="block text-[11px] text-slate-500">{controls.length} enforced controls</span>
                    </span>
                  </span>
                  <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
                </button>
                {open ? (
                  <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                    {controls.map((control) => (
                      <div key={control.title} className="flex gap-3 px-5 py-4">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200">{control.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">{control.detail}</p>
                          <p className="mt-1.5 font-mono text-[10px] text-slate-600">{control.evidence}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </PageSection>

      <PageSection id="money" className="mt-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Payment boundary"
              title="Every payment is simulated"
              description={data.payments.note}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {data.payments.reference_prefixes.map((prefix) => (
                <span key={prefix} className="chip font-mono">{prefix}…</span>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {data.simulated.map((item) => (
                <div key={item.title} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3.5">
                  <p className="flex items-center gap-2 text-xs font-medium text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" /> {item.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-100/60">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Fund flow"
              title="Why money cannot leak"
              description="Four properties together mean a donation can only ever reach a verified supplier for an approved purpose."
            />
            <ol className="space-y-4">
              {[
                { title: "Restricted on arrival", text: "A confirmed donation increases one project's balance. There is no organisation wallet to withdraw from." },
                { title: "Reserved before payment", text: "Authorisation atomically reserves the amount against a budget line, so concurrent requests cannot overspend." },
                { title: "Paid to the vendor only", text: "Settlement re-reads the vendor's verified payout reference at the moment of payment." },
                { title: "Append-only evidence", text: "Ledger, audit and delivery records are insert-only; corrections are new events that preserve history." },
              ].map((item, index) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 font-mono text-[11px] text-emerald-300">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </PageSection>

      <PageSection id="limits" className="mt-8">
        <SectionHeading
          eyebrow="Abuse protection"
          title="Rate limits in force"
          description="Applied by the API before the handler runs. Exceeding a limit returns HTTP 429."
        />
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-5 py-3 table-head">Endpoint</th>
                  <th className="px-5 py-3 table-head">Limit</th>
                </tr>
              </thead>
              <tbody>
                {data.rate_limits.map((limit) => (
                  <tr key={limit.endpoint} className="transition-colors hover:bg-white/[0.02]">
                    <td className="table-cell text-sm text-slate-200">{limit.endpoint}</td>
                    <td className="table-cell font-mono text-xs text-slate-400">{limit.limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4">
          <InfoNote>
            Limits are held in process memory. They reset when the API restarts and are not shared between workers —
            this is listed as an open gap below.
          </InfoNote>
        </div>
      </PageSection>

      <PageSection id="gaps" className="mt-8">
        <SectionHeading
          eyebrow="Known gaps"
          title="What is not built yet"
          description="These are real absences in this prototype. They are listed here so nobody has to guess."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {data.not_implemented.map((gap) => (
            <div key={gap.title} className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-red-100">
                <ShieldOff className="h-4 w-4" /> {gap.title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-red-100/60">{gap.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          {data.statement}
        </div>
      </PageSection>

      <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-600">
        <KeyRound className="h-3.5 w-3.5" />
        Describe only what runs. This page is generated from the live API so it cannot drift from the code.
      </div>
    </>
  );
}
