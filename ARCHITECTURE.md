# TrustFlow architecture

This document describes the security and financial model implemented in this repository. It is a hackathon prototype; the simulation boundary is stated explicitly at the end.

## 1. Design principle

Donor money is never held as an unrestricted organisation balance. It enters a project-specific restricted pool and can leave only through a purchase request that passes the deterministic authorization engine and settles directly to a verified vendor payout reference.

Three invariants drive the design:

1. **No withdrawal path exists.** There is no API that transfers restricted funds to an organisation.
2. **Policy is code, not a prompt.** AI output is stored and displayed as advisory; it cannot change an authorization outcome.
3. **Balances and decisions are derived from append-only records.** Ledger rows, authorizations and audit events are never edited or deleted.

## 2. Components

```
React SPA ──HTTP/JSON──▶ FastAPI routers
                          ├── auth / RBAC (JWT, rate limiting)
                          ├── projects & policy versions
                          ├── donations (pledge → confirm)
                          ├── purchase requests (engine + review + settle)
                          ├── dashboards (role-scoped projections)
                          ├── admin (verification, review, audit)
                          └── AI (advisory, fail-closed)
                                   │
                              SQLAlchemy ── SQLite / Postgres
```

Backend modules:

| Path | Responsibility |
| --- | --- |
| `app/api/*` | HTTP endpoints, role guards, request validation |
| `app/services/authorization.py` | 11-check deterministic engine, reservations, reviewer decisions |
| `app/services/ledger.py` | append-only financial events and balance derivation |
| `app/services/payments.py` | idempotent simulated settlement |
| `app/services/ai.py` | OpenAI-compatible adapter, schema validation, honest fallback |
| `app/services/audit.py` | append-only audit writer |
| `app/services/ratelimit.py` | login throttling |
| `app/security.py` | bcrypt hashing, JWT issue/verify |
| `app/serializers.py` | role-appropriate API projections |

## 3. Data model

Core entities (see `app/models.py`):

- **User** — role `donor | organisation | vendor | admin`, hashed password, active flag. An organisation user owns exactly one `Organisation`; a vendor user owns exactly one `Vendor`.
- **Organisation / Vendor** — verification status and admin-controlled verification records. Vendors additionally hold a payout reference and verification flag. Verification is a precondition, not proof of delivery.
- **Project** — owned by an organisation, has a funding target, status (`pending_approval | active | paused | completed`) and an approved policy version.
- **ProjectPolicy** — versioned spending policy: approved category list, per-transaction limit, draft/approved status, approver and timestamps. Approved rows are immutable; a change creates a new version that supersedes the previous one.
- **ProjectBudget** — mirrored category allocation for reporting, recreated from the approved policy and committed spend.
- **Donation** — donor pledge, simulated provider reference, confirmation state.
- **LedgerEvent** — the source of financial truth: `DONATION_CONFIRMED`, `FUNDS_RESERVED`, `RESERVATION_RELEASED`, `PAYMENT_MADE`, each carrying a signed amount.
- **FundAllocation** — binds a purchase to a reserved amount and tracks `reserved → settled | released`.
- **Quotation** — supplier quotation reference; uniqueness is part of duplicate detection.
- **PurchaseRequest** — project, organisation, vendor, category, amount and engine status (`authorised | blocked | review_required | pending_info | paid | rejected`).
- **TransactionAuthorization** — the persisted engine outcome, reason, check list and policy version.
- **Payment** — simulated settlement record with provider reference, plus `PaymentEvent`.
- **ReviewDecision** — human resolution of a review-required request, with notes and reviewer.
- **EvidenceRecord / DeliveryConfirmation** — evidence attached to a transaction. Payment confirmation is created automatically at settlement. Delivery is a separate state machine (`in_transit → delivered → confirmed | disputed`) recording dispatch reference, times, quantities and receipt notes. Each transition appends an evidence record; records are never deleted.
- **AnomalyFlag** — duplicate, velocity and splitting signals.
- **AIAssessment** — advisory output stored separately with confidence and availability, never consumed as an authorization rule.
- **AuditEvent** — append-only record of every state change, with actor, entity, before/after snapshots and IP.

## 4. Financial flow

### Donation

1. Donor posts an amount against an active project → `Donation(pledged)` with a simulated donation reference.
2. Confirmation is idempotent by key; a reused key is rejected.
3. On confirm: `DONATION_CONFIRMED` ledger event (+amount), donation marked confirmed, audit event.
4. Project financials are always computed from ledger sums, not stored counters:
   - `received = Σ DONATION_CONFIRMED`
   - `paid = −Σ PAYMENT_MADE`
   - `reserved = −Σ FUNDS_RESERVED + Σ RESERVATION_RELEASED`
   - `available = received − paid − reserved`

### Purchase submission

1. Organisation submits project, vendor, category, description, amount, quotation reference and payout destination.
2. Optional AI relevance assessment runs; its output is stored separately.
3. The engine evaluates all eleven checks and persists `TransactionAuthorization`.
4. `approved` → `FUNDS_RESERVED` ledger event + `FundAllocation(reserved)`; status `authorised`.
5. `blocked`, `review_required`, `pending_info` → no funds move.

### Settlement

1. Organisation owner or admin triggers payment for an `authorised` request.
2. Settlement is idempotent by key and by purchase: a second attempt returns the existing payment.
3. Immediately before paying, vendor verification and payout-destination match are re-checked.
4. `RESERVATION_RELEASED` and `PAYMENT_MADE` ledger events are written, the allocation is settled, the purchase becomes `paid`, a `SIMPAY-…` payment and payment-confirmation evidence are created, and audit rows are appended.

### Delivery and receipt

A paid transaction is not a delivered transaction.

1. The vendor that owns the request reports dispatch (`in_transit`) or delivery (`delivered`) with a dispatch reference and timestamps. Only settled purchases are eligible, and quantity cannot exceed the ordered quantity.
2. The owning organisation records receipt as `confirmed` or `disputed`, with the quantity received. A dispute requires notes of at least 10 characters. Receipt decisions are terminal for this prototype.
3. Every transition appends an `EvidenceRecord` (`delivery_report` / `dispatch_report`, then `receipt_confirmation` or `receipt_dispute`) and an audit event containing the before/after delivery state.
4. Vendor delivery performance is computed live from receipt outcomes: `confirmed / (confirmed + disputed) * 100`, or `null` when nothing has been reviewed. In-transit and awaiting-receipt deliveries are reported separately and do not affect the score.

### Human review

- A reviewer may only act on `review_required` requests.
- The engine is re-run at decision time. Any hard-check failure returns HTTP 409 with the failing checks; the decision is not recorded.
- Approval is recorded as a logged exception with mandatory notes and a `purchase.review_approved` audit event; rejection releases nothing because nothing was reserved.

## 5. Authorization engine

`app/services/authorization.py` evaluates, in order:

| Check | Failure behaviour |
| --- | --- |
| `spending_policy` | pending — no approved policy |
| `project_active` | hard fail |
| `organisation_authorised` | hard fail (ownership + verification) |
| `vendor_verified` | hard fail |
| `category_permitted` | fail, or `review` for operational categories |
| `purchase_relevance` | advisory signal only; never a hard block |
| `category_budget` | fail when committed spend would exceed allocation |
| `restricted_funding` | hard fail when available funds are insufficient |
| `payment_destination` | hard fail on mismatch with verified vendor reference |
| `duplicate_purchase` | hard fail for duplicate purchase/quotation within 24h |
| `transaction_patterns` | review/fail for velocity and split-purchase patterns |

Outcome precedence: any hard failure → `blocked`; any review signal → `review_required`; missing inputs → `pending`; otherwise `approved`. The full check list is persisted and shown in the UI.

## 6. Roles and visibility

| Role | Can do | Cannot do |
| --- | --- | --- |
| Donor | Browse active projects, donate (simulated), see own donations and authorised/paid purchases of funded projects | See ledgers, drafts, blocked requests, other donors |
| Organisation | Create projects/policy drafts, submit purchases, settle authorised purchases, confirm or dispute receipt, see own ledgers and donations | Withdraw funds, approve own policy, review its own escalations, record receipt for another organisation |
| Vendor | See requests naming its business, report dispatch/delivery on settled requests, settlement destination, product listings | See other vendors, project ledgers, donor data |
| Admin | Approve policies, verify organisations/vendors/payout refs, decide escalations, read audit history | Edit or delete financial/audit records |

All filtering is enforced in API queries, not only in the SPA.

## 7. AI boundary

- AI is called only from the backend; keys never reach the browser.
- Four advisory services: purchase relevance, authorization explanation, project requirements, anomaly interpretation (the last is represented by engine flags rather than an LLM call in this build).
- Output is schema-validated. Invalid output is marked unavailable; it is never coerced into a policy.
- Without a key, services return `available: false` with an explicit explanation and empty output.
- The engine receives an AI signal only as an escalation hint; hard checks ignore AI entirely.

## 8. Security controls

- JWT bearer auth, bcrypt password hashes, login rate limiting.
- Strict role dependencies (`require_roles`) on every non-public route.
- CORS allow-list from configuration.
- Idempotency keys on donation confirmation and payment settlement.
- Re-validation at settlement of vendor status and payout destination.
- Append-only ledger, authorization, evidence and audit records.
- Delivery reports are ownership-checked and accepted only for settled purchases; receipt decisions are organisation-only and terminal.
- No withdrawal endpoint; no frontend-only enforcement.
- Admin actions require notes where they create exceptions or state changes.

## 9. Simulation boundary and production gaps

Simulated in this prototype:

- donation checkout and confirmation;
- vendor settlement and payment references;
- verification registry data (admin-entered, not KYC);
- the seeded delivery and receipt history, which demonstrates the state machine but is not proof of a real delivery.

Not implemented yet:

- real PSP integration (authorised recipient accounts, webhooks, reconciliation, refunds);
- delivery-document uploads and administrator dispute adjudication;
- Alembic migrations, email verification, password reset, MFA;
- durable rate-limit storage and secret management;
- production monitoring, fraud operations and legal/compliance review.

Production purpose-restricted disbursement must use an authorised payment service provider or regulated partner. A verified vendor and a payment record do not establish that relief reached a beneficiary; delivery evidence must be tracked separately.
