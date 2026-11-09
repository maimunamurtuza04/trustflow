from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import client_ip, get_current_user
from app.models import Organisation, User, Vendor
from app.schemas import LoginIn, RegisterIn
from app.security import create_access_token, hash_password, verify_password
from app.serializers import user_payload
from app.services.audit import audit
from app.services.ratelimit import allow

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if not allow(f"register:{client_ip(request)}", limit=10, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many registration attempts. Try again later.")
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
    )
    db.add(user)
    db.flush()

    if payload.role == "organisation":
        if db.scalar(select(Organisation).where(Organisation.name == payload.organisation_name.strip())):
            raise HTTPException(status_code=409, detail="An organisation with this name already exists.")
        if db.scalar(
            select(Organisation).where(Organisation.registration_number == payload.registration_number.strip())
        ):
            raise HTTPException(status_code=409, detail="This organisation registration number is already in use.")
        db.add(
            Organisation(
                user_id=user.id,
                name=payload.organisation_name.strip(),
                registration_number=payload.registration_number.strip(),
                country=payload.country,
                verification_status="pending",
            )
        )
    elif payload.role == "vendor":
        if db.scalar(select(Vendor).where(Vendor.business_name == payload.business_name.strip())):
            raise HTTPException(status_code=409, detail="A vendor with this business name already exists.")
        if db.scalar(select(Vendor).where(Vendor.registration_number == payload.registration_number.strip())):
            raise HTTPException(status_code=409, detail="This vendor registration number is already in use.")
        db.add(
            Vendor(
                user_id=user.id,
                business_name=payload.business_name.strip(),
                registration_number=payload.registration_number.strip(),
                country=payload.country,
                verification_status="pending",
                payment_destination_verified=False,
            )
        )

    db.flush()
    audit(
        db,
        action="user.registered",
        entity_type="user",
        entity_id=user.id,
        actor=user,
        after={"email": user.email, "role": user.role},
        ip=client_ip(request),
    )
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    return {"access_token": token, "token_type": "bearer", "user": user_payload(db, user)}


@router.post("/login")
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    if not allow(f"login:{ip}", limit=12, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in a few minutes.")

    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        audit(
            db,
            action="auth.login_failed",
            entity_type="user",
            entity_id=user.id if user else payload.email,
            actor_role="anonymous",
            after={"email": payload.email.lower()},
            ip=ip,
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    audit(db, action="auth.login", entity_type="user", entity_id=user.id, actor=user, ip=ip)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    return {"access_token": token, "token_type": "bearer", "user": user_payload(db, user)}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.refresh(user)
    return user_payload(db, user)
