import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Lock, ScrollText } from "lucide-react";
import { useApi } from "../lib/hooks";
import { formatDate } from "../lib/format";
import type { AuditResponse } from "../lib/types";
import { PageHeader } from "../components/Layout";
import { EmptyState, InfoNote, LoadingBlock } from "../components/ui";

const ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "purchase.submitted",
  "purchase.approved",
  "purchase.blocked",
  "purchase.review_required",
  "purchase.pending",
  "purchase.review_approved",
  "purchase.review_rejected",
  "payment.settled",
  "delivery.reported",
  "delivery.confirmed",
  "delivery.disputed",
  "donation.pledged",
  "donation.confirmed",
  "policy.draft_created",
  "policy.approved",
  "policy.superseded",
  "project.created",
  "project.paused",
  "organisation.verified",
  "organisation.verification_updated",
  "vendor.verified",
  "vendor.verification_updated",
  "vendor.payment_destination_verified",
  "vendor.payment_destination_updated",
  "user.activated",
  "user.suspended",
];

const ENTITIES = [
  "purchase_request",
  "payment",
  "donation",
  "project_policy",
  "project",
  "organisation",
  "vendor",
  "user",
  "ai_assessment",
];

const PAGE_SIZE = 50;

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditLog() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (action) params.set("action", action);
    if (entityType) params.set("entity_type", entityType);
    return `/admin/audit?${params.toString()}`;
  }, [action, entityType, offset]);

  const { data, loading, error } = useApi<AuditResponse>(path);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Audit history"
        description="An append-only record of financial and administrative actions. Corrections are new events; historical rows are never edited or deleted."
        actions={
          <span className="chip">
            <Lock className="h-3 w-3" /> Append-only
          </span>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <label className="label" htmlFor="audit-action">Action</label>
          <select
            id="audit-action"
            className="input"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All actions</option>
            {ACTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-60">
          <label className="label" htmlFor="audit-entity">Entity type</label>
          <select
            id="audit-entity"
            className="input"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">All entities</option>
            {ENTITIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 sm:ml-auto sm:pb-2.5">
          <Filter className="h-3.5 w-3.5" />
          {total} event{total === 1 ? "" : "s"}
        </div>
      </div>

      {loading && !data ? (
        <div className="panel p-6">
          <LoadingBlock lines={8} />
        </div>
      ) : error ? (
        <EmptyState title="Unable to load audit history" description={error} />
      ) : items.length === 0 ? (
        <EmptyState title="No audit events match these filters" description="Try clearing the filters." />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-4 py-3 table-head">#</th>
                  <th className="px-4 py-3 table-head">Action</th>
                  <th className="px-4 py-3 table-head">Entity</th>
                  <th className="px-4 py-3 table-head">Actor</th>
                  <th className="px-4 py-3 table-head">Recorded</th>
                  <th className="px-4 py-3 table-head text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const open = expanded === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr className="transition-colors hover:bg-white/[0.02]">
                        <td className="table-cell !py-3 px-4 font-mono text-[11px] text-slate-600">{entry.id}</td>
                        <td className="table-cell !py-3 px-4">
                          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                            {entry.action}
                          </span>
                        </td>
                        <td className="table-cell !py-3 px-4 text-xs text-slate-400">
                          {entry.entity_type}
                          {entry.entity_id ? <span className="font-mono text-slate-600"> #{entry.entity_id}</span> : null}
                        </td>
                        <td className="table-cell !py-3 px-4 text-xs text-slate-400">
                          {entry.actor.full_name}
                          <span className="text-slate-600"> ({entry.actor.role})</span>
                        </td>
                        <td className="table-cell !py-3 px-4 text-xs text-slate-500">{formatDate(entry.created_at)}</td>
                        <td className="table-cell !py-3 px-4 text-right">
                          <button
                            className="btn-ghost px-2 py-1 text-[11px]"
                            onClick={() => setExpanded(open ? null : entry.id)}
                            aria-expanded={open}
                          >
                            {open ? "Hide" : "Inspect"}
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-navy-950/50">
                          <td colSpan={6} className="border-t border-white/[0.05] px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  <ScrollText className="h-3 w-3" /> Before
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-navy-950 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                                  {pretty(entry.before)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">After</p>
                                <pre className="max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-navy-950 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                                  {pretty(entry.after)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page} of {pages} · showing {offset + 1}–{offset + items.length} of {total}
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5">
        <InfoNote>
          {data?.append_only ?? "Audit events are immutable. Corrections are recorded as new events."} Editing a
          policy, reverifying a vendor or reversing a payment creates a new event rather than changing history.
        </InfoNote>
      </div>
    </>
  );
}
