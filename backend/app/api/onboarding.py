from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import OnboardingState, User, utcnow
from app.schemas import OnboardingUpdateIn
from app.serializers import iso

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

TOUR_KEYS = {"donor", "organisation", "vendor", "admin"}


def _payload(state: OnboardingState | None, tour_key: str) -> dict:
    status = state.status if state else "not_started"
    return {
        "tour_key": tour_key,
        "status": status,
        "current_step": state.current_step if state else 0,
        "started_at": iso(state.started_at) if state else None,
        "completed_at": iso(state.completed_at) if state else None,
        # The overlay only opens on its own the first time. A dismissed tour
        # stays dismissed until the user replays it from Help.
        "should_auto_start": status == "not_started",
    }


def _tour_key_for(user: User, tour_key: str) -> str:
    if tour_key not in TOUR_KEYS:
        raise HTTPException(status_code=404, detail="Unknown tour")
    if tour_key != user.role:
        raise HTTPException(status_code=403, detail="You can only manage your own role's tour.")
    return tour_key


@router.get("/{tour_key}")
def get_onboarding(tour_key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = _tour_key_for(user, tour_key)
    state = db.scalar(
        select(OnboardingState).where(OnboardingState.user_id == user.id, OnboardingState.tour_key == key)
    )
    return _payload(state, key)


@router.put("/{tour_key}")
def update_onboarding(
    tour_key: str,
    payload: OnboardingUpdateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = _tour_key_for(user, tour_key)
    state = db.scalar(
        select(OnboardingState).where(OnboardingState.user_id == user.id, OnboardingState.tour_key == key)
    )
    now = utcnow()
    if state is None:
        state = OnboardingState(
            user_id=user.id,
            tour_key=key,
            status=payload.status,
            current_step=payload.current_step,
            started_at=now,
        )
        db.add(state)
    else:
        if state.status in {"completed", "skipped"} and payload.status == "in_progress":
            # Replaying a finished tour starts a fresh attempt.
            state.started_at = now
            state.completed_at = None
        state.status = payload.status
        state.current_step = payload.current_step
    if payload.status == "completed":
        state.completed_at = now
    elif payload.status != "completed":
        state.completed_at = None
    db.commit()
    db.refresh(state)
    return _payload(state, key)
