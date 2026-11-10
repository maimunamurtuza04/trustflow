# TrustFlow

Purpose-restricted donation and financial accountability platform.

> We do not simply track where donations go. We control where they can go.

TrustFlow holds donor money in project-specific restricted balances. An organisation can never withdraw funds: it can only submit a purchase request, and a deterministic server-side policy engine decides whether a specific vendor may be paid. AI is advisory only and cannot approve, block or move money.

This prototype was built for a hackathon. **All donations and vendor settlements are simulated.** No real money moves and no payment-provider capability is claimed. See [Simulation disclosure](#simulation-disclosure).

## Stack

| Layer | Technology |
| --- | --- |
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, PyJWT, bcrypt |
| Database | SQLite by default; Postgres-ready through `DATABASE_URL` |
| AI | OpenAI-compatible chat-completions adapter with an honest "unavailable" fallback |
| UI | React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router 6, Recharts, Lucide |
| Tests | pytest + FastAPI TestClient (33 tests) |

## Quick start

Prerequisites: Python 3.12+, Node.js 20+.

```bash
# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional; safe defaults work without it
python -m app.seed --reset  # rebuild the demo dataset (DESTRUCTIVE)
python -m uvicorn app.main:app --reload --port 8000
```

API docs: <http://127.0.0.1:8000/docs> · health: <http://127.0.0.1:8000/api/health>

```bash
# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api to :8000
```

Single-server mode (what the demo uses):

```bash
cd frontend && npm run build
cd ../backend && python -m uvicorn app.main:app --port 8000
# open http://127.0.0.1:8000
```

`app.main` serves `frontend/dist` with an SPA fallback when the build exists.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin / reviewer | `admin@trustflow.demo` | `Admin123!` |
| Organisation | `org@reliefa.demo` | `Demo1234!` |
| Donor | `donor@trustflow.demo` | `Demo1234!` |
| Donor 2 | `donor2@trustflow.demo` | `Demo1234!` |
| Vendor | `vendor@aqua.demo` | `Demo1234!` |

Login also offers one-click demo buttons on the sign-in page.

## Demo scenario

`Flood Relief 2026` (Relief Organisation A) with a ₹10,000 restricted pool funded by two confirmed donations (₹6,000 + ₹4,000), an approved policy v1 and five category budgets.

| # | Request | Amount | Engine outcome | Why |
| --- | --- | --- | --- | --- |
| 1 | Drinking water | ₹3,000 | Paid · delivered · receipt confirmed | Verified vendor, approved category, destination match, funds available, organisation accepted 10 cases |
| 2 | Food supplies | ₹2,000 | Authorised / reserved | Approved; funds reserved until settlement |
| 3 | Personal entertainment tablets | ₹2,000 | Blocked | Category outside the approved flood-relief policy |
| 4 | Communications equipment | ₹1,500 | Review required | Ambiguous operational category; human must decide with recorded notes |

Baseline balances: received ₹10,000 · paid ₹3,000 · reserved ₹2,000 · available ₹5,000.
Run `python -m app.seed --reset` before a live demo to restore this state.

## How authorization works

Every purchase request is evaluated server-side by `app/services/authorization.py`. The eleven checks are:

1. An approved policy version is in force
2. Project is active
3. Organisation is verified
4. Vendor is verified
5. Category is permitted by the approved policy
6. Contextual relevance (deterministic; an AI signal can only escalate to human review)
7. Category budget remains
8. Restricted funds are sufficient
9. Payout destination matches the verified vendor reference
10. No duplicate purchase or quotation inside 24 hours
11. No unusual velocity or split-purchase pattern

Outcomes are `approved` (authorised + funds reserved), `blocked`, `review_required`, or `pending` (missing information). Blocking checks cannot be overridden by the AI. A reviewer can only resolve a `review_required` request; the engine is re-run at decision time and a failure returns HTTP 409.

Settlement is a separate, idempotent step that re-checks vendor verification and payout destination, writes a simulated payment (`SIMPAY-…`), releases the reservation, debits restricted funds and records evidence + audit events. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full model.

## Delivery and receipt

Payment does not prove arrival, so delivery is a separate state machine on a settled purchase:

1. **Vendor** reports dispatch or delivery via `POST /api/purchase-requests/{id}/delivery` with a dispatch reference and times. Delivery goes `in_transit → delivered`.
2. **Organisation** records receipt via `POST /api/purchase-requests/{id}/receipt` with `confirmed` or `disputed`, mandatory dispute notes and the quantity received. Receipt goes `delivered → confirmed | disputed`.
3. Each step appends evidence (`delivery_report`, `receipt_confirmation`, `receipt_dispute`) and audit events; payment confirmation remains a separate record.
4. Vendor delivery performance is derived from confirmed vs. disputed receipts — the stored demo value is no longer used. A vendor with no reviewed deliveries reports `null`, not a fabricated percentage.

Both actions are role- and ownership-checked, require a settled purchase, and are terminal once receipt is recorded. In the UI they appear on the purchase page as the **Delivery and receipt** panel: the owning vendor reports dispatch or delivery, and the owning organisation confirms or disputes receipt. Other roles see the recorded delivery state read-only.

## Security controls

- Role-based access enforced on every endpoint (donor / organisation / vendor / admin), never in the UI only.
- Restricted balances derive from an append-only ledger; there is no withdrawal endpoint.
- Approved policy versions are immutable; changes create a new version that supersedes the old one.
- Donation confirmation and payment settlement are idempotent; reusing a key is rejected.
- Login rate limiting; JWT secrets and AI keys remain server-side.
- Financial records and audit rows are never updated or deleted by the application.
- Delivery reports are accepted only for settled purchases owned by the reporting vendor; only the owning organisation can accept or dispute receipt.
- Payment confirmation is recorded as evidence, but **an invoice or receipt does not prove delivery**.

## Trust Centre

`/security` is an in-product summary of the security posture, served by `GET /api/security/posture` (authenticated). It is generated from `backend/app/api/security.py` so the page cannot drift from the code, and it shows four things:

- **Enforced controls** — each with the code area that implements it (RBAC, append-only ledger, idempotent settlement, payout re-checks, rate limits, audit trail, provider seam).
- **Simulated controls** — beneficiary verification, delivery verification and AI advice are labelled as simulated or advisory, not as guarantees.
- **Open gaps** — MFA, session revocation, CSP/security headers, a shared rate-limit store, managed key rotation and an independent audit are listed as *not implemented*. The page does not claim production readiness.
- **Rate limits and payment boundary** — the live limits per endpoint and the active provider mode (`simulated` today), including the `SIMDON-…` / `SIMPAY-…` reference formats.

## Guided onboarding

Each role has a skippable spotlight tour defined in `frontend/src/lib/tour.ts`. On the first sign-in for a role the screen dims, the current section is highlighted, and a card explains the workflow step by step. Users can finish, skip at any point (Esc), or replay later from the sidebar or the **Getting started** checklist. Progress is stored per account via `GET/PUT /api/onboarding/{tour_key}` (`not_started` → `in_progress` → `completed | skipped`), so a finished tour does not reappear, and replay resets it deliberately. The checklist stays visible until the role's real workflow actions are present in the account's data.

Every major page opens with the same structure (`frontend/src/components/PageFrame.tsx`): a plain-language overview band stating what the page contains, a next-action card, the checklist, and a sticky section nav that jumps to labelled sections.

## Payment provider seam

`backend/app/services/psp.py` defines one provider interface used by donations and settlement:

- `SimulatedPaymentProvider` (default) produces deterministic `SIMDON-…` order references and `SIMPAY-…` payout references. It makes no network calls.
- `PayPalPaymentProvider` implements the same interface against PayPal Orders v2, captures, Payouts v1 and webhook signature verification, using `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` and `PAYPAL_WEBHOOK_ID`.

Selecting `PAYMENTS_PROVIDER=paypal` without credentials raises `ProviderNotConfigured`; there is no silent fallback to simulation. The stored payment record keeps the provider name, provider reference, simulated flag and raw payload, so a later reconciliation can tell exactly which mode produced each record. The Trust Centre reads the active mode from `provider_summary()`.

## AI configuration

Set `AI_API_KEY` in `backend/.env` to enable the advisory services (project requirements, purchase relevance, explanation). Without a key:

- every AI call returns `available: false` with an explicit message;
- no recommendations or explanations are fabricated;
- the deterministic engine still enforces every restriction.

The UI labels AI output as advisory and stores it separately from authorization decisions.

## Tests

```bash
cd backend
.venv/Scripts/python.exe -m pytest -q     # Windows
# source .venv/bin/activate && pytest -q  # macOS/Linux
```

Coverage includes approval/reservation/settlement, blocked categories, operational review, budget and funding limits, payout destination mismatch, duplicate detection, reviewer decisions, delivery/receipt transitions, derived vendor performance, policy versioning, vendor isolation and RBAC, plus payment-provider selection, security-posture contents and per-account onboarding state.

## Project structure

```
backend/
  app/
    api/            auth, projects, donations, purchases, vendors, dashboards, admin, ai, security, onboarding
    services/       authorization engine, ledger, payments, payment provider seam, delivery, AI adapter, audit, rate limit
    models.py       SQLAlchemy entities
    serializers.py  API payload builders
    seed.py         demo scenario
  tests/            engine + API tests
frontend/
  src/pages/        landing, auth, role dashboards, project/purchase flows, audit log, Trust Centre
  src/components/   layout, page frame, onboarding tour, UI primitives, donation modal
  src/lib/          API client, types, formatting, hooks, tour definitions
```

## Simulation disclosure

- Donations are pledged and confirmed in a simulated checkout (`SIMDON-…`); no card, bank or PayPal API is called.
- Vendor settlement creates a simulated payment (`SIMPAY-…`); no money leaves any account.
- Verification records (organisation, vendor, payout reference) are admin-entered demo data, not KYC results.
- The seeded delivery and receipt records are demo data. They demonstrate the state machine but do not prove that any real goods were delivered.
- A verified vendor and a payment confirmation do not prove that goods were delivered. Delivery evidence is recorded separately, and disputed deliveries are reflected in derived vendor performance.

Real purpose-restricted disbursement requires an authorised payment service provider or regulated partner, production KYC/AML controls and legal review.

## Known limitations / next steps

- Replace simulated payments with a live PSP integration (webhooks, reconciliation, refunds); the provider seam and PayPal adapter exist, but no live credentials are configured or tested here.
- Add delivery-document uploads and an administrator dispute-resolution workflow.
- Postgres migrations (Alembic) instead of `create_all`.
- Email verification, password reset and MFA.
- Durable rate-limit store and production secret management.
- AI prompt-injection hardening and human review of AI output quality.
