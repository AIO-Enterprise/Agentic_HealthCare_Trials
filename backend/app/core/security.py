"""
M2: Authentication & Security
Owner: Backend Dev 1
Dependencies: config.py, models.py

JWT-based auth with role-based access control (RBAC).
"""

from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.db.database import get_db
from app.models.models import User, UserRole, Company

# Routes that authenticated-but-not-yet-onboarded users are allowed to call.
_ONBOARDING_PREFIXES = ("/api/onboarding", "/api/auth", "/api/health", "/api/brand-kit", "/api/users", "/api/company")

# ─── Password hashing ────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT ──────────────────────────────────────────────────────────────────────

security = HTTPBearer()

def create_access_token(user_id: str, role: str, company_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "role": role,
        "company_id": company_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ─── Dependency: get current user ─────────────────────────────────────────────

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Block access to all non-onboarding routes until the company finishes setup.
    path = request.url.path
    if not any(path.startswith(p) for p in _ONBOARDING_PREFIXES):
        company_result = await db.execute(select(Company).where(Company.id == user.company_id))
        company = company_result.scalar_one_or_none()
        if company and not company.onboarded:
            raise HTTPException(
                status_code=403,
                detail="onboarding_incomplete",
            )

    return user


# ─── Role-based access helpers ────────────────────────────────────────────────

def require_roles(allowed_roles: List[UserRole]):
    """
    FastAPI dependency factory.
    Usage: Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER]))
    """
    async def _check(user: User = Depends(get_current_user)):
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' is not authorized for this action",
            )
        return user
    return _check
