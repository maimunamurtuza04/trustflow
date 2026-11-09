import json
from dataclasses import dataclass, field

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AIAssessment

VERDICTS = {"clearly_relevant", "potentially_relevant", "unrelated", "ambiguous"}

UNAVAILABLE_DETAIL = (
    "No AI provider is configured (AI_API_KEY missing). No AI output was generated. "
    "The deterministic policy engine still enforces every spending restriction."
)


@dataclass
class AIResult:
    service: str
    available: bool
    output: dict = field(default_factory=dict)
    confidence: float | None = None
    model: str | None = None
    detail: str = ""

    def serialize(self) -> dict:
        return {
            "service": self.service,
            "available": self.available,
            "model": self.model,
            "confidence": self.confidence,
            "detail": self.detail,
            "output": self.output,
        }


def unavailable(service: str, detail: str = UNAVAILABLE_DETAIL) -> AIResult:
    return AIResult(service=service, available=False, detail=detail, model=None)


async def _chat_json(service: str, system: str, user: str) -> AIResult:
    if not settings.ai_enabled:
        return unavailable(service)
    url = settings.ai_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": settings.ai_model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    headers = {"Authorization": f"Bearer {settings.ai_api_key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            body = response.json()
        content = body["choices"][0]["message"]["content"]
        data = json.loads(content)
    except Exception as exc:  # provider/network/parse failure must fail closed, never fabricate
        return unavailable(
            service,
            detail=(
                f"AI provider call failed ({type(exc).__name__}). No AI output was produced. "
                "The deterministic policy engine still enforces every spending restriction."
            ),
        )
    return AIResult(service=service, available=True, output=data, model=settings.ai_model)


async def assess_purchase_relevance(
    *,
    project_name: str,
    project_category: str,
    project_description: str,
    purchase_category: str,
    purchase_description: str,
    approved_categories: list[str],
) -> AIResult:
    system = (
        "You are a procurement relevance analyst for a charitable funds platform. "
        "You are ADVISORY ONLY. You cannot approve, block, or execute payments. "
        "Judge whether the purchase is contextually relevant to the project's stated purpose. "
        "Return strict JSON with keys: verdict (one of clearly_relevant, potentially_relevant, "
        "unrelated, ambiguous), confidence (0 to 1), reasoning (max 120 words), "
        "signals (array of short strings). Consider operational expenses that are genuinely "
        "necessary for the project even if they are not physical relief goods."
    )
    user = json.dumps(
        {
            "project": {
                "name": project_name,
                "category": project_category,
                "description": project_description,
                "approved_spending_categories": approved_categories,
            },
            "purchase": {"category": purchase_category, "description": purchase_description},
        }
    )
    result = await _chat_json("purchase_relevance", system, user)
    if result.available:
        verdict = str(result.output.get("verdict", "")).lower()
        if verdict not in VERDICTS:
            result.available = False
            result.detail = (
                "AI provider returned an invalid relevance schema. Output stored for inspection "
                "but not used by the authorization engine."
            )
            return result
        try:
            result.confidence = float(result.output.get("confidence", 0.0))
            result.confidence = max(0.0, min(1.0, result.confidence))
        except (TypeError, ValueError):
            result.confidence = None
        if not isinstance(result.output.get("signals"), list):
            result.output["signals"] = []
    return result


async def explain_authorization(
    *,
    project_name: str,
    purchase_description: str,
    outcome: str,
    reason: str,
    checks: list[dict],
) -> AIResult:
    system = (
        "You explain deterministic financial authorization decisions to non-technical charity staff. "
        "You MUST NOT change the decision or invent facts beyond the supplied checks. "
        "Return strict JSON with a single key: explanation (plain language, max 120 words)."
    )
    user = json.dumps(
        {
            "project": project_name,
            "purchase": purchase_description,
            "decision": outcome,
            "deterministic_reason": reason,
            "checks": checks,
        }
    )
    return await _chat_json("explanation", system, user)


async def analyze_project_requirements(
    *,
    description: str,
    project_category: str | None,
    target_beneficiaries: int | None,
    budget_minor: int | None,
    currency: str = "INR",
) -> AIResult:
    system = (
        "You are a needs-analysis assistant for charitable projects. "
        "Convert the project description into structured procurement requirements. "
        "Return strict JSON with keys: summary (string) and requirements (array). "
        "Each requirement must have: category, explanation, estimated_quantity (string), "
        "estimated_budget_minor (integer, smallest currency unit), relevance (string), "
        "confidence (0 to 1), reasoning (string). "
        "These are recommendations only; they do not authorize spending."
    )
    user = json.dumps(
        {
            "description": description,
            "project_category": project_category,
            "target_beneficiaries": target_beneficiaries,
            "budget_minor": budget_minor,
            "currency": currency,
        }
    )
    result = await _chat_json("project_requirements", system, user)
    if result.available:
        requirements = result.output.get("requirements")
        if not isinstance(requirements, list):
            result.available = False
            result.detail = (
                "AI provider returned an invalid requirements schema. Output stored for inspection "
                "but not used as a spending policy."
            )
    return result


def persist_assessment(
    db: Session,
    result: AIResult,
    *,
    purchase_request_id: int | None = None,
    project_id: int | None = None,
) -> AIAssessment:
    assessment = AIAssessment(
        service=result.service,
        purchase_request_id=purchase_request_id,
        project_id=project_id,
        available=result.available,
        model=result.model,
        output=result.output,
        confidence=result.confidence,
        detail=result.detail,
    )
    db.add(assessment)
    db.flush()
    return assessment
