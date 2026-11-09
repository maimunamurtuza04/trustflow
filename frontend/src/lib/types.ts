export type Role = "donor" | "organisation" | "vendor" | "admin";

export interface Organisation {
  id: number;
  name: string;
  registration_number: string;
  country: string;
  verification_status: string;
  created_at: string;
}

export interface VendorProduct {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  unit_price_minor: number;
  currency: string;
  active: boolean;
}

export interface DeliveryMetrics {
  reported: number;
  confirmed: number;
  disputed: number;
  in_transit: number;
  awaiting_receipt: number;
  reviewed: number;
  performance_percent: number | null;
}

export interface Vendor {
  id: number;
  business_name: string;
  registration_number: string;
  country: string;
  categories: string[];
  verification_status: string;
  payment_destination_verified: boolean;
  payment_destination_ref: string | null;
  delivery_performance: number | null;
  delivery_metrics: DeliveryMetrics | null;
  complaint_count: number;
  products?: VendorProduct[];
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  organisation?: Organisation | null;
  vendor?: Vendor | null;
}

export interface BudgetLine {
  category: string;
  allocated_minor: number;
  committed_minor?: number;
  available_minor?: number;
}

export interface Policy {
  id: number;
  version: number;
  status: string;
  approved_categories: string[];
  per_transaction_limit_minor: number;
  budget_lines: { category: string; allocated_minor: number }[];
  notes?: string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  created_at: string;
}

export interface Financials {
  received_minor: number;
  reserved_minor: number;
  paid_minor: number;
  available_minor: number;
  funding_target_minor: number;
  progress_percent: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  category: string;
  target_beneficiaries: number;
  geographic_coverage: string;
  funding_target_minor: number;
  currency: string;
  starts_on?: string | null;
  ends_on?: string | null;
  status: string;
  verification_status: string;
  operational_requirements?: string | null;
  created_at: string;
  organisation: Organisation;
  financials: Financials;
  policy: Policy | null;
  pending_policy?: Policy | null;
  budgets: BudgetLine[];
  purchase_counts: Record<string, number>;
  donations: {
    count: number;
    confirmed_minor: number;
    records?: Donation[];
    mine?: Donation[];
    note?: string;
  };
  purchases?: Purchase[];
  ledger?: LedgerEvent[];
  policies?: Policy[];
}

export interface LedgerEvent {
  id: number;
  event_type: string;
  amount_minor: number;
  currency: string;
  reference: string;
  description: string;
  created_at: string;
  idempotency_key?: string | null;
}

export interface Check {
  key: string;
  label: string;
  status: "pass" | "fail" | "review" | "pending" | "skipped";
  detail: string;
}

export interface Decision {
  id: number;
  outcome: string;
  reason: string;
  policy_id?: number | null;
  policy_version?: number | null;
  decided_by: string;
  reviewer_id?: number | null;
  created_at: string;
  checks?: Check[];
}

export interface Payment {
  id: number;
  provider: string;
  status: string;
  amount_minor: number;
  currency: string;
  simulated: boolean;
  provider_reference: string;
  created_at: string;
  settled_at?: string | null;
}

export interface Allocation {
  status: string;
  amount_minor: number;
  created_at: string;
  closed_at?: string | null;
}

export interface AIAssessment {
  id: number;
  available: boolean;
  model?: string | null;
  confidence?: number | null;
  detail: string;
  verdict?: string | null;
  reasoning?: string | null;
  signals?: string[];
  explanation?: string | null;
  created_at: string;
}

export interface Evidence {
  id: number;
  evidence_type: string;
  status: string;
  source: string;
  reference?: string | null;
  details?: string | null;
  created_at: string;
  verified_at?: string | null;
}

export interface Purchase {
  id: number;
  category: string;
  description: string;
  quantity: number;
  unit_price_minor: number;
  total_amount_minor: number;
  currency: string;
  quotation_reference: string;
  payment_destination: string;
  status: string;
  created_at: string;
  submitted_at?: string | null;
  paid_at?: string | null;
  project: { id: number; name: string; category: string; status: string };
  organisation: Organisation;
  vendor: Vendor;
  decision: Decision | null;
  allocation?: Allocation | null;
  payment?: Payment | null;
  ai_relevance?: AIAssessment | null;
  ai_explanation?: AIAssessment | null;
  evidence?: Evidence[];
}

export interface Donation {
  id: number;
  amount_minor: number;
  currency: string;
  provider: string;
  payment_reference: string;
  payment_status: string;
  allocation_status: string;
  simulated: boolean;
  created_at: string;
  confirmed_at?: string | null;
  donor?: { id: number; full_name: string } | null;
  project?: { id: number; name: string } | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor: { id: number | null; full_name: string; role: string };
  before: unknown;
  after: unknown;
  created_at: string;
}

export interface DonorOverview {
  donor: { id: number; full_name: string; email: string };
  stats: {
    confirmed_donated_minor: number;
    pledged_minor: number;
    projects_funded: number;
    paid_to_suppliers_minor: number;
    remaining_restricted_minor: number;
  };
  donations: Donation[];
  projects: Project[];
  purchases: Purchase[];
  attribution_note: string;
}

export interface PendingPolicy extends Policy {
  project: { id: number; name: string };
}

export interface OrgOverview {
  organisation: Organisation | null;
  projects: Project[];
  purchases: Purchase[];
  pending_policies: PendingPolicy[];
  stats: {
    received_minor: number;
    available_minor: number;
    reserved_minor: number;
    paid_minor: number;
    active_projects: number;
    review_required: number;
    awaiting_payment: number;
    verified_vendors: number;
  };
}

export interface AdminOverview {
  stats: {
    review_queue: number;
    pending_policies: number;
    pending_organisations: number;
    pending_vendors: number;
    active_projects: number;
    users: number;
  };
  review_queue: Purchase[];
  pending_policies: PendingPolicy[];
  organisations: Organisation[];
  vendors: Vendor[];
  recent_audit: AuditEntry[];
}

export interface VendorOverview {
  vendor: Vendor;
  orders: Purchase[];
  stats: {
    orders_total: number;
    open_orders: number;
    paid_orders: number;
    settled_minor: number;
  };
}

export interface AuditResponse {
  total: number;
  items: AuditEntry[];
  append_only: string;
}

export interface AICallResponse {
  available: boolean;
  detail: string;
  authoritative: boolean;
  verdict?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  explanation?: string | null;
}

export interface RequirementSuggestion {
  category: string;
  explanation?: string;
  estimated_quantity?: string;
  estimated_budget_minor?: number;
  relevance?: string;
  confidence?: number;
  reasoning?: string;
}

export interface RequirementsResponse {
  available: boolean;
  detail: string;
  model?: string | null;
  confidence?: number | null;
  authoritative: boolean;
  disclaimer: string;
  output: {
    summary?: string;
    requirements?: RequirementSuggestion[];
  };
}
