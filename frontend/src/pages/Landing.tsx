import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  CircleSlash,
  FileSearch,
  Fingerprint,
  Landmark,
  LockKeyhole,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  XCircle,
  AlertCircle,
  Clock3,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { StatusBadge, InfoNote } from "../components/ui";

const FLOW = [
  { title: "Donors fund a purpose", text: "Contributions land in a project-specific restricted balance — not a general NGO wallet.", icon: Users },
  { title: "AI can map the purpose", text: "When an AI provider is configured, project descriptions become structured requirements and estimated budgets. Without one, the panel says so.", icon: BrainCircuit },
  { title: "Organisation requests", text: "The NGO submits a purchase request and supplier quotation. No unrestricted withdrawal exists.", icon: FileSearch },
  { title: "Deterministic policy decides", text: "Eleven server-side checks evaluate the request against the approved policy. AI cannot approve anything.", icon: ShieldCheck },
  { title: "Payment routes to the vendor", text: "Only verified vendor destinations receive settlement. The organisation never holds the cash.", icon: Truck },
  { title: "Evidence is recorded", text: "Payment confirmations attach to the transaction as evidence. Delivery is tracked separately and never inferred from an invoice.", icon: ScanSearch },
];

const OUTCOMES = [
  {
    label: "APPROVED",
    icon: CheckCircle2,
    color: "text-emerald-300 border-emerald-400/25 bg-emerald-400/[0.06]",
    detail: "Relevant category, verified vendor, matching payout destination, sufficient restricted funds and no duplicate pattern.",
  },
  {
    label: "BLOCKED",
    icon: XCircle,
    color: "text-red-300 border-red-400/25 bg-red-400/[0.06]",
    detail: "A definite policy violation — for example an unrelated personal electronics purchase from a flood-relief pool.",
  },
  {
    label: "REVIEW REQUIRED",
    icon: AlertCircle,
    color: "text-amber-300 border-amber-400/25 bg-amber-400/[0.06]",
    detail: "An operational category whose eligibility is not established by policy. A human administrator must decide.",
  },
  {
    label: "PENDING",
    icon: Clock3,
    color: "text-slate-300 border-white/10 bg-white/[0.03]",
    detail: "Required information is missing — quotation reference, payout destination or an approved policy version.",
  },
];

const CHECKS = [
  "Approved policy version in force",
  "Project is active",
  "Organisation is verified",
  "Vendor is verified",
  "Category is permitted",
  "Contextual relevance",
  "Category budget available",
  "Restricted funds sufficient",
  "Payout destination matches",
  "No duplicate purchase",
  "No unusual pattern",
];

const AI_SERVICES = [
  { title: "Project understanding", desc: "Turns a project description into structured requirements and estimated budgets, when configured." },
  { title: "Relevance analysis", desc: "Judges whether a purchase is contextually relevant to the stated purpose. It can escalate, never approve." },
  { title: "Explanation engine", desc: "Explains why a decision was made, in plain language, without changing it." },
  { title: "Anomaly signals", desc: "Duplicate, velocity and split-purchase patterns are detected by deterministic rules — not by an LLM." },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-navy-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-navy-950 shadow-glow">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">TrustFlow</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
            <a href="#problem" className="transition-colors hover:text-white">The problem</a>
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#engine" className="transition-colors hover:text-white">Authorization engine</a>
            <a href="#demo" className="transition-colors hover:text-white">Demo scenario</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className="btn-primary">
                Open dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
                <Link to="/register" className="btn-primary">
                  Create account <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="hero-grid absolute inset-0 -z-10" />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
              <Fingerprint className="h-3.5 w-3.5" />
              Financial accountability infrastructure
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              We don't just track where donations go.
              <span className="mt-2 block text-emerald-300">We control where they can go.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-slate-400">
              TrustFlow makes charitable donations purpose-restricted. Funds cannot be withdrawn by the organisation,
              only spent through an authorised procurement flow that pays verified vendors directly — with every
              decision recorded.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={user ? "/app" : "/login"} className="btn-primary px-5 py-3">
                Explore the working demo <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="btn-secondary px-5 py-3">
                See the flow
              </a>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Server-side authorization</span>
              <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> Append-only ledger</span>
              <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI advises, policy decides</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-emerald-400/[0.06] blur-2xl" />
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Transaction authorization</p>
                  <p className="mt-1 text-sm font-medium text-white">Flood Relief 2026 · Drinking water</p>
                </div>
                <StatusBadge status="authorised" label="Approved" />
              </div>
              <div className="px-5 py-4">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Request amount</p>
                    <p className="font-mono text-2xl text-white">₹3,000</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Available restricted funds</p>
                    <p className="font-mono text-sm text-emerald-300">₹10,000 → ₹7,000</p>
                  </div>
                </div>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {CHECKS.map((check, index) => (
                    <div key={check} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span className="truncate">{check}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-[11px] leading-relaxed text-emerald-100/80">
                  Approved under policy v1. ₹3,000 reserved from the project's restricted funds. Settlement routes
                  only to the vendor's verified payout reference.
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[10px] uppercase tracking-wider text-slate-500">
                <span>Decision: deterministic engine</span>
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Simulated payment</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="border-y border-white/[0.05] bg-navy-900/40">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="mb-12 max-w-2xl">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">The problem</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">
              Monitoring expenditure after the fact is not accountability.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Donation platforms typically collect money, then ask organisations to upload invoices later. Documents can
              be manipulated, duplicated or fabricated — and even a genuine invoice does not prove goods were delivered.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: ShieldAlert,
                title: "Unrestricted access",
                text: "Once funds land in an organisation's account, the platform has no control over how they are spent.",
              },
              {
                icon: FileSearch,
                title: "Documents are not evidence of delivery",
                text: "An uploaded invoice is paperwork. It does not establish that relief reached a beneficiary.",
              },
              {
                icon: BrainCircuit,
                title: "Decorative AI",
                text: "Chatbots summarising donation reports do not prevent a single rupee of misuse. AI must be a specialised service, not a gimmick.",
              },
            ].map((item) => (
              <div key={item.title} className="panel p-6">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="text-[15px] font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">How it works</p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">
            A purpose-locked procurement flow, end to end.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((step, index) => (
            <div key={step.title} className="panel group relative p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/[0.08] text-emerald-300">
                  <step.icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-xs text-slate-600">0{index + 1}</span>
              </div>
              <h3 className="text-[15px] font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="engine" className="border-y border-white/[0.05] bg-navy-900/40">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">The core</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">
                AI advises. A deterministic engine decides.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Every purchase is evaluated server-side against the approved policy version. The engine is not a prompt:
                it is deterministic code with explicit checks, reasons and an append-only audit trail. No frontend control
                can bypass it.
              </p>
              <div className="mt-6 space-y-3">
                {AI_SERVICES.map((service) => (
                  <div key={service.title} className="flex gap-3">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <p className="text-sm leading-relaxed text-slate-400">
                      <span className="font-medium text-slate-200">{service.title}.</span> {service.desc}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <InfoNote tone="amber">
                  AI output is stored separately with confidence and reviewer state. It can escalate a purchase for human
                  review, but it can never approve, block or move money.
                </InfoNote>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {OUTCOMES.map((outcome) => (
                <div key={outcome.label} className={`rounded-2xl border p-5 ${outcome.color}`}>
                  <div className="flex items-center gap-2">
                    <outcome.icon className="h-4 w-4" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em]">{outcome.label}</span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed opacity-80">{outcome.detail}</p>
                </div>
              ))}
              <div className="panel sm:col-span-2 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Eleven server-side checks</p>
                <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {CHECKS.map((check) => (
                    <div key={check} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <CircleSlash className="h-3 w-3 shrink-0 text-slate-600" />
                      {check}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Hackathon scenario</p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">Flood Relief 2026 · ₹10,000 restricted pool</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Two simulated donations fund one project. Four purchase requests demonstrate every authorization outcome,
              with balances derived from ledger events — not dashboard edits.
            </p>
          </div>
          <Link to="/login" className="btn-primary shrink-0">
            Run the demo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-5 py-3 table-head">Case</th>
                  <th className="px-5 py-3 table-head">Request</th>
                  <th className="px-5 py-3 table-head">Amount</th>
                  <th className="px-5 py-3 table-head">Engine result</th>
                  <th className="px-5 py-3 table-head">Why</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { case: "1", request: "Drinking water", amount: "₹3,000", status: "paid", why: "Verified vendor, approved category, within budget and funding." },
                  { case: "2", request: "Food supplies", amount: "₹2,000", status: "authorised", why: "Approved; funds reserved until settlement." },
                  { case: "3", request: "Personal electronics", amount: "₹2,000", status: "blocked", why: "Outside the approved flood-relief spending policy." },
                  { case: "4", request: "Communications equipment", amount: "₹1,500", status: "review_required", why: "Operational category not established by policy; human decides." },
                ].map((row) => (
                  <tr key={row.case} className="transition-colors hover:bg-white/[0.02]">
                    <td className="table-cell !text-slate-500 font-mono">#{row.case}</td>
                    <td className="table-cell font-medium text-slate-200">{row.request}</td>
                    <td className="table-cell font-mono text-slate-200">{row.amount}</td>
                    <td className="table-cell"><StatusBadge status={row.status} /></td>
                    <td className="table-cell text-xs leading-relaxed text-slate-400">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Demo accounts</p>
            <div className="mt-3 space-y-2 text-xs">
              {[
                ["Admin", "admin@trustflow.demo", "Admin123!"],
                ["Organisation", "org@reliefa.demo", "Demo1234!"],
                ["Donor", "donor@trustflow.demo", "Demo1234!"],
                ["Vendor", "vendor@aqua.demo", "Demo1234!"],
              ].map(([role, email, password]) => (
                <div key={role} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-navy-950/40 px-3 py-2">
                  <span className="w-24 text-slate-500">{role}</span>
                  <span className="font-mono text-[11px] text-slate-300">{email}</span>
                  <span className="font-mono text-[11px] text-slate-500">{password}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">What the demo proves</p>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-400">
              {[
                "Blocked spending stays blocked even if every other condition passes.",
                "Balances derive from donation, reservation, release and payment ledger events.",
                "Duplicate payments are idempotent and cannot double-settle.",
                "Administrators can only approve escalations with recorded notes and audit events.",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] bg-navy-900/50">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-navy-950">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-white">TrustFlow</span>
            </div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-600">Purpose-restricted giving · Prototype</p>
          </div>
          <div className="mt-5 grid gap-3 text-[11px] leading-relaxed text-slate-500 sm:grid-cols-3">
            <p>All donations, restricted balances and vendor settlements in this build are simulated. No real customer funds are held.</p>
            <p>Production purpose-restricted disbursement would require an authorised payment service provider or regulated financial partner.</p>
            <p>No software mechanism alone can guarantee goods reach beneficiaries; independent verification and human review are part of the design.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
