from sqlalchemy.orm import Session

from app.models import AuditEvent, User


def audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: int | str | None,
    actor: User | None = None,
    actor_role: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    ip: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=actor.id if actor else None,
        actor_role=actor.role if actor else (actor_role or "system"),
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        before=before,
        after=after,
        ip=ip,
    )
    db.add(event)
    db.flush()
    return event
