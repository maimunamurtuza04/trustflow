import { useEffect, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleSlash,
  Clock3,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Check } from "../lib/types";
import { titleCase } from "../lib/format";

const STATUS_STYLES: Record<string, { badge: string; dot: string; label: string }> = {
  active: { badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400", label: "Active" },
  authorised: { badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400", label: "Authorised" },
  approved: { badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400", label: "Approved" },
  paid: { badge: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200", dot: "bg-emerald-300", label: "Paid" },
  settled: { badge: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200", dot: "bg-emerald-300", label: "Settled" },
  verified: { badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400", label: "Verified" },
  confirmed: { badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400", label: "Confirmed" },
  collected: { badge: "border-sky-400/25 bg-sky-400/10 text-sky-200", dot: "bg-sky-400", label: "Collected" },
  reserved: { badge: "border-sky-400/25 bg-sky-400/10 text-sky-200", dot: "bg-sky-400", label: "Reserved" },
  review_required: { badge: "border-amber-400/30 bg-amber-400/10 text-amber-200", dot: "bg-amber-400", label: "Review required" },
  pending: { badge: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-400", label: "Pending" },
  pending_approval: { badge: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-400", label: "Pending approval" },
  pending_info: { badge: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-400", label: "Info needed" },
  pledged: { badge: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-400", label: "Pledged" },
  paused: { badge: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-400", label: "Paused" },
  blocked: { badge: "border-red-400/30 bg-red-400/10 text-red-200", dot: "bg-red-400", label: "Blocked" },
  rejected: { badge: "border-red-400/30 bg-red-400/10 text-red-200", dot: "bg-red-400", label: "Rejected" },
  suspended: { badge: "border-red-400/30 bg-red-400/10 text-red-200", dot: "bg-red-400", label: "Suspended" },
  failed: { badge: "border-red-400/30 bg-red-400/10 text-red-200", dot: "bg-red-400", label: "Failed" },
  draft: { badge: "border-slate-500/25 bg-slate-500/10 text-slate-300", dot: "bg-slate-400", label: "Draft" },
  superseded: { badge: "border-slate-500/25 bg-slate-500/10 text-slate-300", dot: "bg-slate-500", label: "Superseded" },
  skipped: { badge: "border-slate-500/25 bg-slate-500/10 text-slate-400", dot: "bg-slate-500", label: "Skipped" },
};

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  if (!status) return <span className="text-slate-500">—</span>;
  const style = STATUS_STYLES[status] ?? {
    badge: "border-slate-500/25 bg-slate-500/10 text-slate-300",
    dot: "bg-slate-400",
    label: titleCase(status),
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label ?? style.label}
    </span>
  );
}

export function SimulatedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      {compact ? "Sim" : "Simulated"}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-400/20 bg-emerald-400/[0.06]"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-400/[0.05]"
        : tone === "red"
          ? "border-red-400/20 bg-red-400/[0.05]"
          : "";
  return (
    <div className={`panel p-5 ${toneClass}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="stat-value">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "emerald",
  height = "h-2",
}: {
  value: number;
  tone?: "emerald" | "amber" | "red" | "sky";
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    tone === "amber" ? "bg-amber-400" : tone === "red" ? "bg-red-400" : tone === "sky" ? "bg-sky-400" : "bg-emerald-400";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/[0.06] ${height}`}>
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">{eyebrow}</p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close dialog" tabIndex={-1} />
      <div
        className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-navy-850 p-5 shadow-panel animate-slide-up sm:rounded-2xl sm:p-6 ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm leading-relaxed text-slate-400">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="btn-ghost -mr-1 -mt-1 rounded-lg p-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function LoadingBlock({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="h-4 animate-pulse rounded bg-white/[0.06]"
          style={{ width: `${88 - index * 9}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = CircleSlash,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.04] text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const CHECK_ICONS: Record<Check["status"], { icon: LucideIcon; className: string }> = {
  pass: { icon: CheckCircle2, className: "text-emerald-400" },
  fail: { icon: XCircle, className: "text-red-400" },
  review: { icon: AlertCircle, className: "text-amber-400" },
  pending: { icon: Clock3, className: "text-amber-300" },
  skipped: { icon: CircleSlash, className: "text-slate-500" },
};

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ol className="divide-y divide-white/[0.05]">
      {checks.map((check) => {
        const meta = CHECK_ICONS[check.status] ?? CHECK_ICONS.skipped;
        const Icon = meta.icon;
        return (
          <li key={check.key} className="flex gap-3 py-3">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-200">{check.label}</p>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {check.status === "pass" ? "Passed" : titleCase(check.status)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{check.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function InfoNote({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "emerald" }) {
  const classes =
    tone === "amber"
      ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-100/90"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100/90"
        : "border-white/10 bg-white/[0.03] text-slate-400";
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs leading-relaxed ${classes}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Allowed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400" /> Human review
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400" /> Blocked
      </span>
    </div>
  );
}
