import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  LockKeyhole,
  Send,
  Store,
  Truck,
} from "lucide-react";
import { useApi } from "../lib/hooks";
import { api } from "../lib/api";
import { money, titleCase } from "../lib/format";
import type { Project, Purchase, Vendor } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "../components/Layout";
import {
  CheckList,
  EmptyState,
  InfoNote,
  LoadingBlock,
  SectionHeading,
  StatusBadge,
} from "../components/ui";

interface CreateResponse {
  purchase: Purchase;
  ai: { available: boolean; detail: string; verdict: string | null; authoritative: boolean };
}

const FALLBACK_CATEGORIES = [
  "Drinking water",
  "Food supplies",
  "Medical supplies",
  "Shelter materials",
  "Blankets",
  "Transportation",
  "Communications equipment",
  "Education materials",
];

export default function NewPurchase() {
  const { id } = useParams();
  const toast = useToast();
  const projectState = useApi<Project>(id ? `/projects/${id}` : null);
  const vendorState = useApi<Vendor[]>("/vendors");

  const [vendorId, setVendorId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [quotation, setQuotation] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);

  const project = projectState.data;
  const vendors = vendorState.data ?? [];
  const vendor = vendors.find((item) => item.id === vendorId) ?? null;

  useEffect(() => {
    if (vendorId === null && vendors.length > 0) {
      setVendorId(vendors[0].id);
      setDestination(vendors[0].payment_destination_ref ?? "");
    }
  }, [vendors, vendorId]);

  const selectVendor = (next: Vendor) => {
    setVendorId(next.id);
    setProductId(null);
    setDestination(next.payment_destination_ref ?? "");
    setCategory("");
    setDescription("");
    setUnitPrice("");
    setQuotation("");
  };

  const selectProduct = (nextProductId: number) => {
    setProductId(nextProductId);
    const product = vendor?.products?.find((item) => item.id === nextProductId);
    if (!product) return;
    setCategory(product.category);
    setDescription(product.name);
    setUnitPrice(String(product.unit_price_minor / 100));
    setQuantity("1");
  };

  const totalMinor = Math.round(Number(quantity || "0")) * Math.round(Number(unitPrice || "0") * 100);
  const approvedCategories = project?.policy?.approved_categories ?? [];
  const categoryOptions = useMemo(
    () => Array.from(new Set([...approvedCategories, ...FALLBACK_CATEGORIES])),
    [approvedCategories],
  );
  const selectedBudget = project?.budgets.find((line) => line.category.toLowerCase() === category.trim().toLowerCase());

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!project) return;
    if (!vendorId) {
      setError("Select a verified vendor.");
      return;
    }
    if (category.trim().length < 2 || description.trim().length < 3) {
      setError("Provide a category and a description of at least 3 characters.");
      return;
    }
    if (totalMinor <= 0) {
      setError("Quantity and unit price must produce a positive total.");
      return;
    }
    if (!destination.trim()) {
      setError("A payment destination is required. It must match the vendor's verified payout reference.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<CreateResponse>("/purchase-requests", {
        project_id: project.id,
        vendor_id: vendorId,
        category: category.trim(),
        description: description.trim(),
        quantity: Number(quantity),
        unit_price_minor: Math.round(Number(unitPrice) * 100),
        quotation_reference: quotation.trim(),
        payment_destination: destination.trim(),
      });
      setResult(response);
      toast.push(`Engine decision: ${titleCase(response.purchase.decision?.outcome ?? "recorded")}.`, response.purchase.decision?.outcome === "approved" ? "success" : "info");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit the purchase request.");
    } finally {
      setBusy(false);
    }
  };

  if (projectState.loading && !project) {
    return (
      <>
        <PageHeader eyebrow="Procurement" title="New purchase request" />
        <div className="panel p-6">
          <LoadingBlock lines={6} />
        </div>
      </>
    );
  }

  if (projectState.error || !project) {
    return (
      <>
        <PageHeader eyebrow="Procurement" title="New purchase request" />
        <EmptyState title="Unable to load project" description={projectState.error ?? "Project not found."} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${project.category} · ${project.name}`}
        title="Request a purpose-locked purchase"
        description="Compare verified vendors, submit a quotation reference and let the deterministic engine decide. The frontend does not enforce spending policy — the server does."
        actions={
          <Link to={`/projects/${project.id}`} className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back to project
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="panel p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Restricted balance available</p>
          <p className="mt-1.5 font-mono text-lg text-white">{money(project.financials.available_minor, project.currency)}</p>
          <p className="mt-1 text-[11px] text-slate-500">{money(project.financials.reserved_minor, project.currency)} reserved</p>
        </div>
        <div className="panel p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Per-transaction limit</p>
          <p className="mt-1.5 font-mono text-lg text-white">{money(project.policy?.per_transaction_limit_minor ?? 0, project.currency)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Policy v{project.policy?.version ?? "—"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Approved categories</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {approvedCategories.length > 0 ? (
              approvedCategories.map((item) => (
                <span key={item} className="chip !px-2 !py-0.5 !text-[10px]">{item}</span>
              ))
            ) : (
              <span className="text-xs text-amber-300">No approved policy</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-5">
          <div className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Step 1"
              title="Compare verified vendors"
              description="Price alone is not the deciding factor. Review delivery performance and payout verification before selecting."
            />
            {vendorState.loading ? (
              <LoadingBlock lines={4} />
            ) : vendors.length === 0 ? (
              <EmptyState icon={Store} title="No verified vendors" description="An administrator must verify a vendor and its payout destination first." />
            ) : (
              <div className="space-y-2">
                {vendors.map((item) => {
                  const selected = item.id === vendorId;
                  const cheapest =
                    item.products && item.products.length > 0
                      ? Math.min(...item.products.map((product) => product.unit_price_minor))
                      : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectVendor(item)}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        selected
                          ? "border-emerald-400/40 bg-emerald-400/[0.06]"
                          : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-medium text-white">
                            {item.business_name}
                            {selected ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : null}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">{item.categories.join(" · ")}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {item.delivery_performance === null ? "No delivery history" : `${Math.round(item.delivery_performance)}% delivery`}</span>
                            <span>{item.complaint_count} complaint{item.complaint_count === 1 ? "" : "s"}</span>
                            <span className={item.payment_destination_verified ? "text-emerald-300" : "text-amber-300"}>
                              {item.payment_destination_verified ? "Payout verified" : "Payout unverified"}
                            </span>
                          </p>
                        </div>
                        {cheapest !== null ? (
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">From</p>
                            <p className="font-mono text-xs text-slate-200">{money(cheapest, "INR")}</p>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
                <p className="text-[10px] text-slate-600">
                  Lowest price is displayed for comparison only. It is never auto-selected as the best vendor.
                </p>
              </div>
            )}
          </div>

          <div className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Step 2"
              title="Purchase details"
              description="The quotation reference and payment destination are checked by the engine, not just by this form."
            />
            {vendor?.products && vendor.products.length > 0 ? (
              <div className="mb-4">
                <label className="label" htmlFor="product">Product listing (optional)</label>
                <select
                  id="product"
                  className="input"
                  value={productId ?? ""}
                  onChange={(event) => selectProduct(Number(event.target.value))}
                >
                  <option value="">Enter a custom requirement</option>
                  {vendor.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {money(product.unit_price_minor, product.currency)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="category">Product or service category</label>
                <input
                  id="category"
                  className="input"
                  list="category-options"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Drinking water"
                />
                <datalist id="category-options">
                  {categoryOptions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                {category ? (
                  selectedBudget ? (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Budget line: {money(selectedBudget.available_minor ?? 0, project.currency)} remaining of{" "}
                      {money(selectedBudget.allocated_minor, project.currency)}
                    </p>
                  ) : approvedCategories.length > 0 ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      This category is outside the approved policy. Submission will be blocked by the engine.
                    </p>
                  ) : null
                ) : null}
              </div>

              <div>
                <label className="label" htmlFor="description">Description</label>
                <input
                  id="description"
                  className="input"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="20 litre drinking water packs for 300 people"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="quantity">Quantity</label>
                  <input
                    id="quantity"
                    className="input font-mono"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="unitPrice">Unit price (INR)</label>
                  <input
                    id="unitPrice"
                    className="input font-mono"
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value.replace(/[^0-9.]/g, ""))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-navy-950/50 px-3 py-2.5">
                <span className="text-xs text-slate-400">Total requested</span>
                <span className="font-mono text-sm text-white">{money(totalMinor, project.currency)}</span>
              </div>

              <div>
                <label className="label" htmlFor="quotation">Quotation reference</label>
                <input
                  id="quotation"
                  className="input font-mono"
                  value={quotation}
                  onChange={(event) => setQuotation(event.target.value)}
                  placeholder={`Q-${vendor?.id ?? "V"}-${new Date().getFullYear()}-001`}
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Quotations are stored and cross-checked. A reused reference is flagged by the engine.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="destination">Payment destination</label>
                <input
                  id="destination"
                  className="input font-mono"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Vendor's verified payout reference"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Must match the vendor&rsquo;s verified payout reference exactly. Settlement re-checks it before paying.
                </p>
              </div>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2 text-xs leading-relaxed text-red-200">{error}</p>
            ) : null}

            <button className="btn-primary mt-5 w-full" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit for deterministic authorization
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-600">
              The engine runs on the server. Disabling frontend validation cannot bypass it.
            </p>
          </div>
        </section>

        <aside className="space-y-5">
          {result ? (
            <section className="panel p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Engine outcome</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {result.purchase.decision ? titleCase(result.purchase.decision.outcome) : "Pending"}
                  </p>
                </div>
                <StatusBadge status={result.purchase.status} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{result.purchase.decision?.reason}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                Decided by {result.purchase.decision?.decided_by ?? "engine"} · policy v
                {result.purchase.decision?.policy_version ?? "—"}
              </p>
              {result.purchase.decision?.checks ? (
                <div className="mt-4">
                  <CheckList checks={result.purchase.decision.checks} />
                </div>
              ) : null}
              <div className="mt-4 rounded-lg border border-white/[0.06] bg-navy-950/40 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <BrainCircuit className="h-3.5 w-3.5" /> AI advisory
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {result.ai.available
                    ? `Verdict: ${titleCase(result.ai.verdict ?? "unknown")}. Advisory only — it cannot approve or block.`
                    : result.ai.detail}
                </p>
              </div>
              <Link to={`/purchases/${result.purchase.id}`} className="btn-secondary mt-4 w-full">
                Open purchase record <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                className="btn-ghost mt-2 w-full text-xs"
                onClick={() => {
                  setResult(null);
                  setDescription("");
                  setQuotation("");
                  setProductId(null);
                }}
              >
                Prepare another request
              </button>
            </section>
          ) : (
            <section className="panel p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <LockKeyhole className="h-4 w-4 text-emerald-400" />
                What the engine checks
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
                {[
                  "Approved policy version and active project",
                  "Verified organisation and vendor",
                  "Category permitted by the policy",
                  "Contextual relevance (AI can escalate, never approve)",
                  "Category budget and restricted funds",
                  "Payout destination matches the vendor record",
                  "No duplicate purchase or reused quotation",
                  "No unusual velocity or splitting pattern",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <CircleDollarSign className="h-4 w-4 text-emerald-400" />
              Selected vendor
            </p>
            {vendor ? (
              <>
                <p className="mt-2 text-sm text-slate-200">{vendor.business_name}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  Payout: {vendor.payment_destination_ref ?? "not on file"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={vendor.verification_status} />
                  {vendor.payment_destination_verified ? (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-300">Payout verified</span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-amber-300">Payout unverified</span>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No vendor selected.</p>
            )}
          </div>

          <InfoNote tone="amber">
            This prototype simulates payment. No real money moves. Approved funds are reserved until simulated
            settlement, then paid to the vendor reference.
          </InfoNote>
        </aside>
      </div>
    </>
  );
}
