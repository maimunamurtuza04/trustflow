import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { Donation, Project } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { InfoNote, Modal, SimulatedBadge } from "./ui";

const PRESETS = [50000, 100000, 250000, 500000];

interface CreateResponse {
  donation: Donation;
  checkout: { note: string };
}

interface ConfirmResponse {
  donation: Donation;
  simulated: boolean;
  idempotent?: boolean;
}

export function DonateModal({
  project,
  open,
  onClose,
  onComplete,
}: {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("1000");
  const [donation, setDonation] = useState<Donation | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDonation(null);
      setKey(null);
      setError(null);
      setBusy(false);
      setAmount("1000");
    }
  }, [open]);

  if (!project) return null;

  const amountMinor = Math.round(Number(amount || "0") * 100);

  const pledge = async () => {
    setError(null);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError("Enter a donation amount greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<CreateResponse>("/donations", {
        project_id: project.id,
        amount_minor: amountMinor,
        currency: project.currency,
      });
      setDonation(result.donation);
      setKey(crypto.randomUUID());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the donation.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!donation || !key) return;
    setError(null);
    setBusy(true);
    try {
      await api.post<ConfirmResponse>(`/donations/${donation.id}/confirm`, { idempotency_key: key });
      toast.push(
        `${money(donation.amount_minor, donation.currency)} added to ${project.name}'s restricted balance (simulated).`,
        "success",
      );
      onComplete?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm the simulated payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={donation ? "Simulated checkout" : "Fund this project"}
      subtitle={project.name}
      footer={
        donation ? (
          <>
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Confirm simulated payment
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={pledge} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue to simulated checkout
              {!busy ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </>
        )
      }
    >
      {donation ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">Checkout</p>
              <SimulatedBadge />
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Amount</dt>
                <dd className="font-mono text-white">{money(donation.amount_minor, donation.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Reference</dt>
                <dd className="font-mono text-xs text-slate-300">{donation.payment_reference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Status</dt>
                <dd className="text-amber-200">Pledged — awaiting confirmation</dd>
              </div>
            </dl>
          </div>
          <InfoNote tone="amber">
            This is a simulated payment. No real money moves, and no card or bank details are collected. Confirming
            records a ledger event and increases the project&rsquo;s restricted balance in this prototype only.
          </InfoNote>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="donation-amount">
              Amount ({project.currency})
            </label>
            <input
              id="donation-amount"
              className="input font-mono"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="1000"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset / 100))}
                  className="chip transition-colors hover:border-emerald-400/30 hover:text-emerald-200"
                >
                  {money(preset, project.currency)}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400">
            <p className="flex items-center gap-2 font-medium text-slate-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Purpose-restricted contribution
            </p>
            <p className="mt-2">
              Your donation is added to this project&rsquo;s restricted balance. The organisation cannot withdraw it —
              spending is only possible through purchases authorised against the approved policy and paid directly to
              verified vendors.
            </p>
          </div>
          <InfoNote tone="amber">
            Donations are simulated in this prototype. Restricted balances are bookkeeping entries, not held customer
            funds.
          </InfoNote>
        </div>
      )}
      {error ? (
        <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}
    </Modal>
  );
}
