# TrustFlow — Teammate Brief

**For:** the person joining to own ideas, workflows and security workflows
**From:** project owner
**Updated:** 2026-11-09
**Repo:** https://github.com/maimunamurtuza04/trustflow (private)

This document is self-contained. Read it start to finish, then open the repo. It contains no secrets; the credentials listed are demo-only accounts in a local SQLite database.

---

## 1. The project in 60 seconds

TrustFlow is a purpose-restricted donation and financial accountability platform, built as a hackathon prototype.

The problem: donors give to a cause, but once money lands in an organisation's account it becomes an unrestricted balance. Donors cannot verify that funds were spent on the purpose they gave for, and "we posted a receipt" is not proof that anything was delivered.

The design answer: money never becomes a withdrawable balance. Donations enter a **project-specific restricted pool**. Funds can leave only through a **purchase request** that passes a **deterministic, server-side authorization engine** and settles to a **verified vendor payout reference**. AI is advisory and can never approve, block or move money.

> We do not simply track where donations go. We control where they can go.

All donations and vendor settlements in this build are **simulated**. No payment provider is called, no money moves, and nothing in the product should imply otherwise.

---

## 2. Current state — facts, not aspirations

| Item | Status |
| --- | --- |
| Backend | FastAPI + SQLAlchemy 2.0, SQLite by default, Postgres-ready via `DATABASE_URL` |
| Frontend | React 18 + TypeScript + Vite + Tailwind, role-based portals |
| Authorization | 11 deterministic checks, persisted outcome and check list |
| Money | Append-only ledger; balances derived, never stored counters |
| Payments | Simulated settlement (`SIMPAY-…`), idempotent |
| Delivery | State machine `in_transit → delivered → confirmed \| disputed`, evidence + audit per transition |
| Vendor performance | Derived live: `confirmed / (confirmed + disputed) × 100`, `null` if nothing reviewed |
| AI | OpenAI-compatible adapter; without a key returns `available: false` with an explicit reason |
| Tests | 22 passing (`pytest`) |
| Seeded demo | Flood Relief 2026, ₹10,000 pool, policy v1, four purchase requests, one confirmed delivery |

What exists is a **working vertical slice**: donate → approve policy → submit purchase → authorize or block → settle → report delivery → confirm receipt → audit trail. It is not a production financial system and does not pretend to be one.

---

## 3. Why I need you

I can keep building; what I need is someone who pressure-tests the model. Three lanes, in priority order:

### Lane 1 — Ideas
Find the weak points in the concept before a judge or a user does. Propose features that strengthen an existing invariant rather than adding surface area. Every idea must survive the question: *does this still work if the demo runs on stage with no network and no API key?*

### Lane 2 — Workflows
Map what each role actually does, end to end, and find where the software and the real-world process disagree. Examples of the questions I want answered in writing: What happens to unspent money when a project closes? Who handles a dispute the organisation is wrong about? What does an admin do when two vendors share a payout account? What does a donor see in the 30 seconds after donating?

### Lane 3 — Security workflows
Own the security review process, not just individual fixes. That means threat models before features, an authorization test matrix, a review checklist for every change, and a hard rule that we never make a test pass by weakening it.

You are not expected to write all the production code. You are expected to make the design and the review process defensible.

---

## 4. Skills

### Must have

| Skill | What "good" looks like here |
| --- | --- |
| Threat modeling / secure design | Can draw trust boundaries for this flow and name concrete abuse cases (vendor–org collusion, split purchases, forged delivery proof), not just list STRIDE |
| AuthN/AuthZ fundamentals | Understands the difference between authentication and authorization; can review an endpoint for missing role and ownership checks |
| RBAC and data scoping | Can enumerate what each role must and must not see, and test it at the API layer |
| OWASP Top 10 literacy | Can spot injection, broken access control, IDOR, SSRF, secrets exposure in a diff |
| Financial systems intuition | Restricted vs unrestricted funds, segregation of duties, maker-checker, reconciliation, integer minor units |
| Append-only / ledger thinking | Understands why financial and audit rows are never edited, and what that implies for corrections (compensating entries, not updates) |
| State machines and invariants | Can state the legal transitions and prove illegal ones are rejected |
| Idempotency and replay | Knows why a retried confirmation must not double-credit, and how to test it |
| Python + FastAPI + SQL | Can read the backend, run the tests, and write a focused fix |
| Testing discipline | Writes negative and permission tests; never deletes an assertion to go green |
| Written communication | Can produce a one-page threat model or workflow map that a non-engineer can follow |
| Product judgment | Can say "this feature makes the demo worse" and explain why |

### Strong plus

- Payments or payouts experience: PSP webhooks, reconciliation, refunds, chargebacks, connected/authorised recipient accounts.
- Fraud and abuse rules: velocity, duplicate detection, split-purchase patterns, allow/deny lists.
- Nonprofit / grant compliance awareness: restricted grants, procurement thresholds, audit trails, FCRA/12A/80G context in India (awareness, not legal advice).
- Privacy fundamentals: data minimisation for beneficiary and donor data, safe logging.
- CI/CD and dependency hygiene: GitHub Actions, secret scanning, Dependabot.
- Basic red teaming: Burp/ZAP, scripted abuse of your own API.
- Ability to read TypeScript and judge whether a UI claim is actually backed by an API field.

### Not required

- Machine learning or model training. AI here is an advisory adapter; no ML work is needed.
- Frontend design ownership. The UI exists; you can propose changes but do not need to build them.
- Kubernetes, cloud cost tuning, or scale work. This is a prototype with a simulation boundary.

---

## 5. Domain crash course

You need these concepts to review ideas intelligently.

- **Restricted funds.** A donation is tagged to a project and purpose. The organisation has custody, not ownership. Spending outside the approved purpose is a policy violation, not a reporting error.
- **Purpose restriction is enforced, not documented.** The enforceable form is an approved, versioned spending policy: allowed categories, per-transaction limit, and budget per category. Changing policy creates a new immutable version.
- **Procurement three-way match.** In real procurement, an invoice is matched against a purchase order and a goods-receipt note. TrustFlow models the same idea: authorization (order) → payment (invoice) → delivery and receipt (goods received). A payment record is not a receipt of goods.
- **Maker-checker / segregation of duties.** The person who requests a payment should not be the only person who approves it. Here: the organisation submits, the admin approves policy and escalations, the vendor reports delivery, the organisation confirms receipt.
- **Evidence vs proof.** A receipt, invoice, or vendor report is *evidence*. It is not proof of delivery. Stronger evidence is third-party logistics data, beneficiary acknowledgment, timestamped and geolocated proof, or independent inspection. Be precise about which one we have.
- **Append-only ledger.** Financial truth is the sum of events, not a mutable balance column. Corrections are new compensating events.
- **Idempotency.** Retries must not create duplicate money movement. Every confirm/settle call takes an idempotency key.
- **Fail closed.** Missing configuration (no AI key, no policy) must reduce functionality, never grant permission.

---

## 6. How TrustFlow works today

### Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Donor | Browse active projects, donate (simulated), see own donations and authorised/paid purchases of funded projects | See ledgers, drafts, blocked requests, or other donors |
| Organisation | Create projects and policy drafts, submit purchases, settle authorised purchases, confirm/dispute receipt, see own ledger and donations | Withdraw funds, approve its own policy, review its own escalations, act on another organisation's purchase |
| Vendor | See requests naming its business, report dispatch/delivery on settled requests, see settlement destination and product listings | See other vendors, project ledgers, or donor data |
| Admin | Approve policies, verify organisations/vendors/payout references, decide escalations, read audit history | Edit or delete financial or audit records |

All filtering is enforced in API queries, not only in the SPA.

### Money flow

1. Donor pledges → confirmation writes `DONATION_CONFIRMED` (+amount).
2. Purchase request → engine runs → if approved, `FUNDS_RESERVED` and a `FundAllocation(reserved)`.
3. Settlement (org owner or admin, idempotent) → re-checks vendor verification and payout destination → `RESERVATION_RELEASED` + `PAYMENT_MADE`, creates a `SIMPAY-…` payment and payment-confirmation evidence.
4. Balances are always derived:
   - `received = Σ DONATION_CONFIRMED`
   - `paid = −Σ PAYMENT_MADE`
   - `reserved = −Σ FUNDS_RESERVED + Σ RESERVATION_RELEASED`
   - `available = received − paid − reserved`

Demo baseline: received ₹10,000 · paid ₹3,000 · reserved ₹2,000 · available ₹5,000.

### The 11 checks (`backend/app/services/authorization.py`)

| # | Check | On failure |
| --- | --- | --- |
| 1 | Approved policy version in force | pending |
| 2 | Project active | blocked |
| 3 | Organisation verified and owns the project | blocked |
| 4 | Vendor verified | blocked |
| 5 | Category permitted by policy | blocked, or review for operational categories |
| 6 | Contextual purchase relevance | advisory only, never a hard block |
| 7 | Category budget remaining | blocked |
| 8 | Restricted funds sufficient | blocked |
| 9 | Payout destination matches verified vendor reference | blocked |
| 10 | No duplicate purchase/quotation within 24h | blocked |
| 11 | No unusual velocity or split-purchase pattern | review or blocked |

Precedence: any hard failure → `blocked`; any review signal → `review_required`; missing inputs → `pending`; otherwise `approved`. A reviewer can only act on `review_required`; the engine is re-run at decision time and a hard failure returns HTTP 409 without recording the decision.

### Delivery state machine (`backend/app/services/delivery.py`)

- Only **settled** purchases are eligible.
- Vendor reports dispatch/delivery with reference and timestamps; quantity cannot exceed ordered quantity; no future timestamps; delivery cannot precede dispatch.
- Owning organisation records `confirmed` or `disputed`; a dispute requires notes of at least 10 characters; decisions are terminal in this prototype.
- Every transition appends an `EvidenceRecord` and an audit event with before/after state.
- Performance ignores in-transit and awaiting-receipt rows. No reviewed deliveries → `null`, not a fabricated score.

### AI boundary

- Called only from the backend; the key never reaches the browser.
- Advisory services: purchase relevance, authorization explanation, project requirements. Anomaly interpretation is deterministic engine flags, not an LLM call.
- Output is schema-validated. Invalid output is marked unavailable, never coerced into policy.
- Without a key: `available: false` with an explicit reason and empty output. The deterministic engine is unaffected.

---

## 7. Rules that cannot be broken

These are the guardrails the whole project rests on. If a proposal violates one, it is rejected regardless of how good the demo looks.

1. No fake or hardcoded AI. If it is unavailable, say so.
2. AI can inform a human, never execute or authorize a transaction.
3. Spending decisions are made only by the deterministic backend engine.
4. Frontend validation is a convenience, never a security control.
5. Invoices and receipts are not delivery proof.
6. There is no unrestricted organisation withdrawal path, and no proposal should add one.
7. Verification is a precondition, not proof of delivery — do not conflate them.
8. Never claim simulated payments are real, or invent provider capabilities.
9. No secrets or API keys in the frontend or in the repository.
10. Never weaken a test, assertion, or security check to make something pass.
11. Approved policies and financial/audit records are never silently changed or overwritten.
12. Do not claim a feature is production-ready when it is a simulation; mark the boundary explicitly.

---

## 8. Security workflows you will own

### 8.1 Threat model before a feature

For any non-trivial change, produce a one-page model before code:

- **Assets:** funds, ledger integrity, donor PII, vendor payout data, audit history, policy definitions.
- **Actors:** donor, organisation user, vendor user, admin/reviewer, unauthenticated attacker, malicious insider.
- **Trust boundaries:** browser → API, API → database, API → AI provider, API → future PSP.
- **Abuse cases:** who benefits from breaking this, and what would they try?
- **Controls:** the specific check, query constraint, or ledger rule that stops it.
- **Residual risk:** what remains, stated plainly.

### 8.2 Design review gate

Before implementation, answer:

- Which invariant does this touch?
- Does it create a new way for funds to move, or to become unrestricted?
- Does it add a new actor or a new trust boundary?
- Can it be demonstrated without a real payment provider or an AI key?
- What happens on retry, partial failure, and concurrent requests?

### 8.3 Authorization review checklist

For every endpoint:

- [ ] Role dependency present (`require_roles`)
- [ ] Ownership/resource scoping enforced in the query, not after the fetch
- [ ] 404 vs 403 chosen intentionally so existence is not leaked
- [ ] Input validated with Pydantic bounds
- [ ] State transition validated (only legal source states)
- [ ] Side effects idempotent where money is involved
- [ ] Audit event written with actor, before/after, IP
- [ ] Negative test added for the unauthorized path

### 8.4 Test requirements

- Every role boundary gets an explicit denial test.
- Every money path gets a repeat/retry test.
- Every state machine gets an illegal-transition test.
- When a bug is found: write the failing test first, then fix the cause. Never delete the test.

### 8.5 Demo integrity review

Before any demo or submission:

- Every number on screen is derived from an API field, not hardcoded copy.
- Every "verified", "delivered", or "paid" label matches the actual record state.
- The simulation disclosure is visible and accurate.
- Running `python -m app.seed --reset` restores the documented baseline.

### 8.6 Regression / incident workflow

1. Reproduce with a failing test.
2. Identify the root cause, not the symptom.
3. Fix, keeping the security check intact.
4. Re-run the full suite (22 tests today) and rebuild the frontend.
5. Add the case to the checklist if it was a process miss.

### 8.7 Release checklist

- `pytest -q` passes from `backend/`
- `npm run build` passes from `frontend/`
- Seeded demo state matches README
- No `.env`, `.db`, or credentials staged (`git status` review)
- Audit trail intact for the demo path
- Claims in README and UI match what the code actually does

---

## 9. How to pitch an idea

Use this format, one page maximum:

1. **Problem** — the specific failure or gap, with an example.
2. **Invariant affected** — which of the 12 rules above it strengthens or touches.
3. **Proposed change** — user-visible behavior and backend enforcement.
4. **Demo impact** — where it appears in the four-request demo story.
5. **Cost** — rough effort, new dependencies, new trust boundaries.
6. **Risk** — what could go wrong, and what remains simulated.
7. **Acceptance criteria** — testable statements, including the denial case.

Reject your own idea if it requires inventing a provider capability, fake AI output, or a frontend-only control.

---

## 10. Open problems worth brainstorming

These are real gaps, not filler:

**Financial model**
- What happens to residual funds when a project completes or is cancelled? Refund donors, roll over with consent, or return to a platform pool?
- Should policy express more than categories — amount ceilings per vendor, geography, time windows, allow-lists?
- How do we handle partial delivery, partial refunds, and price changes after authorization?
- Should a donor be able to restrict to a sub-purpose within a project?

**Evidence quality**
- What evidence would actually raise confidence in delivery: third-party logistics data, geotagged and timestamped proof, beneficiary acknowledgment, independent inspection?
- How should an administrator adjudicate a disputed delivery, and what is the appeal path?
- How do we prevent forged delivery documents without pretending we can detect all forgeries?

**Fraud and collusion**
- Organisation and vendor colluding on a fake purchase that still passes every check.
- Shell vendors with valid-looking registration.
- Split purchases engineered to stay under review thresholds.
- Kickbacks reflected in inflated quotations.

**Governance**
- Who reviews the reviewer? How is conflict of interest recorded?
- What should be visible to a donor versus a journalist versus an auditor?
- How do we make the audit trail readable to a non-technical donor in under a minute?

**Demo and narrative**
- What is the strongest three-minute story: one blocked purchase, one human review, one confirmed delivery?
- Which single screen best communicates "we control where money can go"?

---

## 11. First week

| Day | Task |
| --- | --- |
| 1 | Clone, run backend and frontend, log in as all four roles, reproduce the four demo requests and the delivery flow |
| 1 | Break something on purpose: call another role's endpoint, reuse an idempotency key, submit a delivery for an unpaid purchase |
| 2 | Read `ARCHITECTURE.md`, then write a threat model for donate → authorize → settle → deliver |
| 3 | Draw swimlane workflows for all four roles; list every mismatch between the docs, the UI copy, and the code |
| 4 | Pitch three ideas using the format in section 9; pick one together |
| 5 | Write acceptance criteria and the test plan for the chosen idea, including denial and retry cases |

---

## 12. Setup, access, demo

**Access:** ask the owner to add you as a collaborator on the private repo. Do not fork it publicly.

```bash
# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional; safe defaults work without it
python -m app.seed --reset    # DESTRUCTIVE: rebuilds the demo database
python -m uvicorn app.main:app --reload --port 8000

# Frontend, separate terminal
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api to :8000

# Tests
cd backend && .venv/Scripts/python.exe -m pytest -q
```

Demo accounts (local SQLite only):

| Role | Email | Password |
| --- | --- | --- |
| Admin / reviewer | `admin@trustflow.demo` | `Admin123!` |
| Organisation | `org@reliefa.demo` | `Demo1234!` |
| Donor | `donor@trustflow.demo` | `Demo1234!` |
| Donor 2 | `donor2@trustflow.demo` | `Demo1234!` |
| Vendor | `vendor@aqua.demo` | `Demo1234!` |

Demo requests: water ₹3,000 (paid, delivered, receipt confirmed) · food ₹2,000 (authorised, reserved) · entertainment tablets ₹2,000 (blocked, category) · communications equipment ₹1,500 (review required).

**File map**

```
backend/app/
  api/            auth, projects, donations, purchases, vendors, dashboards, admin, ai
  services/       authorization.py, ledger.py, payments.py, delivery.py, ai.py, audit.py, ratelimit.py
  models.py       SQLAlchemy entities
  serializers.py  role-appropriate payloads
  seed.py         demo scenario
  tests/          engine, API and delivery tests
frontend/src/
  pages/          landing, auth, four role dashboards, project/purchase flows, audit log
  components/     layout, UI primitives, donation modal
  lib/            API client, types, formatting, hooks
```

---

## 13. Glossary

| Term | Meaning here |
| --- | --- |
| Restricted pool | Project-specific funds that cannot be withdrawn |
| Authorization | The deterministic engine's decision on a purchase request |
| Reservation | Funds held against an authorised but unsettled purchase |
| Settlement | Simulated payment that debits the restricted pool |
| Evidence | Recorded artifact supporting a claim; not automatically proof |
| Terminal | A state with no further transitions allowed (confirmed/disputed) |
| Idempotency key | Caller-supplied key that makes retries safe |
| Derived metric | A value computed from records at read time, never stored as a claim |
| Simulation boundary | The explicit line between demo behavior and real financial capability |

---

## 14. What will get a proposal rejected

- "Add a withdraw button for organisations."
- "Let AI approve low-risk purchases automatically."
- "Show a 98% success score" when no deliveries have been reviewed.
- "We'll add real PayPal later" as a substitute for a working, honest simulation.
- A UI claim with no backing API field.
- A test changed from `assert 403` to `assert 200` to make the suite pass.
- Any secret, key, or real donor data committed to the repo.
