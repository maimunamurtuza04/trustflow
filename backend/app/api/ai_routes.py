from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import client_ip, require_roles
from app.models import User
from app.schemas import ProjectRequirementsIn
from app.services import ai
from app.services.audit import audit
from app.services.ratelimit import allow

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/project-requirements")
async def project_requirements(
    payload: ProjectRequirementsIn,
    request: Request,
    user: User = Depends(require_roles("organisation", "admin")),
    db: Session = Depends(get_db),
):
    if not allow(f"ai-requirements:{user.id}", limit=20, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many AI analysis requests. Try again later.")
    result = await ai.analyze_project_requirements(
        description=payload.description,
        project_category=payload.project_category,
        target_beneficiaries=payload.target_beneficiaries,
        budget_minor=payload.budget_minor,
    )
    assessment = ai.persist_assessment(db, result)
    audit(
        db,
        action="ai.project_requirements",
        entity_type="ai_assessment",
        entity_id=assessment.id,
        actor=user,
        after={"available": result.available, "model": result.model, "authoritative": False},
        ip=client_ip(request),
    )
    db.commit()
    return {
        **result.serialize(),
        "authoritative": False,
        "disclaimer": (
            "AI recommendations are advisory. They do not approve spending. A separate deterministic policy "
            "engine authorises every payment against the project's approved spending policy."
        ),
    }
