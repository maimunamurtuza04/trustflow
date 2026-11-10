import pytest

from app.config import settings
from app.services import psp


def test_simulated_provider_is_the_default():
    provider = psp.get_payment_provider()
    assert provider.name == "simulated"
    assert provider.simulated is True

    summary = psp.provider_summary()
    assert summary == {"name": "simulated", "simulated": True, "configured": True}


def test_simulated_references_are_deterministic():
    provider = psp.SimulatedPaymentProvider()

    order = provider.create_donation_order(
        donation_ref="ABCDEF123456",
        amount_minor=250_000,
        currency="INR",
        idempotency_key="donation-order:ABCDEF123456",
    )
    assert order.reference == "SIMDON-ABCDEF123456"
    assert order.simulated is True

    capture = provider.capture_donation(order.order_id, idempotency_key="confirm-1")
    assert capture.status == "COMPLETED"
    assert capture.simulated is True

    payout = provider.create_payout(
        purchase_ref="000042",
        amount_minor=125_000,
        currency="INR",
        destination="supplier@example.org",
        idempotency_key="settle-1",
    )
    assert payout.reference == "SIMPAY-000042"
    assert payout.status == "COMPLETED"
    assert payout.payload["destination"] == "supplier@example.org"


def test_paypal_provider_refuses_to_start_without_credentials(monkeypatch):
    monkeypatch.setattr(settings, "paypal_client_id", "")
    monkeypatch.setattr(settings, "paypal_client_secret", "")

    with pytest.raises(psp.ProviderNotConfigured):
        psp.PayPalPaymentProvider()


def test_paypal_provider_is_only_selected_explicitly(monkeypatch):
    monkeypatch.setattr(settings, "payments_provider", "paypal")
    monkeypatch.setattr(settings, "paypal_client_id", "")
    monkeypatch.setattr(settings, "paypal_client_secret", "")

    # Selecting PayPal without credentials must fail loudly, never fall back to simulation.
    with pytest.raises(psp.ProviderNotConfigured):
        psp.get_payment_provider()
