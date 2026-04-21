"""
Booking Appointments API

Two entry points:
  POST /api/voice-agent/{ad_id}/book-slot
    — Called by ElevenLabs as a webhook tool during a live voice call.
      No auth header required (ElevenLabs signs with ELEVENLABS_WEBHOOK_SECRET).
      Returns a JSON confirmation the agent reads aloud to the caller.

  GET  /api/bookings/{ad_id}
    — Returns all bookings for a campaign (coordinator dashboard, JWT required).

  PATCH /api/bookings/{booking_id}
    — Update status (pending → confirmed / cancelled / completed).
"""

import hashlib
import hmac
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.models import Advertisement, BookingAppointment, VoiceSession

logger = logging.getLogger(__name__)
router = APIRouter(tags=["bookings"])


# ── Signature verification (reused from voice_webhook) ───────────────────────

def _verify_el_signature(body: bytes, header: str | None) -> bool:
    secret = settings.ELEVENLABS_WEBHOOK_SECRET
    if not secret:
        return True
    if not header:
        return False
    try:
        parts = dict(chunk.split("=", 1) for chunk in header.split(","))
        ts, sig = parts["t"], parts["v0"]
    except Exception:
        return False
    if abs(time.time() - int(ts)) > 300:
        return False
    expected = hmac.new(
        secret.encode(), f"{ts}.{body.decode()}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


# ── ElevenLabs tool-call payload ──────────────────────────────────────────────

class BookSlotPayload(BaseModel):
    candidate_name:  str
    preferred_date:  str                    # "2026-05-10" or "next Monday"
    preferred_time:  str                    # "10:00 AM" or "morning"
    candidate_phone: Optional[str] = None
    candidate_email: Optional[str] = None
    notes:           Optional[str] = None
    # ElevenLabs injects these automatically when using a webhook tool
    conversation_id: Optional[str] = None


# ── Webhook endpoint — called by ElevenLabs mid-call ─────────────────────────

@router.post("/voice-agent/{ad_id}/book-slot")
async def book_slot(
    ad_id: str,
    body: BookSlotPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    ElevenLabs calls this during a live conversation when the agent invokes the
    book_appointment tool.  Creates a BookingAppointment record and returns a
    plain-English confirmation the agent reads back to the caller.
    """
    raw = await request.body()
    sig = request.headers.get("ElevenLabs-Signature")
    if not _verify_el_signature(raw, sig):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # Verify the campaign exists
    result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Find the VoiceSession by conversation_id if provided
    session_id = None
    if body.conversation_id:
        vs_result = await db.execute(
            select(VoiceSession).where(
                VoiceSession.elevenlabs_conversation_id == body.conversation_id
            )
        )
        vs = vs_result.scalar_one_or_none()
        if vs:
            session_id = vs.id

    booking = BookingAppointment(
        advertisement_id=ad_id,
        voice_session_id=session_id,
        elevenlabs_conversation_id=body.conversation_id,
        candidate_name=body.candidate_name,
        candidate_phone=body.candidate_phone,
        candidate_email=body.candidate_email,
        preferred_date=body.preferred_date,
        preferred_time=body.preferred_time,
        notes=body.notes,
        status="pending",
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)

    logger.info(
        "Booking created: id=%s ad=%s candidate=%s date=%s time=%s",
        booking.id, ad_id, body.candidate_name, body.preferred_date, body.preferred_time,
    )

    # Return a natural-language confirmation the agent speaks aloud
    return {
        "booking_id": booking.id,
        "confirmation": (
            f"Fantastic! I've booked your screening appointment for "
            f"{body.preferred_date} at {body.preferred_time}. "
            f"The research team will send you a confirmation shortly."
        ),
    }


# ── Coordinator dashboard endpoints ──────────────────────────────────────────

@router.get("/bookings/{ad_id}")
async def list_bookings(
    ad_id: str,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all bookings for a campaign. Optionally filter by status."""
    q = select(BookingAppointment).where(BookingAppointment.advertisement_id == ad_id)
    if status:
        q = q.where(BookingAppointment.status == status)
    q = q.order_by(BookingAppointment.created_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id":               b.id,
            "candidate_name":   b.candidate_name,
            "candidate_phone":  b.candidate_phone,
            "candidate_email":  b.candidate_email,
            "preferred_date":   b.preferred_date,
            "preferred_time":   b.preferred_time,
            "notes":            b.notes,
            "status":           b.status,
            "voice_session_id": b.voice_session_id,
            "created_at":       b.created_at.isoformat() if b.created_at else None,
        }
        for b in rows
    ]


class BookingUpdate(BaseModel):
    status: str   # confirmed | completed | cancelled


@router.patch("/bookings/{booking_id}")
async def update_booking(
    booking_id: str,
    body: BookingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Coordinator confirms, completes, or cancels a booking."""
    allowed = {"pending", "confirmed", "completed", "cancelled"}
    if body.status not in allowed:
        raise HTTPException(status_code=422, detail=f"status must be one of {allowed}")

    result = await db.execute(
        select(BookingAppointment).where(BookingAppointment.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = body.status
    await db.commit()
    return {"id": booking.id, "status": booking.status}
