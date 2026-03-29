"""
M2: User Management Routes
Owner: Backend Dev 1
Dependencies: M1, M2

CRUD operations for users within a company.
Only Admin can create/manage users.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db
from app.models.models import User, UserRole
from app.schemas.schemas import UserCreate, UserOut
from app.core.security import hash_password, require_roles

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post("/", response_model=UserOut)
async def create_user(
    body: UserCreate,
    admin: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user for the admin's company."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        company_id=admin.company_id,
        email=body.email,
        hashed_pw=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
    )
    db.add(user)
    await db.flush()
    return user


@router.get("/", response_model=List[UserOut])
async def list_users(
    admin: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """List all users in the admin's company."""
    result = await db.execute(
        select(User).where(User.company_id == admin.company_id)
    )
    return result.scalars().all()


@router.patch("/{user_id}/deactivate", response_model=UserOut)
async def deactivate_user(
    user_id: str,
    admin: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.company_id == admin.company_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    return user
