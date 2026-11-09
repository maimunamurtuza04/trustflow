export function money(minor: number, currency = "INR"): string {
  const value = minor / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function compactMoney(minor: number, currency = "INR"): string {
  const value = minor / 100;
  if (Math.abs(value) >= 10_000_000) return `${currency} ${(value / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100_000) return `${currency} ${(value / 100_000).toFixed(2)}L`;
  if (Math.abs(value) >= 1_000) return `${currency} ${(value / 1_000).toFixed(1)}k`;
  return money(minor, currency);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  closed: "Closed",
};

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  authorised: "Authorised",
  paid: "Paid to vendor",
  blocked: "Blocked",
  review_required: "Review required",
  pending_info: "Information needed",
  cancelled: "Cancelled",
};

export function initials(name?: string): string {
  if (!name) return "TF";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
