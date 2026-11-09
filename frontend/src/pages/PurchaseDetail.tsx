import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  LockKeyhole,
  PackageCheck,
  ScrollText,
  ShieldAlert,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import { useApi } from "../lib/hooks";
import { ApiError, api } from "../lib/api";
import { formatDate, money, titleCase } from "../lib/format";
import type { AICallResponse, Check, Purchase } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "../components/Layout";
import {
  CheckList,
  EmptyState,
  InfoNote,
  LoadingBlock,
  SectionHeading,
  SimulatedBadge,
  StatusBadge,
} from "../components/ui";

interface ReviewErrorPayload {
  message?: string;
  checks?: Check[];
}

function parseReviewError(error: unknown): { message: string; checks: Check[] } {
  if (error instanceof ApiError) {
    const detail = (error.payload as { detail?: unknown })?.detail;
    if (detail && typeof detail === "object") {
      const typed = detail as ReviewErrorPayload;
      return { message: typed.message ?? error.message, checks: typed.checks ?? [] };
    }
  }
  return { message: error instanceof Error ? error.message : "Unable to review this request.", checks: [] };
}

export default function PurchaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<Purchase>(id ? `/purchase-requests/${id}` : null);
  const [notes, setNotes] = useState("");
  const [reviewBusy, setReviewBusy] = useState<"approve" | "reject" | null>(null);
  const [reviewError, setReviewError] = useState<{ message: string; checks: Check[] } | null>(null);
  const [payKey, setPayKey] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<"relevance" | "explanation" | null>(null);

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Purchase request" title="Loading record" />
        <div className="panel p-6">
          <LoadingBlock lines={7} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Purchase request" title="Record unavailable" />
        <EmptyState
          title="Unable to open this purchase request"
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

  const isAdmin = user?.role === "admin";
  const isOrgOwner = user?.role === "organisation" && user.organisation?.id === data.organisation?.id;
  const canReview = isAdmin && data.status === "review_required";
  const canPay = data.status === "authorised" && (isAdmin || isOrgOwner);
  const canUseAi = isAdmin || isOrgOwner;
  const decision = data.decision;
  const evidence = data.evidence ?? [];

  const review = async (choice: "approve" | "reject") => {
    setReviewError(null);
    if (notes.trim().length < 10) {
      setReviewError({ message: "Reviewer notes must be at least 10 characters.", checks: [] });
      return;
    }
    setReviewBusy(choice);
    try {
      await api.post(`/purchase-requests/${data.id}/review`, { decision: choice, notes: notes.trim() });
      toast.push(choice === "approve" ? "Request authorised as a logged exception." : "Request rejected; funds remain unspent.", choice === "approve" ? "success" : "info");
      setNotes("");
      reload();
    } catch (err) {
      setReviewError(parseReviewError(err));
    } finally {
      setReviewBusy(null);
    }
  };

  const pay = async () => {
    const key = payKey ?? crypto.randomUUID();
    setPayKey(key);
    setPayBusy(true);
    try {
      await api.post(`/purchase-requests/${data.id}/pay`, { idempotency_key: key });
      toast.push("Simulated payment settled to the vendor's verified destination.", "success");
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Settlement failed.", "error");
    } finally {
      setPayBusy(false);
    }
  };

  const runAi = async (kind: "relevance" | "explanation") => {
    setAiBusy(kind);
    try {
      const path =
        kind === "relevance"
          ? `/purchase-requests/${data.id}/ai-assessment`
          : `/purchase-requests/${data.id}/ai-explanation`;
      const result = await api.post<AICallResponse>(path);
      toast.push(result.available ? "AI output stored for review. It did not change the decision." : "AI is unavailable. No output was generated.", result.available ? "success" : "info");
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "AI request failed.", "error");
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={`Purchase request #${data.id} · ${data.project.name}`}
        title={data.description}
        description={`${data.category} · ${data.quantity} × ${money(data.unit_price_minor, data.currency)} · submitted ${formatDate(data.submitted_at ?? data.created_at)}`}
        actions={
          <Link to={`/projects/${data.project.id}`} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Project
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        {decision ? <span className="chip">Decision: {titleCase(decision.outcome)}</span> : null}
        {decision?.policy_version ? <span className="chip">Policy v{decision.policy_version}</span> : null}
        {data.quotation_reference ? <span className="chip font-mono">Quote {data.quotation_reference}</span> : null}
        {data.payment?.simulated ? <SimulatedBadge /> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Deterministic engine"
              title="Authorization decision"
              description="Every check runs server-side against the approved policy version. The outcome and reason below are stored on the record."
            />
            {decision ? (
              <>
                <div
                  className={`rounded-xl border p-4 ${
                    decision.outcome === "approved"
                      ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                      : decision.outcome === "blocked"
                        ? "border-red-400/25 bg-red-400/[0.06]"
                        : "border-amber-400/25 bg-amber-400/[0.06]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {decision.outcome === "approved" ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    ) : decision.outcome === "blocked" ? (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">{titleCase(decision.outcome)}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{decision.reason}</p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Decided by {decision.decided_by === "reviewer" ? "administrator review" : "the deterministic engine"} ·{" "}
                        {formatDate(decision.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
                {decision.checks && decision.checks.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {decision.checks.length} checks
                    </p>
                    <CheckList checks={decision.checks} />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">This reviewer rejection recorded a decision without re-running checks.</p>
                )}
              </>
            ) : (
              <EmptyState title="No decision recorded" description="This request has not been evaluated by the engine." />
            )}
          </section>

          {canReview ? (
            <section className="panel p-5 sm:p-6">
              <SectionHeading
                eyebrow="Human review"
                title="Resolve this escalation"
                description="Approval is a logged policy exception, not an override of hard checks. Funding, vendor, destination, duplicate and policy prerequisites are re-validated."
              />
              <div>
                <label className="label" htmlFor="review-notes">Reviewer notes (required, minimum 10 characters)</label>
                <textarea
                  id="review-notes"
                  className="input min-h-[100px] resize-y"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Describe the evidence reviewed, why this operational expense is necessary for the project, and any follow-up required."
                />
              </div>
              {reviewError ? (
                <div className="mt-3 rounded-lg border border-red-400/25 bg-red-400/[0.07] p-3">
                  <p className="text-xs leading-relaxed text-red-200">{reviewError.message}</p>
                  {reviewError.checks.length > 0 ? (
                    <div className="mt-2">
                      <CheckList checks={reviewError.checks} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button className="btn-primary flex-1" onClick={() => review("approve")} disabled={reviewBusy !== null}>
                  {reviewBusy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Approve exception & reserve funds
                </button>
                <button className="btn-danger flex-1" onClick={() => review("reject")} disabled={reviewBusy !== null}>
                  {reviewBusy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject request
                </button>
              </div>
              <div className="mt-3">
                <InfoNote tone="amber">
                  Approval is audited with your identity and notes. It cannot bypass restricted funds, vendor
                  verification, payout destination or duplicate checks.
                </InfoNote>
              </div>
            </section>
          ) : null}

          <section className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Advisory layer"
              title="AI assessments"
              description="AI output is stored separately and can never authorise, block or move money. It may only escalate ambiguity to a human."
            />
            <div className="space-y-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <BrainCircuit className="h-3.5 w-3.5" /> Purchase relevance
                  </p>
                  {canUseAi ? (
                    <button
                      className="btn-ghost px-2 py-1 text-[11px]"
                      onClick={() => runAi("relevance")}
                      disabled={aiBusy !== null}
                    >
                      {aiBusy === "relevance" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {data.ai_relevance ? "Re-run" : "Run"}
                    </button>
                  ) : null}
                </div>
                {data.ai_relevance ? (
                  <div className="mt-2.5">
                    {data.ai_relevance.available ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip">{titleCase(data.ai_relevance.verdict ?? "no verdict")}</span>
                          {typeof data.ai_relevance.confidence === "number" ? (
                            <span className="text-[11px] text-slate-500">
                              {Math.round(data.ai_relevance.confidence * 100)}% confidence
                            </span>
                          ) : null}
                          <span className="text-[10px] uppercase tracking-wider text-amber-300/70">advisory only</span>
                        </div>
                        {data.ai_relevance.reasoning ? (
                          <p className="mt-2 text-xs leading-relaxed text-slate-400">{data.ai_relevance.reasoning}</p>
                        ) : null}
                        {data.ai_relevance.signals && data.ai_relevance.signals.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {data.ai_relevance.signals.map((signal) => (
                              <span key={signal} className="chip !px-2 !py-0.5 !text-[10px]">{signal}</span>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-2 text-xs leading-relaxed text-amber-100/80">{data.ai_relevance.detail}</p>
                    )}
                    <p className="mt-2 text-[10px] text-slate-600">
                      Stored {formatDate(data.ai_relevance.created_at)} · model {data.ai_relevance.model ?? "none"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No relevance assessment stored.</p>
                )}
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <FileText className="h-3.5 w-3.5" /> Decision explanation
                  </p>
                  {canUseAi ? (
                    <button
                      className="btn-ghost px-2 py-1 text-[11px]"
                      onClick={() => runAi("explanation")}
                      disabled={aiBusy !== null}
                    >
                      {aiBusy === "explanation" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {data.ai_explanation ? "Regenerate" : "Generate"}
                    </button>
                  ) : null}
                </div>
                {data.ai_explanation ? (
                  data.ai_explanation.available ? (
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">{data.ai_explanation.explanation}</p>
                  ) : (
                    <p className="mt-2 text-xs leading-relaxed text-amber-100/80">{data.ai_explanation.detail}</p>
                  )
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Explanations are generated only on request and never modified by the model.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Evidence"
              title="Payment and delivery records"
              description="Payment confirmation is not delivery proof. A payment record attaches automatically at settlement; delivery evidence is not inferred from it."
            />
            {evidence.length === 0 ? (
              <EmptyState
                title="No evidence recorded"
                description="Payment confirmation attaches automatically at settlement. Delivery evidence is not inferred from a payment or invoice."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-white/[0.08] pl-5">
                {evidence.map((record) => (
                  <li key={record.id} className="relative">
                    <span className="absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-navy-900 bg-slate-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-200">{titleCase(record.evidence_type)}</p>
                      <StatusBadge status={record.status} />
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">{record.source}</span>
                    </div>
                    {record.reference ? <p className="mt-1 font-mono text-[11px] text-slate-400">{record.reference}</p> : null}
                    {record.details ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{record.details}</p> : null}
                    <p className="mt-1 text-[10px] text-slate-600">Recorded {formatDate(record.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-wider text-slate-500">
              <span className="flex items-center gap-1"><Banknote className="h-3 w-3 text-emerald-400" /> Payment confirmed</span>
              <span className="flex items-center gap-1"><Store className="h-3 w-3 text-slate-500" /> Supplier confirmed</span>
              <span className="flex items-center gap-1"><Truck className="h-3 w-3 text-slate-500" /> Dispatched</span>
              <span className="flex items-center gap-1"><PackageCheck className="h-3 w-3 text-slate-500" /> Delivery acknowledged</span>
            </div>
            <div className="mt-3">
              <InfoNote>
                Invoice or quotation uploads are not treated as proof of delivery. Independent acknowledgement is
                required before a transaction is described as delivered.
              </InfoNote>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Financial summary</p>
            <p className="mt-2 font-mono text-2xl text-white">{money(data.total_amount_minor, data.currency)}</p>
            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Quantity × unit price</dt>
                <dd className="font-mono text-slate-300">
                  {data.quantity} × {money(data.unit_price_minor, data.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Quotation</dt>
                <dd className="font-mono text-slate-300">{data.quotation_reference || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Allocation</dt>
                <dd><StatusBadge status={data.allocation?.status ?? "none"} /></dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Payment</dt>
                <dd><StatusBadge status={data.payment?.status ?? "unpaid"} /></dd>
              </div>
            </dl>

            {data.payment ? (
              <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">Simulated settlement</p>
                  <SimulatedBadge compact />
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-emerald-100/80">{data.payment.provider_reference}</p>
                <p className="mt-1 text-[10px] text-emerald-100/60">
                  {money(data.payment.amount_minor, data.payment.currency)} · {formatDate(data.payment.settled_at)}
                </p>
              </div>
            ) : null}

            {canPay ? (
              <div className="mt-4">
                <button className="btn-primary w-full" onClick={pay} disabled={payBusy}>
                  {payBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Settle {money(data.total_amount_minor, data.currency)} (simulated)
                </button>
                <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-600">
                  Idempotent: repeated clicks or retries cannot double-settle this request.
                </p>
              </div>
            ) : null}

            {data.status === "blocked" ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.06] p-3 text-[11px] leading-relaxed text-red-100/80">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No funds were reserved. This request cannot be paid in its current form.
              </div>
            ) : null}

            {data.status === "review_required" ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] leading-relaxed text-amber-100/80">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No funds are reserved while a request is under review. Approval reserves them atomically.
              </div>
            ) : null}
          </section>

          <section className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <Store className="h-4 w-4 text-emerald-400" />
              Vendor
            </p>
            <p className="mt-2 text-sm text-slate-200">{data.vendor.business_name}</p>
            <p className="mt-1 text-[11px] text-slate-500">{data.vendor.registration_number} · {data.vendor.country}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={data.vendor.verification_status} />
              <span className={`text-[10px] uppercase tracking-wider ${data.vendor.payment_destination_verified ? "text-emerald-300" : "text-amber-300"}`}>
                {data.vendor.payment_destination_verified ? "payout verified" : "payout unverified"}
              </span>
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.05] bg-navy-950/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Payment destination</p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-300">{data.payment_destination || "—"}</p>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
              Delivery performance{" "}
              {data.vendor.delivery_performance === null
                ? "not yet rated"
                : `${Math.round(data.vendor.delivery_performance)}%`}{" "}
              · {data.vendor.complaint_count} complaint
              {data.vendor.complaint_count === 1 ? "" : "s"}
            </p>
          </section>

          <section className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <BadgeCheck className="h-4 w-4 text-emerald-400" />
              Organisation & project
            </p>
            <p className="mt-2 text-sm text-slate-200">{data.organisation?.name}</p>
            <p className="mt-1 text-[11px] text-slate-500">{data.organisation?.registration_number}</p>
            <div className="mt-2"><StatusBadge status={data.organisation?.verification_status} /></div>
            <Link to={`/projects/${data.project.id}`} className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-xs text-slate-300 hover:border-white/15">
              <span className="truncate">{data.project.name}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </section>

          <div className="panel p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <ScrollText className="h-3.5 w-3.5" /> Audit
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Submission, engine decision, review, reservation and settlement each create append-only audit events.
              Administrators can inspect them in the audit history.
            </p>
          </div>

          <InfoNote tone="amber">
            Payment is simulated. The organisation does not hold the cash and cannot redirect settlement away from
            the vendor&rsquo;s verified payment destination.
          </InfoNote>
        </aside>
      </div>
    </>
  );
}
