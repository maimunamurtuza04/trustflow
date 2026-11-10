import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  HandCoins,
  Landmark,
  Loader2,
  LockKeyhole,
  Receipt,
  ShieldCheck,
  Wallet,
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
import { formatDate, money, shortDate } from "../lib/format";
import type { Donation, DonorOverview } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "../components/Layout";
import { PageOverview, PageSection, SectionNav, type PageSection as PageSectionMeta } from "../components/PageFrame";
import { TourOverlay, useOnboarding } from "../components/OnboardingTour";
import { DonateModal } from "../components/DonateModal";
import {
  EmptyState,
  InfoNote,
  LoadingBlock,
  ProgressBar,
  SectionHeading,
  SimulatedBadge,
  StatCard,
  StatusBadge,
} from "../components/ui";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
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

export default function DonorDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<DonorOverview>("/donor/overview");
  const tour = useOnboarding("donor");
  const [donateTo, setDonateTo] = useState<DonorOverview["projects"][number] | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const confirmDonation = async (donation: Donation) => {
    setConfirming(donation.id);
    try {
      await api.post(`/donations/${donation.id}/confirm`, { idempotency_key: crypto.randomUUID() });
      toast.push(`${money(donation.amount_minor, donation.currency)} confirmed (simulated) and added to the restricted pool.`, "success");
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to confirm donation.", "error");
    } finally {
      setConfirming(null);
    }
  };

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Donor" title="My giving" />
        <div className="panel p-6">
          <LoadingBlock lines={6} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Donor" title="My giving" />
        <EmptyState title="Unable to load your giving overview" description={error ?? "Please try again."} />
      </>
    );
  }

  const { stats } = data;
  const pledged = data.donations.filter((donation) => donation.payment_status === "pledged");
  const chartData = data.projects.map((project) => ({
    name: project.name.length > 18 ? `${project.name.slice(0, 18)}…` : project.name,
    Paid: project.financials.paid_minor / 100,
    Reserved: project.financials.reserved_minor / 100,
    Available: project.financials.available_minor / 100,
  }));

  const sections: PageSectionMeta[] = [
    { id: "summary", label: "Giving summary", hint: "Confirmed donations, projects funded and restricted money still unspent." },
    { id: "allocation", label: "Allocation", hint: "How funded projects split money between paid, reserved and available." },
    { id: "donations", label: "Donation history", hint: "Every pledge, its simulated reference and confirmation state." },
    { id: "projects", label: "Funded projects", hint: "Progress, balances and the ability to contribute again." },
    { id: "purchases", label: "Verified spending", hint: "Authorised vendor purchases from the projects you funded." },
  ];
  const nextAction = pledged.length > 0
    ? `${pledged.length} pledge${pledged.length === 1 ? "" : "s"} await simulated payment confirmation. Pledged money is not part of the restricted balance until confirmed.`
    : data.projects.length === 0
      ? "Fund a project to start a restricted balance."
      : "Open a funded project's transparency view to follow money from donation to vendor settlement.";

  return (
    <>
      <PageHeader
        eyebrow={`Welcome back, ${user?.full_name.split(" ")[0] ?? "donor"}`}
        title="My giving"
        description="Every contribution is locked to a project purpose. Follow it from donation, through the authorization engine, to vendor settlement and recorded evidence."
        actions={
          <Link to="/projects" className="btn-primary" data-tour="primary-action">
            <HandCoins className="h-4 w-4" />
            Fund a project
          </Link>
        }
      />

      <PageOverview
        intro={
          <>
            This is your giving position across every project you have funded. Donations arrive as pledges, become
            restricted balances once the simulated payment is confirmed, and can only leave through purchases that pass
            the deterministic authorization engine.
          </>
        }
        nextAction={nextAction}
        sections={sections}
        checklist={[
          { label: "Fund a project", done: data.donations.length > 0 },
          {
            label: "Confirm a simulated donation",
            done: data.donations.some((donation) => donation.payment_status === "confirmed"),
          },
          { label: "Follow an authorised purchase", done: data.purchases.length > 0 },
        ]}
      />
      <SectionNav sections={sections} />

      <PageSection id="summary" tour="kpis" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total donated"
          value={money(stats.confirmed_donated_minor)}
          hint={`${data.donations.filter((d) => d.payment_status === "confirmed").length} confirmed contributions`}
          icon={HandCoins}
          tone="green"
        />
        <StatCard
          label="Projects funded"
          value={stats.projects_funded}
          hint="Active causes receiving restricted funds"
          icon={Landmark}
        />
        <StatCard
          label="Paid to suppliers"
          value={money(stats.paid_to_suppliers_minor)}
          hint="Settled through authorised purchases only"
          icon={Receipt}
        />
        <StatCard
          label="Restricted & unspent"
          value={money(stats.remaining_restricted_minor)}
          hint="Available for future authorised purchases"
          icon={LockKeyhole}
        />
      </PageSection>

      {pledged.length > 0 ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-100">
                  {pledged.length} donation{pledged.length === 1 ? "" : "s"} awaiting payment confirmation
                </p>
                <p className="mt-1 text-xs text-amber-100/60">
                  Pledged money is not part of the restricted balance until the simulated payment is confirmed.
                </p>
              </div>
              <SimulatedBadge />
            </div>
          </div>
        </div>
      ) : null}

      <PageSection id="allocation" className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="panel p-5 sm:p-6">
          <SectionHeading
            eyebrow="Allocation"
            title="Where your money is"
            description="Project balances are derived from append-only ledger events, not editable dashboard figures."
          />
          {chartData.length === 0 ? (
            <EmptyState title="No funded projects yet" description="Fund a project to see its allocation." />
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.05)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                  <Bar dataKey="Paid" stackId="a" fill="#34d399" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Reserved" stackId="a" fill="#38bdf8" />
                  <Bar dataKey="Available" stackId="a" fill="#334155" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>Values are INR. Reserved funds are authorised but not yet settled.</span>
            <Link to="/projects" className="link">
              Add another contribution
            </Link>
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <SectionHeading eyebrow="Traceability" title="How your donation is protected" />
          <ol className="space-y-4">
            {[
              { title: "Restricted on arrival", text: "Funds attach to one project and its approved policy — never a general organisation account." },
              { title: "Spent only by policy", text: "Eleven deterministic checks evaluate each request. AI can only escalate for review." },
              { title: "Paid to the vendor", text: "Settlement routes to the vendor's verified payout reference, not the organisation." },
              { title: "Evidence stays separate", text: "Payment confirmations are recorded separately from invoices. Delivery is not inferred from paperwork." },
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
          <div className="mt-5">
            <InfoNote>{data.attribution_note}</InfoNote>
          </div>
        </section>
      </PageSection>

      <PageSection id="donations" className="mt-8">
        <SectionHeading
          eyebrow="Your contributions"
          title="Donation history"
          description="Pledged donations are not counted as received until confirmation."
        />
        {data.donations.length === 0 ? (
          <EmptyState
            title="You have not donated yet"
            description="Browse active projects and fund a purpose you trust."
            action={
              <Link to="/projects" className="btn-primary">
                Browse projects
              </Link>
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-5 py-3 table-head">Reference</th>
                    <th className="px-5 py-3 table-head">Project</th>
                    <th className="px-5 py-3 table-head">Amount</th>
                    <th className="px-5 py-3 table-head">Payment</th>
                    <th className="px-5 py-3 table-head">Created</th>
                    <th className="px-5 py-3 table-head text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donations.map((donation) => (
                    <tr key={donation.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="table-cell font-mono text-xs text-slate-400">{donation.payment_reference}</td>
                      <td className="table-cell">
                        {donation.project ? (
                          <Link to={`/projects/${donation.project.id}`} className="link text-sm">
                            {donation.project.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="table-cell font-mono text-slate-100">{money(donation.amount_minor, donation.currency)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={donation.payment_status} />
                          {donation.simulated ? <span className="text-[10px] uppercase tracking-wider text-amber-300/70">sim</span> : null}
                        </div>
                      </td>
                      <td className="table-cell text-xs text-slate-500">
                        {formatDate(donation.confirmed_at ?? donation.created_at)}
                      </td>
                      <td className="table-cell text-right">
                        {donation.payment_status === "pledged" ? (
                          <button
                            className="btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => confirmDonation(donation)}
                            disabled={confirming === donation.id}
                          >
                            {confirming === donation.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                            Confirm
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Restricted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageSection>

      <PageSection id="projects" className="mt-8">
        <SectionHeading
          eyebrow="Impact"
          title="Funded projects"
          description="Track project progress and the restricted balance still available."
        />
        {data.projects.length === 0 ? (
          <EmptyState title="No funded projects" description="Your confirmed donations will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.projects.map((project) => (
              <div key={project.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">{project.category}</p>
                    <Link to={`/projects/${project.id}`} className="mt-1 block text-[15px] font-semibold text-white hover:text-emerald-200">
                      {project.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.organisation?.name} · {project.geographic_coverage}
                    </p>
                  </div>
                  <StatusBadge status={project.status} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Received</p>
                    <p className="mt-1 font-mono text-xs text-white">{money(project.financials.received_minor)}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Paid</p>
                    <p className="mt-1 font-mono text-xs text-emerald-300">{money(project.financials.paid_minor)}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Available</p>
                    <p className="mt-1 font-mono text-xs text-slate-300">{money(project.financials.available_minor)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                    <span>Funding progress</span>
                    <span>{project.financials.progress_percent}%</span>
                  </div>
                  <ProgressBar value={project.financials.progress_percent} />
                  <p className="mt-2 text-[11px] text-slate-600">Ends {shortDate(project.ends_on)}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link to={`/projects/${project.id}`} className="btn-secondary flex-1 px-3 py-2 text-xs">
                    Transparency view <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <button className="btn-primary px-3 py-2 text-xs" onClick={() => setDonateTo(project)}>
                    Donate again
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection id="purchases" className="mt-8">
        <SectionHeading
          eyebrow="Expenditure"
          title="Authorised purchases"
          description="Only authorisations that passed the deterministic engine are shown. Blocked and review-stage requests stay hidden."
        />
        {data.purchases.length === 0 ? (
          <EmptyState title="No authorised purchases yet" description="Once the organisation submits a compliant purchase, it appears here." />
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="px-5 py-3 table-head">Purchase</th>
                    <th className="px-5 py-3 table-head">Project</th>
                    <th className="px-5 py-3 table-head">Vendor</th>
                    <th className="px-5 py-3 table-head">Amount</th>
                    <th className="px-5 py-3 table-head">Status</th>
                    <th className="px-5 py-3 table-head">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.purchases.map((purchase) => (
                    <tr key={purchase.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="table-cell">
                        <Link to={`/purchases/${purchase.id}`} className="link text-sm">
                          #{purchase.id} · {purchase.description}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-slate-500">{purchase.category}</p>
                      </td>
                      <td className="table-cell text-xs text-slate-400">{purchase.project.name}</td>
                      <td className="table-cell text-xs text-slate-400">{purchase.vendor.business_name}</td>
                      <td className="table-cell font-mono text-slate-100">{money(purchase.total_amount_minor, purchase.currency)}</td>
                      <td className="table-cell"><StatusBadge status={purchase.status} /></td>
                      <td className="table-cell text-xs text-slate-500">{formatDate(purchase.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageSection>

      <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5" />
        Simulated data and payments. Balances derive from the project ledger, not from dashboard edits.
      </div>

      <DonateModal
        project={donateTo}
        open={Boolean(donateTo)}
        onClose={() => setDonateTo(null)}
        onComplete={reload}
      />

      <TourOverlay
        steps={tour.steps}
        open={tour.open}
        onFinish={tour.finish}
        onSkip={tour.skip}
        onProgress={tour.progress}
      />
    </>
  );
}
