import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Landmark,
  Loader2,
  LockKeyhole,
  MapPin,
  ScrollText,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApi } from "../lib/hooks";
import { api } from "../lib/api";
import { formatDate, money, shortDate, titleCase } from "../lib/format";
import type { Project } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "../components/Layout";
import { PageOverview, PageSection, SectionNav, type PageSection as PageSectionMeta } from "../components/PageFrame";
import { DonateModal } from "../components/DonateModal";
import {
  EmptyState,
  InfoNote,
  LoadingBlock,
  ProgressBar,
  SectionHeading,
  StatCard,
  StatusBadge,
} from "../components/ui";

function BudgetTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-navy-900 px-3 py-2 text-xs shadow-panel">
      <p className="mb-1.5 font-medium text-white">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center justify-between gap-4 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-mono">{money(Math.round((item.value ?? 0) * 100))}</span>
        </p>
      ))}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<Project>(id ? `/projects/${id}` : null);
  const [donateOpen, setDonateOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const approvePolicy = async () => {
    if (!data?.pending_policy) return;
    setApproving(true);
    try {
      await api.post(`/policies/${data.pending_policy.id}/approve`);
      toast.push(`Policy v${data.pending_policy.version} approved and now binding.`, "success");
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to approve policy.", "error");
    } finally {
      setApproving(false);
    }
  };

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Project" title="Loading project" />
        <div className="panel p-6">
          <LoadingBlock lines={7} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Project" title="Project unavailable" />
        <EmptyState
          title="Unable to open this project"
          description={error ?? "It may not exist, or your role cannot access it."}
          action={
            <Link to="/app" className="btn-secondary">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
          }
        />
      </>
    );
  }

  const financials = data.financials;
  const budgets = data.budgets ?? [];
  const purchases = data.purchases ?? [];
  const ledger = data.ledger ?? [];
  const policies = data.policies ?? [];
  const donationRecords = data.donations.records ?? data.donations.mine ?? [];
  const isOwner = user?.role === "organisation" && user.organisation?.id === data.organisation.id;
  const canSeeLedger = user?.role === "admin" || isOwner;

  const chartData = budgets.map((line) => ({
    name: line.category,
    Allocated: line.allocated_minor / 100,
    Committed: (line.committed_minor ?? 0) / 100,
  }));

  const sections: PageSectionMeta[] = [
    { id: "summary", label: "Position", hint: "Restricted balance, reservation and paid totals for this project." },
    { id: "budget", label: "Budget", hint: "Approved category lines and the spend committed against them." },
    { id: "procurement", label: "Procurement", hint: "Purchase requests and the engine's decision on each." },
    ...(canSeeLedger ? [{ id: "ledger", label: "Ledger", hint: "Append-only movements that produce the balances." }] : []),
    { id: "funding", label: "Funding", hint: "Donations received and the funding target." },
    ...(policies.length > 0 ? [{ id: "governance", label: "Governance", hint: "Policy versions, approvals and verification state." }] : []),
  ];
  const nextAction = isOwner
    ? data.policy
      ? "Submit a purchase request against an approved budget line. The engine evaluates it before any money moves."
      : "Submit a spending policy for administrator approval — the project cannot spend until a policy is approved."
    : user?.role === "donor"
      ? "Donate to lock funds to this project's purpose, then follow each authorised purchase below."
      : "Review the budget lines, procurement history and ledger to confirm how funds moved.";

  return (
    <>
      <PageHeader
        eyebrow={`${data.category} · ${data.organisation?.name}`}
        title={data.name}
        description={data.description}
        actions={
          <>
            {isOwner ? (
              <Link to={`/projects/${data.id}/purchase/new`} className="btn-primary" data-tour="primary-action">
                <Wallet className="h-4 w-4" /> Request purchase
              </Link>
            ) : null}
            {user?.role === "donor" ? (
              <button className="btn-primary" data-tour="primary-action" onClick={() => setDonateOpen(true)}>
                <Landmark className="h-4 w-4" /> Donate
              </button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        <StatusBadge status={data.verification_status} label={`Verification: ${titleCase(data.verification_status)}`} />
        {data.policy ? (
          <span className="chip">
            <LockKeyhole className="h-3 w-3 text-emerald-300" /> Policy v{data.policy.version}
          </span>
        ) : (
          <span className="chip !border-amber-400/25 !text-amber-200">No approved policy</span>
        )}
        <span className="chip">
          <CalendarDays className="h-3 w-3" /> {shortDate(data.starts_on)} – {shortDate(data.ends_on)}
        </span>
        <span className="chip">
          <Users className="h-3 w-3" /> {data.target_beneficiaries.toLocaleString("en-IN")} beneficiaries
        </span>
        <span className="chip">
          <MapPin className="h-3 w-3" /> {data.geographic_coverage}
        </span>
      </div>

      <PageOverview
        intro={
          <>
            This transparency view shows exactly where this project's money is. Donations become a restricted balance
            when confirmed; funds are reserved when a purchase passes the engine, and settle to the supplier's verified
            payout reference. Nothing here can be withdrawn by the organisation.
          </>
        }
        nextAction={nextAction}
        sections={sections}
      />
      <SectionNav sections={sections} />

      <PageSection id="summary" tour="kpis" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Restricted received"
          value={money(financials.received_minor, data.currency)}
          hint={`${data.donations.count} confirmed donation${data.donations.count === 1 ? "" : "s"} · target ${money(financials.funding_target_minor, data.currency)}`}
          icon={Landmark}
          tone="green"
        />
        <StatCard label="Available" value={money(financials.available_minor, data.currency)} hint="Unreserved restricted balance" icon={Wallet} />
        <StatCard label="Reserved" value={money(financials.reserved_minor, data.currency)} hint="Authorised, awaiting settlement" icon={LockKeyhole} tone="amber" />
        <StatCard label="Paid to vendors" value={money(financials.paid_minor, data.currency)} hint="Simulated vendor settlement" icon={BadgeCheck} />
      </PageSection>

      <div className="mt-4 panel p-5">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Funding progress</p>
            <p className="mt-1 font-mono text-lg text-white">
              {money(financials.received_minor, data.currency)}{" "}
              <span className="text-sm text-slate-500">of {money(financials.funding_target_minor, data.currency)}</span>
            </p>
          </div>
          <span className="text-xs text-slate-500">{financials.progress_percent}% funded</span>
        </div>
        <ProgressBar value={financials.progress_percent} height="h-2.5" />
        <p className="mt-2 text-[11px] text-slate-500">
          Received funds are held only as a restricted project balance. The organisation has no withdrawal capability.
        </p>
      </div>

      {data.pending_policy ? (
        <div className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-amber-100">Policy v{data.pending_policy.version} is awaiting approval</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
                {data.policy
                  ? `Until approved, policy v${data.policy.version} remains binding. The draft cannot authorise spending.`
                  : "The project is not active and cannot accept purchases until a policy version is approved."}
              </p>
            </div>
            {user?.role === "admin" ? (
              <button className="btn-amber shrink-0 px-3 py-2 text-xs" onClick={approvePolicy} disabled={approving}>
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                Approve policy v{data.pending_policy.version}
              </button>
            ) : (
              <StatusBadge status="pending_approval" />
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section id="budget" className="panel scroll-mt-28 p-5 sm:p-6">
          <SectionHeading
            eyebrow="Approved budget"
            title="Category allocation"
            description="Allocated budget lines and committed spend. Committed includes reserved and paid purchases."
          />
          {chartData.length === 0 ? (
            <EmptyState title="No approved budget" description="An approved policy is required before purchases can be evaluated." />
          ) : (
            <>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <Tooltip content={<BudgetTooltip />} cursor={{ fill: "rgba(148,163,184,0.05)" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                    <Bar dataKey="Allocated" fill="#334155" radius={[0, 4, 4, 0]} barSize={12} />
                    <Bar dataKey="Committed" fill="#34d399" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead>
                    <tr>
                      <th className="py-2 table-head">Category</th>
                      <th className="py-2 table-head text-right">Allocated</th>
                      <th className="py-2 table-head text-right">Committed</th>
                      <th className="py-2 table-head text-right">Remaining</th>
                      <th className="py-2 table-head">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((line) => {
                      const used = line.committed_minor ?? 0;
                      const percent = line.allocated_minor ? Math.round((used / line.allocated_minor) * 100) : 0;
                      return (
                        <tr key={line.category}>
                          <td className="table-cell text-slate-200">{line.category}</td>
                          <td className="table-cell text-right font-mono text-xs">{money(line.allocated_minor, data.currency)}</td>
                          <td className="table-cell text-right font-mono text-xs text-slate-300">{money(used, data.currency)}</td>
                          <td className="table-cell text-right font-mono text-xs text-emerald-300">
                            {money(line.available_minor ?? Math.max(0, line.allocated_minor - used), data.currency)}
                          </td>
                          <td className="table-cell w-32">
                            <ProgressBar value={percent} tone={percent > 100 ? "red" : percent > 80 ? "amber" : "emerald"} height="h-1.5" />
                            <span className="mt-1 block text-[10px] text-slate-500">{percent}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <aside className="space-y-5">
          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <LockKeyhole className="h-4 w-4 text-emerald-400" />
              Spending policy v{data.policy?.version ?? "—"}
            </p>
            {data.policy ? (
              <>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Binding policy approved {formatDate(data.policy.approved_at)}. Version history is immutable.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.policy.approved_categories.map((category) => (
                    <span key={category} className="chip">{category}</span>
                  ))}
                </div>
                <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Per-transaction limit</dt>
                    <dd className="font-mono text-slate-300">{money(data.policy.per_transaction_limit_minor, data.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Policy status</dt>
                    <dd><StatusBadge status={data.policy.status} /></dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Version</dt>
                    <dd className="font-mono text-slate-300">v{data.policy.version}</dd>
                  </div>
                </dl>
                {data.policy.notes ? (
                  <p className="mt-3 rounded-lg border border-white/[0.05] bg-navy-950/40 p-3 text-[11px] leading-relaxed text-slate-400">
                    {data.policy.notes}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No approved policy exists for this project.</p>
            )}
          </div>

          {data.operational_requirements ? (
            <div className="panel p-5">
              <p className="text-sm font-medium text-white">Operational requirements</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{data.operational_requirements}</p>
            </div>
          ) : null}

          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <Building2 className="h-4 w-4 text-emerald-400" />
              Organisation
            </p>
            <p className="mt-2 text-sm text-slate-200">{data.organisation?.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {data.organisation?.registration_number} · {data.organisation?.country}
            </p>
            <div className="mt-2">
              <StatusBadge status={data.organisation?.verification_status} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              The organisation can request purchases but cannot withdraw restricted funds. Payment goes directly to the
              vendor.
            </p>
          </div>

          <InfoNote tone="amber">
            Balances derive from ledger events (donations, reservations, releases, payments). An invoice or receipt does
            not by itself prove delivery; evidence statuses are tracked separately.
          </InfoNote>
        </aside>
      </div>

      <section id="procurement" className="mt-8 scroll-mt-28">
        <SectionHeading
          eyebrow="Procurement"
          title="Purchase requests"
          description={
            user?.role === "donor"
              ? "Only authorised and settled purchases are visible to donors."
              : "Status is the deterministic engine outcome. Open a request to inspect every check."
          }
          actions={
            isOwner ? (
              <Link to={`/projects/${data.id}/purchase/new`} className="btn-secondary px-3 py-2 text-xs">
                New purchase request <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null
          }
        />
        {purchases.length === 0 ? (
          <EmptyState title="No purchase requests" description="Requests will appear here once submitted." />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-5 py-3 table-head">Request</th>
                    <th className="px-5 py-3 table-head">Vendor</th>
                    <th className="px-5 py-3 table-head">Amount</th>
                    <th className="px-5 py-3 table-head">Engine outcome</th>
                    <th className="px-5 py-3 table-head">Status</th>
                    <th className="px-5 py-3 table-head">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="table-cell">
                        <Link to={`/purchases/${purchase.id}`} className="link text-sm">
                          #{purchase.id} · {purchase.description}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-slate-500">{purchase.category}</p>
                      </td>
                      <td className="table-cell text-xs text-slate-400">{purchase.vendor.business_name}</td>
                      <td className="table-cell font-mono text-slate-100">{money(purchase.total_amount_minor, purchase.currency)}</td>
                      <td className="table-cell">
                        <span className="flex items-center gap-1.5 text-xs">
                          {purchase.decision?.outcome === "approved" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          ) : purchase.decision?.outcome === "blocked" ? (
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                          ) : (
                            <ScrollText className="h-3.5 w-3.5 text-amber-400" />
                          )}
                          {titleCase(purchase.decision?.outcome ?? "not evaluated")}
                        </span>
                      </td>
                      <td className="table-cell"><StatusBadge status={purchase.status} /></td>
                      <td className="table-cell text-xs text-slate-500">{formatDate(purchase.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {canSeeLedger ? (
        <section id="ledger" className="mt-8 scroll-mt-28">
          <SectionHeading
            eyebrow="Append-only ledger"
            title="Financial events"
            description="Balances are the sum of these events. Rows are never edited or deleted."
            actions={
              <span className="chip">
                <ScrollText className="h-3 w-3" /> {ledger.length} events
              </span>
            }
          />
          <div className="panel overflow-hidden">
            {ledger.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No ledger events" description="Confirmed donations and purchase decisions will create events." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-5 py-3 table-head">Type</th>
                      <th className="px-5 py-3 table-head">Reference</th>
                      <th className="px-5 py-3 table-head">Description</th>
                      <th className="px-5 py-3 table-head text-right">Signed amount</th>
                      <th className="px-5 py-3 table-head">Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((event) => (
                      <tr key={event.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="table-cell font-mono text-[11px] text-slate-300">{event.event_type}</td>
                        <td className="table-cell font-mono text-[11px] text-slate-400">{event.reference}</td>
                        <td className="table-cell text-xs text-slate-400">{event.description}</td>
                        <td
                          className={`table-cell text-right font-mono text-xs ${
                            event.amount_minor >= 0 ? "text-emerald-300" : "text-slate-300"
                          }`}
                        >
                          {event.amount_minor >= 0 ? "+" : ""}
                          {money(event.amount_minor, event.currency)}
                        </td>
                        <td className="table-cell text-xs text-slate-500">{formatDate(event.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section id="funding" className="mt-8 scroll-mt-28">
        <SectionHeading
          eyebrow="Funding"
          title={user?.role === "donor" ? "Your contributions" : "Project donations"}
          description={data.donations.note ?? "Confirmed donations pool into the restricted project balance; they are not attributed to individual purchases."}
        />
        {donationRecords.length === 0 ? (
          <EmptyState
            title={user?.role === "donor" ? "You have not funded this project" : "No confirmed donations"}
            description={user?.role === "donor" ? "Contribute to lock funds to this project's approved purpose." : undefined}
            action={
              user?.role === "donor" ? (
                <button className="btn-primary" onClick={() => setDonateOpen(true)}>
                  Donate to this project
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-5 py-3 table-head">Reference</th>
                    {user?.role === "donor" ? null : <th className="px-5 py-3 table-head">Donor</th>}
                    <th className="px-5 py-3 table-head">Amount</th>
                    <th className="px-5 py-3 table-head">Status</th>
                    <th className="px-5 py-3 table-head">Confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  {donationRecords.map((donation) => (
                    <tr key={donation.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="table-cell font-mono text-xs text-slate-400">{donation.payment_reference}</td>
                      {user?.role === "donor" ? null : (
                        <td className="table-cell text-xs text-slate-300">{donation.donor?.full_name ?? "—"}</td>
                      )}
                      <td className="table-cell font-mono text-slate-100">{money(donation.amount_minor, donation.currency)}</td>
                      <td className="table-cell"><StatusBadge status={donation.payment_status} /></td>
                      <td className="table-cell text-xs text-slate-500">{formatDate(donation.confirmed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {policies.length > 0 ? (
        <section id="governance" className="mt-8 scroll-mt-28">
          <SectionHeading
            eyebrow="Governance"
            title="Policy version history"
            description="Approved versions are immutable. A change creates a new version and supersedes the previous one."
          />
          <div className="panel divide-y divide-white/[0.05]">
            {policies.map((policy) => (
              <div key={policy.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">Version {policy.version}</p>
                    <StatusBadge status={policy.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {policy.approved_categories.length} categories · limit {money(policy.per_transaction_limit_minor, data.currency)} · created{" "}
                    {formatDate(policy.created_at)}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">
                  {policy.approved_at ? `Approved ${formatDate(policy.approved_at)}` : "Not approved"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <DonateModal project={data} open={donateOpen} onClose={() => setDonateOpen(false)} onComplete={reload} />
    </>
  );
}
