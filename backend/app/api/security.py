from fastapi import APIRouter, Depends

from app.config import settings
from app.deps import get_current_user
from app.models import User
from app.services.psp import provider_summary

router = APIRouter(prefix="/api/security", tags=["security"])

# This endpoint describes only controls that exist in this codebase. Every
# "not_implemented" entry is a real gap; the UI presents them as such.
ENFORCED = [
    {
        "area": "Identity",
        "title": "Password hashing with bcrypt (cost 12)",
        "detail": "Passwords are stored only as bcrypt hashes with a per-password salt. Plaintext is never persisted or logged.",
        "evidence": "app/security.py",
    },
    {
        "area": "Identity",
        "title": "Short-lived signed session tokens",
        "detail": "Sessions are HS256 JWTs that expire after the configured window and are rejected once the account is deactivated.",
        "evidence": "app/security.py, app/deps.py",
    },
    {
        "area": "Identity",
        "title": "Role-based access control",
        "detail": "Donor, organisation, vendor and admin capabilities are enforced server-side per endpoint, not by hiding buttons.",
        "evidence": "app/deps.py, app/api/*",
    },
    {
        "area": "Money",
        "title": "Deterministic authorization engine",
        "detail": "Eleven ordered checks evaluate every purchase request against the approved policy version. AI cannot approve or move money.",
        "evidence": "app/services/authorization.py",
    },
    {
        "area": "Money",
        "title": "Restricted funds with no withdrawal path",
        "detail": "Donations increase a project balance only. Funds leave exclusively through an authorised purchase, paid to the vendor's verified destination.",
        "evidence": "app/services/ledger.py, app/services/payments.py",
    },
    {
        "area": "Money",
        "title": "Idempotent financial mutations",
        "detail": "Donation confirmation, settlement and ledger writes require idempotency keys so retries cannot double-count or double-pay.",
        "evidence": "app/services/payments.py, app/services/ledger.py",
    },
    {
        "area": "Money",
        "title": "Append-only ledger and audit trail",
        "detail": "Ledger events and audit entries are insert-only and carry actor, before/after state and request metadata.",
        "evidence": "app/services/ledger.py, app/services/audit.py",
    },
    {
        "area": "Money",
        "title": "Payout destination re-verified at settlement",
        "detail": "The vendor's payout reference is checked again immediately before payment, not only at authorization.",
        "evidence": "app/services/payments.py",
    },
    {
        "area": "Operations",
        "title": "Abuse rate limits on sensitive endpoints",
        "detail": "Login, registration, donations, purchase submission, project creation and AI calls have per-identity sliding-window limits.",
        "evidence": "app/services/ratelimit.py",
    },
    {
        "area": "Operations",
        "title": "Restrictive CORS allow-list",
        "detail": "Cross-origin requests are limited to explicitly configured origins; credentials are not wildcarded.",
        "evidence": "app/main.py, app/config.py",
    },
    {
        "area": "Operations",
        "title": "Ownership-scoped reads",
        "detail": "Organisations, vendors and donors only receive records they own. Cross-tenant access returns 404 rather than leaking existence.",
        "evidence": "app/api/dashboards.py, app/api/purchases.py",
    },
]

SIMULATED = [
    {
        "title": "Beneficiary and delivery verification",
        "detail": "Delivery is tracked as a state machine with evidence records. Physical verification of goods is outside this prototype.",
    },
    {
        "title": "AI advisory output",
        "detail": "Without an API key the AI endpoints report themselves unavailable instead of returning fabricated analysis.",
    },
]

PAYMENT_SIMULATED_ENTRY = {
    "title": "Payment capture and payout",
    "detail": "No real money moves. Every payment carries provider=simulated and a SIMPAY-/SIMDON- reference, and the UI labels it as such.",
}

NOT_IMPLEMENTED = [
    {
        "title": "Multi-factor authentication",
        "detail": "Sign-in is password only. MFA is not available in this prototype.",
    },
    {
        "title": "Session revocation and idle timeout",
        "detail": "Tokens expire after a fixed lifetime. There is no server-side revocation list or inactivity timeout yet.",
    },
    {
        "title": "Security headers and CSP",
        "detail": "The API does not yet emit Content-Security-Policy, HSTS or frame-ancestors headers.",
    },
    {
        "title": "Shared rate-limit store",
        "detail": "Limits are held in process memory, so they reset on restart and do not aggregate across workers.",
    },
    {
        "title": "Managed secrets and key rotation",
        "detail": "Configuration comes from environment variables. There is no KMS-backed signing-key rotation.",
    },
    {
        "title": "Independent security audit",
        "detail": "This prototype has not been penetration-tested or certified by a third party.",
    },
]

RATE_LIMITS = [
    {"endpoint": "Sign in", "limit": "12 attempts / 5 minutes / IP"},
    {"endpoint": "Registration", "limit": "10 attempts / hour / IP"},
    {"endpoint": "Donation confirmation", "limit": "30 / hour / account"},
    {"endpoint": "Purchase submission", "limit": "30 / hour / account"},
    {"endpoint": "Project creation", "limit": "20 / hour / account"},
    {"endpoint": "AI analysis", "limit": "20 / hour / account"},
]


def _pricing_boundary() -> dict:
    provider = provider_summary()
    simulated = provider["simulated"]
    return {
        "mode": "simulated" if simulated else provider["name"],
        "provider": provider["name"],
        "reference_prefixes": ["SIMPAY-", "SIMDON-"] if simulated else [],
        "real_payments": not simulated,
        "note": (
            "Settlement is simulated end to end. No card or bank data is collected, transmitted or stored."
            if simulated
            else "Payouts are submitted to the configured payment provider. Credentials come from the server environment only."
        ),
    }


@router.get("/posture")
def posture(_: User = Depends(get_current_user)) -> dict:
    boundary = _pricing_boundary()
    simulated = ([PAYMENT_SIMULATED_ENTRY] if not boundary["real_payments"] else []) + SIMULATED
    enforced = ENFORCED + (
        [
            {
                "area": "Money",
                "title": "Single payment-provider seam",
                "detail": "Donation capture and vendor payout go through one provider interface. The simulated provider is the default; a real provider is opt-in and never selected implicitly.",
                "evidence": "app/services/psp.py",
            }
        ]
        if not boundary["real_payments"]
        else [
            {
                "area": "Money",
                "title": "Live payment provider adapter",
                "detail": "Capture and payout are submitted to the configured provider, which must be explicitly enabled with server-side credentials.",
                "evidence": "app/services/psp.py",
            }
        ]
    )
    return {
        "summary": {
            "enforced_controls": len(enforced),
            "simulated_boundaries": len(simulated),
            "open_gaps": len(NOT_IMPLEMENTED),
            "session_minutes": settings.access_token_minutes,
            "role_scope": "donor, organisation, vendor, admin",
        },
        "payments": boundary,
        "enforced": enforced,
        "simulated": simulated,
        "not_implemented": NOT_IMPLEMENTED,
        "rate_limits": RATE_LIMITS,
        "statement": (
            "Controls listed under Enforced are implemented in this codebase and apply to every request. "
            "Anything under Open gaps is genuinely absent — this page does not claim production readiness."
        ),
    }
