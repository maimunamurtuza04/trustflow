import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FileClock,
  Landmark,
  Loader2,
  ScrollText,
  ShieldAlert,
  Store,
  Users,
} from "lucide-react";
import { useApi } from "../lib/hooks";
import { api } from "../lib/api";
import { formatDate, money } from "../lib/format";
import type { AdminOverview, Organisation, Vendor } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "../components/Layout";
import {
  EmptyState,
  InfoNote,
  LoadingBlock,
  Modal,
  SectionHeading,
  StatCard,
  StatusBadge,
} from "../components/ui";

type VerifyTarget =
  | { kind: "organisation"; record: Organisation }
  | { kind: "vendor"; record: Vendor };

export default function AdminDashboard() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<AdminOverview>("/admin/overview");
  const [approving, setApproving] = useState<number | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<VerifyTarget | null>(null);
  const [verifyAction, setVerifyAction] = useState<"verified" | "rejected" | "suspended">("verified");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [destinationVendor, setDestinationVendor] = useState<Vendor | null>(null);
  const [destinationRef, setDestinationRef] = useState("");
  const [destinationBusy, setDestinationBusy] = useState(false);

  const approvePolicy = async (policyId: number, projectName: string) => {
    setApproving(policyId);
    try {
      await api.post(`/policies/${policyId}/approve`);
      toast.push(`Policy approved for ${projectName}. The previous version was superseded.`, "success");
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to approve policy.", "error");
    } finally {
      setApproving(null);
    }
  };

  const openVerify = (target: VerifyTarget, action: "verified" | "rejected" | "suspended") => {
    setVerifyTarget(target);
    setVerifyAction(action);
    setVerifyNotes("");
  };

  const submitVerification = async () => {
    if (!verifyTarget) return;
    if (verifyAction !== "verified" && verifyNotes.trim().length < 5) {
      toast.push("Add at least a short reason for a rejection or suspension.", "error");
      return;
    }
    setVerifyBusy(true);
    const endpoint =
      verifyTarget.kind === "organisation"
        ? `/admin/organisations/${verifyTarget.record.id}/verify`
        : `/admin/vendors/${verifyTarget.record.id}/verify`;
    try {
      await api.post(endpoint, { verification_status: verifyAction, notes: verifyNotes.trim() || null });
      toast.push(`${verifyTarget.kind === "organisation" ? "Organisation" : "Vendor"} set to ${verifyAction}.`, "success");
      setVerifyTarget(null);
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Verification update failed.", "error");
    } finally {
      setVerifyBusy(false);
    }
  };

  const openDestination = (vendor: Vendor) => {
    setDestinationVendor(vendor);
    setDestinationRef(vendor.payment_destination_ref ?? "");
  };

  const submitDestination = async () => {
    if (!destinationVendor) return;
    setDestinationBusy(true);
    try {
      await api.post(`/admin/vendors/${destinationVendor.id}/payment-destination`, {
        payment_destination_ref: destinationRef.trim(),
        verified: true,
      });
      toast.push("Payout destination verified. The engine will now require this reference on purchases.", "success");
      setDestinationVendor(null);
      reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to update payout destination.", "error");
    } finally {
      setDestinationBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Platform oversight" />
        <div className="panel p-6">
          <LoadingBlock lines={7} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Platform oversight" />
        <EmptyState title="Unable to load administration overview" description={error ?? "Please try again."} />
      </>
    );
  }

  const { stats } = data;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Platform oversight"
        description="Review escalations, approve spending policies, verify organisations and suppliers, and inspect the immutable audit trail."
        actions={
          <Link to="/audit" className="btn-secondary">
            <ScrollText className="h-4 w-4" />
            Audit history
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Review queue"
          value={stats.review_queue}
          hint="Escalated purchases awaiting a human decision"
          icon={ShieldAlert}
          tone={stats.review_queue ? "amber" : "green"}
        />
        <StatCard
          label="Pending policies"
          value={stats.pending_policies}
          hint="New versions cannot take effect until approved"
          icon={FileClock}
          tone={stats.pending_policies ? "amber" : "default"}
        />
        <StatCard
          label="Pending verifications"
          value={stats.pending_organisations + stats.pending_vendors}
          hint={`${stats.pending_organisations} organisations · ${stats.pending_vendors} vendors`}
          icon={ClipboardCheck}
        />
        <StatCard label="Active projects" value={stats.active_projects} hint={`${stats.users} registered users`} icon={Landmark} />
      </div>

      <section className="mt-8">
        <SectionHeading
          eyebrow="Human review"
          title="Escalated purchases"
          description="The deterministic engine could not approve these requests. AI may have raised ambiguity; only an administrator can resolve them, with recorded notes."
        />
        {data.review_queue.length === 0 ? (
          <EmptyState title="No purchases awaiting review" description="Escalated requests will appear here in submission order." />
        ) : (
          <div className="space-y-3">
            {data.review_queue.map((purchase) => (
              <div key={purchase.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/purchases/${purchase.id}`} className="text-sm font-medium text-white hover:text-emerald-200">
                      #{purchase.id} · {purchase.description}
                    </Link>
                    <StatusBadge status={purchase.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {purchase.project.name} · {purchase.vendor.business_name} · {money(purchase.total_amount_minor, purchase.currency)} ·{" "}
                    {formatDate(purchase.created_at)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{purchase.decision?.reason}</p>
                </div>
                <Link to={`/purchases/${purchase.id}`} className="btn-amber shrink-0 px-3 py-2 text-xs">
                  Review request <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <SectionHeading
          eyebrow="Policy governance"
          title="Pending spending policies"
          description="Approving a policy makes the project active and mirrors its budget lines. The previous approved version is superseded, never edited."
        />
        {data.pending_policies.length === 0 ? (
          <EmptyState title="No policies awaiting approval" description="Draft policies submitted by organisations will appear here." />
        ) : (
          <div className="space-y-3">
            {data.pending_policies.map((policy) => (
              <div key={policy.id} className="panel p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">
                        {policy.project.name} <span className="text-slate-500">· v{policy.version}</span>
                      </p>
                      <StatusBadge status="pending" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {policy.approved_categories.map((category) => (
                        <span key={category} className="chip !px-2 !py-0.5 !text-[10px]">{category}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Per-transaction limit {money(policy.per_transaction_limit_minor)} · {policy.budget_lines.length} budget lines ·{" "}
                      {formatDate(policy.created_at)}
                    </p>
                    {policy.notes ? <p className="mt-2 text-xs leading-relaxed text-slate-400">{policy.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link to={`/projects/${policy.project.id}`} className="btn-secondary px-3 py-2 text-xs">
                      Inspect
                    </Link>
                    <button
                      className="btn-primary px-3 py-2 text-xs"
                      onClick={() => approvePolicy(policy.id, policy.project.name)}
                      disabled={approving === policy.id}
                    >
                      {approving === policy.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                      Approve policy
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <section className="panel p-5">
          <SectionHeading
            eyebrow="Organisations"
            title="Verification registry"
            description="Rejecting or suspending an organisation pauses its active projects."
          />
          <div className="divide-y divide-white/[0.05]">
            {data.organisations.map((organisation) => (
              <div key={organisation.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                    <p className="truncate text-sm font-medium text-slate-200">{organisation.name}</p>
                    <StatusBadge status={organisation.verification_status} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {organisation.registration_number} · {organisation.country}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    className="btn-secondary px-2.5 py-1.5 text-[11px]"
                    onClick={() => openVerify({ kind: "organisation", record: organisation }, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    className="btn-ghost px-2.5 py-1.5 text-[11px] text-amber-200 hover:bg-amber-400/10"
                    onClick={() => openVerify({ kind: "organisation", record: organisation }, "suspended")}
                  >
                    Suspend
                  </button>
                  <button
                    className="btn-ghost px-2.5 py-1.5 text-[11px] text-red-200 hover:bg-red-400/10"
                    onClick={() => openVerify({ kind: "organisation", record: organisation }, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <InfoNote>
              Verification is a pre-condition for settlement, not proof that goods will be delivered. Delivery evidence
              is tracked per transaction.
            </InfoNote>
          </div>
        </section>

        <section className="panel p-5">
          <SectionHeading
            eyebrow="Suppliers"
            title="Vendor registry"
            description="Payout references must be verified before the engine will authorise settlement."
          />
          <div className="divide-y divide-white/[0.05]">
            {data.vendors.map((vendor) => (
              <div key={vendor.id} className="py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Store className="h-3.5 w-3.5 text-slate-500" />
                      <p className="truncate text-sm font-medium text-slate-200">{vendor.business_name}</p>
                      <StatusBadge status={vendor.verification_status} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {vendor.registration_number} · {vendor.categories.join(", ") || "No categories"}
                    </p>
                    <p className="mt-1 font-mono text-[11px]">
                      <span className={vendor.payment_destination_verified ? "text-emerald-300" : "text-amber-300"}>
                        {vendor.payment_destination_verified ? "Payout verified" : "Payout unverified"}
                      </span>
                      {vendor.payment_destination_ref ? (
                        <span className="text-slate-500"> · {vendor.payment_destination_ref}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="btn-ghost px-2.5 py-1.5 text-[11px] text-slate-300"
                      onClick={() => openDestination(vendor)}
                    >
                      Payout ref
                    </button>
                    <button
                      className="btn-secondary px-2.5 py-1.5 text-[11px]"
                      onClick={() => openVerify({ kind: "vendor", record: vendor }, "verified")}
                    >
                      Verify
                    </button>
                    <button
                      className="btn-ghost px-2.5 py-1.5 text-[11px] text-red-200 hover:bg-red-400/10"
                      onClick={() => openVerify({ kind: "vendor", record: vendor }, "suspended")}
                    >
                      Suspend
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-8">
        <SectionHeading
          eyebrow="Immutable record"
          title="Recent audit events"
          description="Financial and administrative actions are append-only. Corrections are new events, never overwrites."
          actions={
            <Link to="/audit" className="btn-secondary px-3 py-2 text-xs">
              Full audit history <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-5 py-3 table-head">Action</th>
                  <th className="px-5 py-3 table-head">Entity</th>
                  <th className="px-5 py-3 table-head">Actor</th>
                  <th className="px-5 py-3 table-head">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_audit.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="table-cell font-mono text-xs text-slate-300">{entry.action}</td>
                    <td className="table-cell text-xs text-slate-400">
                      {entry.entity_type}
                      {entry.entity_id ? ` #${entry.entity_id}` : ""}
                    </td>
                    <td className="table-cell text-xs text-slate-400">
                      {entry.actor.full_name} <span className="text-slate-600">({entry.actor.role})</span>
                    </td>
                    <td className="table-cell text-xs text-slate-500">{formatDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(verifyTarget)}
        onClose={() => setVerifyTarget(null)}
        title={
          verifyAction === "verified"
            ? "Verify record"
            : verifyAction === "rejected"
              ? "Reject record"
              : "Suspend record"
        }
        subtitle={
          verifyTarget
            ? verifyTarget.kind === "organisation"
              ? verifyTarget.record.name
              : verifyTarget.record.business_name
            : undefined
        }
        footer={
          <>
            <button className="btn-secondary" onClick={() => setVerifyTarget(null)} disabled={verifyBusy}>
              Cancel
            </button>
            <button
              className={verifyAction === "verified" ? "btn-primary" : "btn-danger"}
              onClick={submitVerification}
              disabled={verifyBusy}
            >
              {verifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Confirm {verifyAction}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-400">
            {verifyAction === "verified"
              ? "The record will be eligible for authorised purchases and settlement. Verification does not guarantee physical delivery."
              : verifyAction === "suspended"
                ? "The record will be blocked from new purchases. Existing active projects for an organisation will be paused."
                : "The record will be rejected and blocked from operating on the platform."}
          </p>
          <div>
            <label className="label" htmlFor="verify-notes">
              Reviewer notes {verifyAction === "verified" ? "(optional)" : "(required)"}
            </label>
            <textarea
              id="verify-notes"
              className="input min-h-[92px] resize-y"
              value={verifyNotes}
              onChange={(event) => setVerifyNotes(event.target.value)}
              placeholder="Document the evidence reviewed and the rationale for this decision."
            />
          </div>
          <InfoNote>This action is written to the append-only audit log with your identity and the previous status.</InfoNote>
        </div>
      </Modal>

      <Modal
        open={Boolean(destinationVendor)}
        onClose={() => setDestinationVendor(null)}
        title="Verify payout destination"
        subtitle={destinationVendor?.business_name}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDestinationVendor(null)} disabled={destinationBusy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submitDestination} disabled={destinationBusy || destinationRef.trim().length < 3}>
              {destinationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Save verified reference
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="destination-ref">
              Verified payout reference
            </label>
            <input
              id="destination-ref"
              className="input font-mono"
              value={destinationRef}
              onChange={(event) => setDestinationRef(event.target.value)}
              placeholder="e.g. INV-AQUA-4417"
            />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            The deterministic engine requires a purchase&rsquo;s payment destination to match this reference exactly.
            Settlement re-checks it immediately before paying.
          </p>
          <InfoNote tone="amber">
            In production this reference would be established through the payment provider&rsquo;s account verification,
            not entered manually. This prototype simulates the registry.
          </InfoNote>
        </div>
      </Modal>
    </>
  );
}
