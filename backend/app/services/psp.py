"""Payment provider seam.

The prototype runs on ``SimulatedPaymentProvider``: references are generated
locally (SIMDON-/SIMPAY-) and no network call is made. The same interface is
shaped like a card/PSP integration — create an order, capture it, pay out to a
verified destination, and verify webhooks — so a real provider can be dropped
in without touching business logic.

``PayPalPaymentProvider`` implements that interface against the PayPal REST
API (Orders v2 for donations, Payouts v1 for vendor settlement). It is only
selected when ``PAYMENTS_PROVIDER=paypal`` and credentials are present. It is
NOT exercised by the test suite, because tests must not require network access
or real credentials.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Mapping, Protocol

import httpx

from app.config import settings


class PaymentProviderError(RuntimeError):
    """Raised when a provider call fails. Callers surface this as a 409/502."""


class ProviderNotConfigured(PaymentProviderError):
    pass


@dataclass(frozen=True)
class ProviderOrder:
    reference: str
    order_id: str
    status: str
    simulated: bool
    payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderCapture:
    reference: str
    capture_id: str
    status: str
    simulated: bool
    payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderPayout:
    reference: str
    payout_id: str
    status: str
    simulated: bool
    payload: dict = field(default_factory=dict)


class PaymentProvider(Protocol):
    name: str
    simulated: bool

    def create_donation_order(
        self,
        *,
        donation_ref: str,
        amount_minor: int,
        currency: str,
        idempotency_key: str,
    ) -> ProviderOrder: ...

    def capture_donation(self, order_id: str, *, idempotency_key: str) -> ProviderCapture: ...

    def create_payout(
        self,
        *,
        purchase_ref: str,
        amount_minor: int,
        currency: str,
        destination: str,
        idempotency_key: str,
    ) -> ProviderPayout: ...

    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> bool: ...


class SimulatedPaymentProvider:
    """No network. Deterministic references so demos are reproducible."""

    name = "simulated"
    simulated = True

    def create_donation_order(
        self,
        *,
        donation_ref: str,
        amount_minor: int,
        currency: str,
        idempotency_key: str,
    ) -> ProviderOrder:
        return ProviderOrder(
            reference=f"SIMDON-{donation_ref}",
            order_id=f"SIMORD-{donation_ref[:16].upper()}",
            status="CREATED",
            simulated=True,
            payload={
                "amount_minor": amount_minor,
                "currency": currency,
                "idempotency_key": idempotency_key,
                "note": "Simulated checkout order. No real money moves.",
            },
        )

    def capture_donation(self, order_id: str, *, idempotency_key: str) -> ProviderCapture:
        return ProviderCapture(
            reference=order_id,
            capture_id=f"SIMCAP-{order_id.removeprefix('SIMORD-')}",
            status="COMPLETED",
            simulated=True,
            payload={"idempotency_key": idempotency_key, "note": "Simulated capture."},
        )

    def create_payout(
        self,
        *,
        purchase_ref: str,
        amount_minor: int,
        currency: str,
        destination: str,
        idempotency_key: str,
    ) -> ProviderPayout:
        return ProviderPayout(
            reference=f"SIMPAY-{purchase_ref}",
            payout_id=f"SIMPOB-{purchase_ref}",
            status="COMPLETED",
            simulated=True,
            payload={
                "amount_minor": amount_minor,
                "currency": currency,
                "destination": destination,
                "idempotency_key": idempotency_key,
                "note": "Simulated vendor payout. No real money moved.",
            },
        )

    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> bool:
        # The simulation never receives webhooks; settlement is confirmed inline.
        return False


class PayPalPaymentProvider:
    """PayPal REST adapter. Requires PAYMENTS_PROVIDER=paypal plus credentials."""

    name = "paypal"
    simulated = False

    def __init__(self) -> None:
        if not settings.paypal_configured:
            raise ProviderNotConfigured(
                "PayPal credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, "
                "or keep PAYMENTS_PROVIDER=simulated."
            )
        self._base = (
            "https://api-m.paypal.com"
            if settings.paypal_mode.lower() == "live"
            else "https://api-m.sandbox.paypal.com"
        )

    def _token(self, client: httpx.Client) -> str:
        response = client.post(
            f"{self._base}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=(settings.paypal_client_id, settings.paypal_client_secret),
        )
        if response.status_code >= 400:
            raise PaymentProviderError(f"PayPal authentication failed ({response.status_code}).")
        return response.json()["access_token"]

    def _request(self, method: str, path: str, *, json: dict, idempotency_key: str | None = None) -> dict:
        headers = {"Content-Type": "application/json"}
        if idempotency_key:
            headers["PayPal-Request-Id"] = idempotency_key
        with httpx.Client(timeout=20.0) as client:
            headers["Authorization"] = f"Bearer {self._token(client)}"
            response = client.request(method, f"{self._base}{path}", json=json, headers=headers)
        if response.status_code >= 400:
            raise PaymentProviderError(f"PayPal rejected the request ({response.status_code}): {response.text[:300]}")
        return response.json()

    def create_donation_order(
        self,
        *,
        donation_ref: str,
        amount_minor: int,
        currency: str,
        idempotency_key: str,
    ) -> ProviderOrder:
        body = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": donation_ref,
                    "amount": {"currency_code": currency, "value": f"{amount_minor / 100:.2f}"},
                }
            ],
        }
        data = self._request("POST", "/v2/checkout/orders", json=body, idempotency_key=idempotency_key)
        return ProviderOrder(
            reference=data["id"],
            order_id=data["id"],
            status=data.get("status", "CREATED"),
            simulated=False,
            payload={"provider": "paypal", "mode": settings.paypal_mode},
        )

    def capture_donation(self, order_id: str, *, idempotency_key: str) -> ProviderCapture:
        data = self._request(
            "POST", f"/v2/checkout/orders/{order_id}/capture", json={}, idempotency_key=idempotency_key
        )
        capture_id = (
            data.get("purchase_units", [{}])[0]
            .get("payments", {})
            .get("captures", [{}])[0]
            .get("id", order_id)
        )
        return ProviderCapture(
            reference=order_id,
            capture_id=capture_id,
            status=data.get("status", "COMPLETED"),
            simulated=False,
            payload={"provider": "paypal", "mode": settings.paypal_mode},
        )

    def create_payout(
        self,
        *,
        purchase_ref: str,
        amount_minor: int,
        currency: str,
        destination: str,
        idempotency_key: str,
    ) -> ProviderPayout:
        body = {
            "sender_batch_id": purchase_ref,
            "items": [
                {
                    "recipient_type": "EMAIL",
                    "receiver": destination,
                    "amount": {"currency": currency, "value": f"{amount_minor / 100:.2f}"},
                    "note": f"TrustFlow settlement {purchase_ref}",
                    "sender_item_id": purchase_ref,
                }
            ],
        }
        data = self._request(
            "POST", "/v1/payments/payouts", json=body, idempotency_key=f"payout-{idempotency_key}"
        )
        return ProviderPayout(
            reference=data.get("batch_header", {}).get("payout_batch_id", purchase_ref),
            payout_id=data.get("batch_header", {}).get("payout_batch_id", purchase_ref),
            status=data.get("batch_header", {}).get("batch_status", "PENDING"),
            simulated=False,
            payload={"provider": "paypal", "mode": settings.paypal_mode},
        )

    def verify_webhook(self, headers: Mapping[str, str], body: bytes) -> bool:
        if not settings.paypal_webhook_id:
            return False
        lowered = {key.lower(): value for key, value in headers.items()}
        payload = {
            "auth_algo": lowered.get("paypal-auth-algo", ""),
            "cert_url": lowered.get("paypal-cert-url", ""),
            "transmission_id": lowered.get("paypal-transmission-id", ""),
            "transmission_sig": lowered.get("paypal-transmission-sig", ""),
            "transmission_time": lowered.get("paypal-transmission-time", ""),
            "webhook_id": settings.paypal_webhook_id,
            "webhook_event": json.loads(body),
        }
        data = self._request("POST", "/v1/notifications/verify-webhook-signature", json=payload)
        return data.get("verification_status") == "SUCCESS"


_simulated = SimulatedPaymentProvider()


def get_payment_provider() -> PaymentProvider:
    if settings.payments_provider.strip().lower() == "paypal":
        return PayPalPaymentProvider()
    return _simulated


def provider_summary() -> dict:
    name = "paypal" if settings.payments_provider.strip().lower() == "paypal" else "simulated"
    return {
        "name": name,
        "simulated": name != "paypal",
        "configured": settings.paypal_configured if name == "paypal" else True,
    }
