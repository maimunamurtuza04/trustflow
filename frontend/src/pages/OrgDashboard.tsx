import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  FolderPlus,
  Landmark,
  LockKeyhole,
  Receipt,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";
import { useApi } from "../lib/hooks";
import { formatDate, money, shortDate } from "../lib/format";
import type { OrgOverview } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/Layout";
import { PageOverview, PageSection, SectionNav, type PageSection as PageSectionMeta } from "../components/PageFrame";
import { TourOverlay, useOnboarding } from "../components/OnboardingTour";
import {
  EmptyState,
  InfoNote,
  LoadingBlock,
  ProgressBar,
  SectionHeading,
  StatCard,
  StatusBadge,
} from "../components/ui";

export default function OrgDashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<OrgOverview>("/org/overview");
  const tour = useOnboarding("organisation");

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Organisation" title="Overview" />
        <div className="panel p-6">
          <LoadingBlock lines={6} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Organisation" title="Overview" />
        <EmptyState title="Unable to load organisation overview" description={error ?? "Please try again."} />
      </>
    );
  }

  if (!data.organisation) {
    return (
      <>
        <PageHeader eyebrow="Organisation" title="Overview" />
        <EmptyState
          icon={Building2}
          title="Organisation profile missing"
          description="Your account has no organisation profile. Contact a platform administrator."
        />
      </>
    );
  }

  const { organisation, stats } = data;
  const policyCategories = Array.from(
    new Set(data.projects.flatMap((project) => project.policy?.approved_categories ?? [])),
  );
  const firstProject = data.projects[0];
  const purchaseHref = firstProject ? `/projects/${firstProject.id}/purchase/new` : "/projects/new";

  const firstPending = data.pending_policies[0];
  const sections: PageSectionMeta[] = [
    { id: "funds", label: "Restricted funds", hint: "Received, available, reserved and paid balances for your projects." },
    ...(firstPending
      ? [{ id: "approvals", label: "Approval queue", hint: "Policy versions waiting for an administrator." }]
      : []),
    { id: "projects", label: "Projects", hint: "Per-project ledger balances, funding progress and binding policy." },
    { id: "procurement", label: "Purchase requests", hint: "Every request you submitted and the engine's decision." },
  ];
  const nextAction = firstPending
    ? `Policy v${firstPending.version} for ${firstPending.project.name} is waiting for administrator approval. The previous approved policy remains binding until then.`
    : stats.review_required > 0
      ? `${stats.review_required} request${stats.review_required === 1 ? "" : "s"} sit in human review. No funds are reserved until an administrator decides.`
      : stats.awaiting_payment > 0
        ? `${stats.awaiting_payment} authorised request${stats.awaiting_payment === 1 ? "" : "s"} await simulated settlement to the verified vendor.`
        : data.projects.length === 0
          ? "Create a project, define its spending policy and submit it for administrator approval."
          : "Open a paid purchase to record receipt, or submit a new request against an approved policy.";

  return (
    <>
      <PageHeader
        eyebrow="Organisation console"
        title={organisation.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{user?.email}</span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1.5">
              <StatusBadge status={organisation.verification_status} />
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-xs">Reg. {organisation.registration_number}</span>
          </span>
        }
        actions={
          <>
            <Link to="/projects/new" className="btn-secondary">
              <FolderPlus className="h-4 w-4" />
              New project
            </Link>
            <Link to={purchaseHref} className="btn-primary" data-tour="primary-action">
              <ShieldCheck className="h-4 w-4" />
              Submit a purchase
            </Link>
          </>
        }
      />

      <PageOverview
        intro={
          <>
            This console is your organisation&rsquo;s restricted-funds position and procurement trail. You cannot withdraw
            money: every rupee leaves through a purchase request that the deterministic engine authorises and settles to a
            verified vendor.
          </>
        }
        nextAction={nextAction}
        sections={sections}
        checklist={[
          { label: "Create a project", done: data.projects.length > 0 },
          { label: "Get a spending policy approved", done: data.projects.some((project) => Boolean(project.policy)) },
          { label: "Submit a purchase request", done: data.purchases.length > 0 },
          {
            label: "Settle an authorised request",
            done: data.purchases.some((purchase) => purchase.status === "paid"),
          },
        ]}
      />
      <SectionNav sections={sections} />

      {organisation.verification_status !== "verified" ? (
        <div className="mb-6 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Verification {organisation.verification_status}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-100/70">
            Projects require an administrator to verify this organisation and approve each spending policy before
            donations or purchases are accepted.
          </p>
        </div>
      ) : null}

      <PageSection id="funds" tour="kpis">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Restricted funds received" value={money(stats.received_minor)} hint="Confirmed donations only" icon={Landmark} tone="green" />
          <StatCard label="Available to spend" value={money(stats.available_minor)} hint="Subject to approved policy and budget lines" icon={Wallet} />
          <StatCard label="Reserved for settlement" value={money(stats.reserved_minor)} hint="Authorised, not yet paid" icon={Clock3} tone="amber" />
          <StatCard label="Paid to vendors" value={money(stats.paid_minor)} hint="Settled directly to verified suppliers" icon={Receipt} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel-flat flex items-center justify-between px-4 py-3">
            <span className="text-xs text-slate-400">Active projects</span>
            <span className="font-mono text-lg text-white">{stats.active_projects}</span>
          </div>
          <div className="panel-flat flex items-center justify-between px-4 py-3">
            <span className="text-xs text-slate-400">Purchases needing review</span>
            <span className={`font-mono text-lg ${stats.review_required ? "text-amber-300" : "text-white"}`}>{stats.review_required}</span>
          </div>
          <div className="panel-flat flex items-center justify-between px-4 py-3">
            <span className="text-xs text-slate-400">Authorised, awaiting payment</span>
            <span className={`font-mono text-lg ${stats.awaiting_payment ? "text-sky-300" : "text-white"}`}>{stats.awaiting_payment}</span>
          </div>
          <div className="panel-flat flex items-center justify-between px-4 py-3">
            <span className="text-xs text-slate-400">Verified vendors available</span>
            <span className="font-mono text-lg text-white">{stats.verified_vendors}</span>
          </div>
        </div>
      </PageSection>

      {data.pending_policies.length > 0 ? (
        <PageSection id="approvals" className="mt-8">
          <SectionHeading
            eyebrow="Approval queue"
            title="Policies awaiting administrator approval"
            description="New policy versions do not take effect until an administrator approves them. Until then, the previous approved version remains binding."
          />
          <div className="space-y-3">
            {data.pending_policies.map((policy) => (
              <div key={policy.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    {policy.project.name} <span className="text-slate-500">· policy v{policy.version}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {policy.approved_categories.length} categories · transaction limit {money(policy.per_transaction_limit_minor)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="pending" />
                  <Link to={`/projects/${policy.project.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                    View project
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      ) : null}

      <PageSection id="projects" className="mt-8">
        <SectionHeading
          eyebrow="Restricted balances"
          title="Projects"
          description="Balances are project-specific. There is no organisation-level wallet or withdrawal path."
          actions={
            <Link to="/projects/new" className="btn-secondary px-3 py-2 text-xs">
              <FolderPlus className="h-3.5 w-3.5" /> Create project
            </Link>
          }
        />
        {data.projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create a project, define its approved spending policy and submit it for administrator approval."
            action={
              <Link to="/projects/new" className="btn-primary">
                Create a project
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.projects.map((project) => (
              <article key={project.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">{project.category}</p>
                    <Link to={`/projects/${project.id}`} className="mt-1 block text-[15px] font-semibold text-white hover:text-emerald-200">
                      {project.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.geographic_coverage} · {project.target_beneficiaries.toLocaleString("en-IN")} beneficiaries
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={project.status} />
                    {project.pending_policy ? <span className="text-[10px] uppercase tracking-wider text-amber-300">v{project.pending_policy.version} pending</span> : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Received", money(project.financials.received_minor), "text-white"],
                    ["Available", money(project.financials.available_minor), "text-slate-300"],
                    ["Reserved", money(project.financials.reserved_minor), "text-sky-300"],
                    ["Paid", money(project.financials.paid_minor), "text-emerald-300"],
                  ].map(([label, value, color]) => (
                    <div key={label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                      <p className={`mt-1 font-mono text-xs ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                    <span>Funding progress</span>
                    <span>{project.financials.progress_percent}% of {money(project.funding_target_minor)}</span>
                  </div>
                  <ProgressBar value={project.financials.progress_percent} />
                </div>

                {project.policy ? (
                  <div className="mt-4 rounded-lg border border-white/[0.05] bg-navy-950/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Approved policy v{project.policy.version}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {project.policy.approved_categories.map((category) => (
                        <span key={category} className="chip !px-2 !py-0.5 !text-[10px]">{category}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500">
                      Per-transaction limit {money(project.policy.per_transaction_limit_minor)} · ends {shortDate(project.ends_on)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 text-[11px] text-amber-100/80">
                    No approved spending policy — the project cannot accept purchases until one is approved.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/projects/${project.id}/purchase/new`} className="btn-primary flex-1 px-3 py-2 text-xs">
                    Request a purchase
                  </Link>
                  <Link to={`/projects/${project.id}`} className="btn-secondary flex-1 px-3 py-2 text-xs">
                    Ledger & policy
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </PageSection>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <PageSection id="procurement" tour="procurement">
          <SectionHeading
            eyebrow="Procurement"
            title="Purchase requests"
            description="Every request is evaluated server-side against the approved policy. Status reflects the engine decision."
          />
          {data.purchases.length === 0 ? (
            <EmptyState
              title="No purchase requests"
              description="Select a project and request goods or services from a verified vendor."
              action={
                <Link to="/projects" className="btn-secondary">
                  View projects
                </Link>
              }
            />
          ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-5 py-3 table-head">Request</th>
                      <th className="px-5 py-3 table-head">Project</th>
                      <th className="px-5 py-3 table-head">Vendor</th>
                      <th className="px-5 py-3 table-head">Amount</th>
                      <th className="px-5 py-3 table-head">Engine</th>
                      <th className="px-5 py-3 table-head">Submitted</th>
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

        <aside className="space-y-5">
          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <LockKeyhole className="h-4 w-4 text-emerald-400" />
              Approved spending categories
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Union of all approved project policies. A purchase outside these categories is blocked by the engine.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {policyCategories.length === 0 ? (
                <span className="text-xs text-slate-500">None yet</span>
              ) : (
                policyCategories.map((category) => (
                  <span key={category} className="chip">{category}</span>
                ))
              )}
            </div>
          </div>
          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <Store className="h-4 w-4 text-emerald-400" />
              Vendor eligibility
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Only vendors with a verified registration and a verified payout destination can be paid. Verification is
              not a guarantee of delivery — it is a pre-condition for settlement.
            </p>
            <Link to={purchaseHref} className="link mt-3 inline-flex items-center gap-1 text-xs">
              Submit a request to compare vendors <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <InfoNote tone="amber">
            Organisations never receive unrestricted cash. Settlement is simulated in this prototype and always routes
            to the vendor&rsquo;s verified payout reference.
          </InfoNote>
        </aside>
      </div>

      <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-600">
        <BadgeCheck className="h-3.5 w-3.5" />
        Policy changes are versioned and audited. Approved versions are immutable.
      </div>

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
