import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  Store,
  Truck,
} from "lucide-react";
import { useApi } from "../lib/hooks";
import { formatDate, money } from "../lib/format";
import type { VendorOverview } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/Layout";
import {
  EmptyState,
  InfoNote,
  LoadingBlock,
  SectionHeading,
  StatCard,
  StatusBadge,
} from "../components/ui";

export default function VendorDashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<VendorOverview>("/vendor/overview");

  if (loading && !data) {
    return (
      <>
        <PageHeader eyebrow="Supplier" title="Supplier console" />
        <div className="panel p-6">
          <LoadingBlock lines={6} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Supplier" title="Supplier console" />
        <EmptyState title="Unable to load supplier console" description={error ?? "Please try again."} />
      </>
    );
  }

  const { vendor, stats } = data;

  return (
    <>
      <PageHeader
        eyebrow="Supplier console"
        title={vendor.business_name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{user?.email}</span>
            <span className="text-slate-600">·</span>
            <StatusBadge status={vendor.verification_status} />
            <span className="text-slate-600">·</span>
            <span className="text-xs">Reg. {vendor.registration_number}</span>
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Requests received" value={stats.orders_total} hint="Purchase requests naming this supplier" icon={ClipboardList} />
        <StatCard label="Open requests" value={stats.open_orders} hint="Authorised, in review or awaiting information" icon={Truck} tone="amber" />
        <StatCard label="Paid orders" value={stats.paid_orders} hint="Simulated settlement completed" icon={PackageCheck} tone="green" />
        <StatCard label="Settled value" value={money(stats.settled_minor)} hint="Paid to your verified payout reference" icon={Banknote} />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <section>
          <SectionHeading
            eyebrow="Fulfilment"
            title="Purchase requests"
            description="Every request naming your business is listed with its engine decision. Only authorised or paid requests can settle — a blocked request is not an order."
          />
          {data.orders.length === 0 ? (
            <EmptyState
              title="No purchase requests yet"
              description="When an organisation submits a purchase request naming your business, it appears here."
            />
          ) : (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-5 py-3 table-head">Request</th>
                      <th className="px-5 py-3 table-head">Project</th>
                      <th className="px-5 py-3 table-head">Quantity</th>
                      <th className="px-5 py-3 table-head">Amount</th>
                      <th className="px-5 py-3 table-head">Status</th>
                      <th className="px-5 py-3 table-head">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => (
                      <tr key={order.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="table-cell">
                          <Link to={`/purchases/${order.id}`} className="link text-sm">
                            #{order.id} · {order.description}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-slate-500">Quote {order.quotation_reference || "—"}</p>
                        </td>
                        <td className="table-cell text-xs text-slate-400">{order.project.name}</td>
                        <td className="table-cell font-mono text-xs text-slate-300">{order.quantity}</td>
                        <td className="table-cell font-mono text-slate-100">{money(order.total_amount_minor, order.currency)}</td>
                        <td className="table-cell"><StatusBadge status={order.status} /></td>
                        <td className="table-cell text-xs text-slate-500">{formatDate(order.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <Store className="h-4 w-4 text-emerald-400" />
              Business profile
            </p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Registration</dt>
                <dd className="font-mono text-slate-300">{vendor.registration_number}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Country</dt>
                <dd className="text-slate-300">{vendor.country}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Delivery performance</dt>
                <dd className="text-slate-300">
                  {vendor.delivery_performance === null
                    ? "No delivery history"
                    : `${Math.round(vendor.delivery_performance)}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Complaints</dt>
                <dd className="text-slate-300">{vendor.complaint_count}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-lg border border-white/[0.05] bg-navy-950/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Settlement destination</p>
              <p className="mt-1.5 font-mono text-xs text-slate-300">{vendor.payment_destination_ref ?? "Not on file"}</p>
              <p className={`mt-1 flex items-center gap-1.5 text-[11px] ${vendor.payment_destination_verified ? "text-emerald-300" : "text-amber-300"}`}>
                {vendor.payment_destination_verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {vendor.payment_destination_verified ? "Verified by platform administration" : "Awaiting verification"}
              </p>
            </div>
          </div>

          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <Boxes className="h-4 w-4 text-emerald-400" />
              Product listings
            </p>
            {vendor.products && vendor.products.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {vendor.products.map((product) => (
                  <li key={product.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-slate-200">{product.name}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{product.category}</p>
                    </div>
                    <span className="font-mono text-xs text-slate-300">{money(product.unit_price_minor, product.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No active listings.</p>
            )}
          </div>

          <InfoNote>
            Settlement in this prototype is simulated. A verified payout reference is required before any payment can be
            authorised — and it is re-checked immediately before settlement.
          </InfoNote>
        </aside>
      </div>

      <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-600">
        <BadgeCheck className="h-3.5 w-3.5" />
        You can only see purchase requests that name your business. Project funds remain restricted to their purpose.
      </div>
    </>
  );
}
