"""
Chat API — real-time AI chat for landing page widgets.

Flow:
  POST /api/chat  { campaignId, sessionId?, message }
    → origin check (allowed_origins in bot_config)
    → load Advertisement from DB (in-memory TTL cache)
    → find or create ChatSession for (campaignId, sessionId)
    → build system prompt strictly from THIS campaign's data
    → call Claude Haiku via Bedrock or Anthropic API
    → persist updated message history to ChatSession
    → return { reply, sessionId }

Key isolation guarantee:
  A session is tied to a single campaign_id at creation.
  Any request that sends a sessionId belonging to a different campaign
  is treated as a new session — the session is never shared or readable
  across campaign boundaries.

No auth required — the widget is embedded in a public landing page.
"""

import json
import logging
import time
import uuid as _uuid_mod
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings
from app.db.database import get_db
from app.models.models import Advertisement, ChatSession

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

# ── In-memory advertisement cache ─────────────────────────────────────────────
# Store plain dicts, not ORM objects — ORM objects become detached after their
# session closes and raise DetachedInstanceError on the next cache hit.
_ad_cache: dict = {}
_CACHE_TTL = 300  # seconds


def _ad_to_dict(ad: Advertisement) -> dict:
    return {
        "id":                ad.id,
        "title":             ad.title,
        "campaign_category": ad.campaign_category,
        "duration":          ad.duration,
        "trial_start_date":  str(ad.trial_start_date) if ad.trial_start_date else None,
        "trial_end_date":    str(ad.trial_end_date)   if ad.trial_end_date   else None,
        "trial_location":    ad.trial_location,
        "patients_required": ad.patients_required,
        "bot_config":        ad.bot_config,
        "strategy_json":     ad.strategy_json,
        "website_reqs":      ad.website_reqs,
        "questionnaire":     ad.questionnaire,
    }


async def _load_ad(ad_id: str, db: AsyncSession) -> Optional[dict]:
    now = time.monotonic()
    entry = _ad_cache.get(ad_id)
    if entry and (now - entry["ts"]) < _CACHE_TTL:
        return entry["data"]

    result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = result.scalar_one_or_none()
    if ad:
        data = _ad_to_dict(ad)
        _ad_cache[ad_id] = {"data": data, "ts": now}
        return data
    return None


# ── Schemas ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    # Accept both names — projectId is the legacy field from pre-session landing pages
    campaignId: Optional[str] = None
    projectId:  Optional[str] = None   # backwards-compat alias for already-generated pages
    sessionId:  Optional[str] = None   # omit on first message; server creates and returns one
    message: str

    @property
    def resolved_campaign_id(self) -> Optional[str]:
        return self.campaignId or self.projectId


class ChatResponse(BaseModel):
    reply: str
    sessionId: str   # always returned so the widget can persist it


# ── System prompt ──────────────────────────────────────────────────────────────
def _build_system_prompt(ad: dict) -> str:
    bot_config = ad.get("bot_config") or {}
    bot_name   = bot_config.get("name", "Assistant") if isinstance(bot_config, dict) else "Assistant"
    style      = bot_config.get("conversation_style", "friendly and professional") if isinstance(bot_config, dict) else "friendly and professional"
    compliance = bot_config.get("compliance_notes", "") if isinstance(bot_config, dict) else ""

    strategy      = ad.get("strategy_json") or {}
    target        = strategy.get("target_audience", {})   if isinstance(strategy, dict) else {}
    exec_summary  = strategy.get("executive_summary", "") if isinstance(strategy, dict) else ""
    messaging     = strategy.get("messaging", {})          if isinstance(strategy, dict) else {}
    funnel        = strategy.get("funnel_stages", [])      if isinstance(strategy, dict) else []
    kpis          = strategy.get("KPIs", {})               if isinstance(strategy, dict) else {}

    website_reqs  = ad.get("website_reqs") or {}
    must_have     = website_reqs.get("must_have", [])     if isinstance(website_reqs, dict) else []
    must_avoid    = website_reqs.get("must_avoid", [])    if isinstance(website_reqs, dict) else []
    faqs          = website_reqs.get("faqs", [])          if isinstance(website_reqs, dict) else []
    key_messages  = website_reqs.get("key_messages", [])  if isinstance(website_reqs, dict) else []
    talking_pts   = website_reqs.get("talking_points", []) if isinstance(website_reqs, dict) else []
    ethical_flags = website_reqs.get("ethical_flags", []) if isinstance(website_reqs, dict) else []

    questionnaire = ad.get("questionnaire") or {}
    questions     = questionnaire.get("questions", []) if isinstance(questionnaire, dict) else []

    lines = [
        f"You are {bot_name}, an AI assistant for a clinical trial recruitment campaign.",
        f"Conversation style: {style}.",
        "",
        "Your role is to help visitors understand the trial, answer eligibility questions,",
        "and guide interested participants to connect with the research team.",
        "Be warm, concise, and empathetic. Refer complex medical questions to the trial team.",
        "Never provide medical advice. Never guarantee eligibility.",
        "Keep replies under 3 sentences unless the visitor clearly needs more detail.",
        "",
        "IMPORTANT: You only know about this specific campaign. Do not reference or speculate",
        "about other trials, campaigns, or studies.",
    ]

    # ── Campaign overview ──────────────────────────────────────────────────────
    lines += ["", "━━ CAMPAIGN OVERVIEW ━━"]
    lines += [f"Title: {ad.get('title', '')}"]
    if ad.get("campaign_category"):
        lines += [f"Category: {ad['campaign_category']}"]
    if exec_summary:
        lines += [f"Summary: {exec_summary}"]

    # ── Trial logistics ────────────────────────────────────────────────────────
    logistics = []
    if ad.get("trial_location"):
        logistics += [f"Location(s): {json.dumps(ad['trial_location'])}"]
    if ad.get("trial_start_date"):
        logistics += [f"Start date: {ad['trial_start_date']}"]
    if ad.get("trial_end_date"):
        logistics += [f"End date: {ad['trial_end_date']}"]
    if ad.get("duration"):
        logistics += [f"Duration: {ad['duration']}"]
    if ad.get("patients_required"):
        logistics += [f"Patients needed: {ad['patients_required']}"]
    if logistics:
        lines += ["", "━━ TRIAL DETAILS ━━"] + logistics

    # ── Target audience ────────────────────────────────────────────────────────
    if target:
        lines += ["", "━━ TARGET AUDIENCE ━━", json.dumps(target, indent=2)]

    # ── Messaging ─────────────────────────────────────────────────────────────
    if isinstance(messaging, dict) and messaging:
        lines += ["", "━━ MESSAGING ━━"]
        if messaging.get("tone"):
            lines += [f"Tone: {messaging['tone']}"]
        if messaging.get("core_message"):
            lines += [f"Core message: {messaging['core_message']}"]
        if messaging.get("key_phrases"):
            lines += [f"Key phrases to use: {', '.join(messaging['key_phrases'])}"]

    # ── Eligibility criteria ───────────────────────────────────────────────────
    if must_have:
        lines += ["", "━━ ELIGIBILITY CRITERIA (what qualifies someone) ━━"]
        lines += [f"- {c}" for c in must_have]

    if must_avoid:
        lines += ["", "━━ EXCLUSION CRITERIA (what disqualifies someone) ━━"]
        lines += [f"- {c}" for c in must_avoid]

    # ── Screening questionnaire ────────────────────────────────────────────────
    if questions:
        lines += ["", "━━ SCREENING QUESTIONS (use these to assess eligibility) ━━"]
        for q in questions:
            text = q.get("text") or q.get("question", "")
            opts = q.get("options", [])
            if text:
                lines += [f"Q: {text}"]
            if opts:
                lines += [f"   Options: {', '.join(str(o) for o in opts)}"]

    # ── FAQs ──────────────────────────────────────────────────────────────────
    if faqs:
        lines += ["", "━━ FREQUENTLY ASKED QUESTIONS ━━"]
        lines += [json.dumps(faqs, indent=2)]

    # ── Key messages & talking points ──────────────────────────────────────────
    if key_messages:
        lines += ["", "━━ KEY MESSAGES ━━"]
        lines += [f"- {m}" for m in key_messages] if isinstance(key_messages, list) else [str(key_messages)]

    if talking_pts:
        lines += ["", "━━ TALKING POINTS ━━"]
        lines += [f"- {p}" for p in talking_pts] if isinstance(talking_pts, list) else [str(talking_pts)]

    # ── Ethical / compliance guardrails ───────────────────────────────────────
    if ethical_flags:
        lines += ["", "━━ ETHICAL FLAGS (avoid or handle carefully) ━━"]
        lines += [f"- {f}" for f in ethical_flags]

    if compliance:
        lines += ["", "━━ COMPLIANCE REQUIREMENTS ━━", compliance]

    return "\n".join(lines)


# ── Session helpers ────────────────────────────────────────────────────────────
async def _get_or_create_session(
    campaign_id: str,
    session_id: Optional[str],
    db: AsyncSession,
) -> ChatSession:
    """
    Return the ChatSession for (campaign_id, session_id).

    If session_id is None, or the session_id doesn't exist for THIS campaign
    (not just doesn't exist at all), create a fresh session.  This prevents
    a visitor from passing a session_id from Campaign B while talking to Campaign A.
    """
    if session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.campaign_id == campaign_id,
                ChatSession.session_id  == session_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing
        # session_id not found for this campaign → treat as new (no cross-campaign leak)

    new_session_id = session_id or str(_uuid_mod.uuid4())
    session = ChatSession(
        campaign_id=campaign_id,
        session_id=new_session_id,
        messages=[],
    )
    db.add(session)
    await db.flush()   # get PK without committing (commit happens in get_db on success)
    return session


# ── Mock fallback (when no AI backend is configured) ──────────────────────────
_MOCK_REPLIES = [
    "Thanks for reaching out! Our research team will be happy to help — please use the contact options on this page.",
    "That's a great question. Could you tell me a bit more so I can point you in the right direction?",
    "Our coordinators are best placed to answer that. Shall I help you get connected with the team?",
    "I want to make sure you get accurate information — let me note that for our coordinators.",
    "Happy to help! The trial team can discuss the specifics with you directly.",
]
_mock_idx = 0


# ── Endpoint ───────────────────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1. Resolve campaign ID (accept both campaignId and legacy projectId)
    campaign_id = body.resolved_campaign_id
    if not campaign_id:
        raise HTTPException(status_code=422, detail="campaignId is required")

    # 2. Load advertisement (cached as plain dict — avoids DetachedInstanceError)
    ad = await _load_ad(campaign_id, db)
    if ad is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 3. Origin validation — enforced when allowed_origins is configured
    bot_config      = ad.get("bot_config") or {}
    allowed_origins = bot_config.get("allowed_origins") if isinstance(bot_config, dict) else None
    if allowed_origins:
        origin = request.headers.get("origin", "")
        if origin not in allowed_origins:
            raise HTTPException(status_code=403, detail="Forbidden")

    # 4. Load or create campaign-scoped session
    session = await _get_or_create_session(campaign_id, body.sessionId, db)

    # 4. Build message list from persisted history + new user message
    history: list = session.messages or []
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": body.message})

    # 5. Call Haiku or return mock response
    if not is_configured():
        global _mock_idx
        reply = _MOCK_REPLIES[_mock_idx % len(_MOCK_REPLIES)]
        _mock_idx += 1
    else:
        try:
            client   = get_async_client()
            response = await client.messages.create(
                model=get_model(),
                max_tokens=512,
                system=_build_system_prompt(ad),
                messages=messages,
            )
            reply = response.content[0].text.strip()
        except Exception as exc:
            logger.error("Chat LLM error for campaign %s: %s", campaign_id, exc)
            raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    # 6. Persist updated history (SQLAlchemy JSON column requires reassignment to detect mutation)
    updated = history + [
        {"role": "user",      "content": body.message},
        {"role": "assistant", "content": reply},
    ]
    session.messages = updated

    return ChatResponse(reply=reply, sessionId=session.session_id)
