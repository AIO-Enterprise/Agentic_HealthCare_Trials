"""
M7/M15: Analytics & Optimizer Routes
Owner: Backend Dev 2 / AI Dev
Dependencies: M1, M2, M7 (Optimizer Service)

GET  /analytics/{ad_id}             — Performance data for an advertisement
POST /analytics/{ad_id}/optimize    — Trigger optimizer suggestions
POST /analytics/{ad_id}/decision    — Human accepts/rejects optimizer suggestions
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db
from app.models.models import (
    User, UserRole, Advertisement, AdAnalytics, OptimizerLog, Review
)
from app.schemas.schemas import AnalyticsOut, OptimizerSuggestion, OptimizerDecision
from app.core.security import require_roles, get_current_user
from app.services.optimization.optimizer import OptimizerService

router = APIRouter(prefix="/analytics", tags=["Analytics & Optimization"])


@router.get("/{ad_id}", response_model=List[AnalyticsOut])
async def get_analytics(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve performance metrics for an advertisement."""
    result = await db.execute(
        select(AdAnalytics)
        .where(AdAnalytics.advertisement_id == ad_id)
        .order_by(AdAnalytics.recorded_at.desc())
    )
    return result.scalars().all()


@router.post("/{ad_id}/optimize", response_model=OptimizerSuggestion)
async def trigger_optimization(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger the Optimizer Automation module.
    
    Analyzes performance data with weighted factors:
    - Websites: user retention, click rate, follow-through rate, call duration
    - Ads: click rate, views, demographics, likes
    
    Uses Reviewer context for situational awareness.
    Returns suggestions for human-in-the-loop review.
    """
    # Get ad
    ad_result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Get analytics data
    analytics_result = await db.execute(
        select(AdAnalytics).where(AdAnalytics.advertisement_id == ad_id)
    )
    analytics = analytics_result.scalars().all()

    # Get reviewer context
    review_result = await db.execute(
        select(Review).where(Review.advertisement_id == ad_id)
    )
    reviews = review_result.scalars().all()

    optimizer = OptimizerService(db, user.company_id)
    suggestions = await optimizer.generate_suggestions(ad, analytics, reviews)

    # Log the suggestion
    log = OptimizerLog(
        advertisement_id=ad_id,
        suggestions=suggestions["suggestions"],
        context=suggestions.get("context"),
    )
    db.add(log)
    await db.flush()

    return OptimizerSuggestion(
        advertisement_id=ad_id,
        suggestions=suggestions["suggestions"],
        context=suggestions.get("context"),
    )


@router.post("/{ad_id}/decision")
async def submit_optimizer_decision(
    ad_id: str,
    body: OptimizerDecision,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Human-in-the-loop decision on optimizer suggestions.
    Accepts, rejects, or partially applies changes.
    """
    # Get latest optimizer log
    result = await db.execute(
        select(OptimizerLog)
        .where(OptimizerLog.advertisement_id == ad_id)
        .order_by(OptimizerLog.created_at.desc())
    )
    log = result.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="No optimizer suggestions found")

    log.human_decision = body.decision
    log.applied_changes = body.applied_changes

    # If accepted, trigger reinforcement learning
    if body.decision in ("accepted", "partial"):
        from app.services.optimization.reinforcement import ReinforcementService
        rl_service = ReinforcementService(db, user.company_id)
        await rl_service.record_outcome(ad_id, log, body.decision)

    return {"detail": f"Decision '{body.decision}' recorded", "log_id": log.id}
