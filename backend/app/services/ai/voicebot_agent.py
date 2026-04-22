"""
ElevenLabs Voicebot Agent Service
Owner: AI Dev
Dependencies: M1 (models), M4 (SkillConfig)

Manages ElevenLabs Conversational AI agents for voicebot campaigns.
Each voicebot advertisement gets its own provisioned ElevenLabs agent.

Flow:
1. Publisher configures bot (voice, style, language, first message) via bot_config
2. provision_agent() creates/updates an ElevenLabs agent with system prompt from SKILL.md
3. Frontend calls get_signed_url() to get a short-lived WebSocket URL
4. Browser connects via ElevenLabs JS SDK — voice session runs fully in-browser
5. list_conversations() / get_conversation_transcript() fetch call history from ElevenLabs
"""

import httpx
import json
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Advertisement, SkillConfig, Company, VoiceSession, CallTranscript, SurveyResponse
from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_BASE = "https://api.elevenlabs.io"

# ── Country → accent-matched voice catalogue ──────────────────────────────────
# Each entry: voice_id, name, gender, accent, traits
# Prefer voices that ElevenLabs rates as "conversational" or "friendly" for phone work.
_ACCENT_VOICE_CATALOGUE: Dict[str, list] = {
    # Australia / New Zealand
    "australia": [
        {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "gender": "female", "traits": "warm, bright Australian female — natural and friendly"},
        {"id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie", "gender": "male",   "traits": "casual, relaxed Australian male — approachable"},
    ],
    "new zealand": [
        {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "gender": "female", "traits": "warm Australian/NZ female"},
    ],
    # United Kingdom / Ireland
    "united kingdom": [
        {"id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel",  "gender": "male",   "traits": "deep, authoritative British male — trustworthy"},
        {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice",   "gender": "female", "traits": "professional British female — calm and clear"},
    ],
    "ireland": [
        {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice",   "gender": "female", "traits": "warm British/Irish female"},
    ],
    # United States / Canada
    "united states": [
        {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Rachel",  "gender": "female", "traits": "calm, professional American female"},
        {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh",    "gender": "male",   "traits": "conversational, relatable American male"},
    ],
    "canada": [
        {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Rachel",  "gender": "female", "traits": "calm North American female"},
    ],
    # India
    "india": [
        {"id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "gender": "female", "traits": "clear, warm South Asian female"},
    ],
    # Germany / Austria / Switzerland
    "germany": [
        {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam",    "gender": "male",   "traits": "deep, clear European male"},
    ],
    # France
    "france": [
        {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli",    "gender": "female", "traits": "bright, clear European female"},
    ],
    # Spain / Latin America
    "spain": [
        {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi",    "gender": "female", "traits": "strong, confident Spanish female"},
    ],
    # Default fallback — used when country not matched
    "_default": [
        {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Rachel",  "gender": "female", "traits": "calm, professional, warm"},
        {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh",    "gender": "male",   "traits": "conversational, relatable"},
    ],
}


def _voice_for_country(country: str, prefer_gender: str = "female") -> Dict[str, str]:
    """Return the best accent-matched voice for the given country string."""
    key = (country or "").lower().strip()
    candidates = _ACCENT_VOICE_CATALOGUE.get(key) or _ACCENT_VOICE_CATALOGUE["_default"]
    # Prefer the requested gender, fall back to first available
    for v in candidates:
        if v.get("gender") == prefer_gender:
            return v
    return candidates[0]


def _normalise_phone(phone: str) -> str:
    """Strip spaces/dashes/parens; keep leading +. Returns empty string if blank."""
    if not phone:
        return ""
    import re
    return re.sub(r"[\s\-().]+", "", phone)


class VoicebotAgentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._headers = {
            "xi-api-key": settings.ELEVENLABS_API_KEY or "",
            "Content-Type": "application/json",
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    async def provision_agent(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Create or update the ElevenLabs agent for this voicebot campaign.
        Stores agent_id back into Advertisement.bot_config.
        Returns the agent object from ElevenLabs.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}

        system_prompt = await self._build_system_prompt(ad)
        payload = self._build_agent_payload(
            bot_config, system_prompt,
            trial_location=ad.trial_location,
            advertisement_id=advertisement_id,
        )

        existing_agent_id = bot_config.get("elevenlabs_agent_id")

        if existing_agent_id:
            agent = await self._update_agent(existing_agent_id, payload)
            logger.info("Updated ElevenLabs agent %s for ad %s", existing_agent_id, advertisement_id)
        else:
            agent = await self._create_agent(payload)
            new_config = dict(bot_config)
            new_config["elevenlabs_agent_id"] = agent["agent_id"]
            ad.bot_config = new_config
            await self.db.commit()
            logger.info("Created ElevenLabs agent %s for ad %s", agent["agent_id"], advertisement_id)

        # Fetch and persist the actual E.164 phone number so the distribute form
        # can auto-fill it when setting the Meta ad CTA to "Phone call".
        if not bot_config.get("voice_phone_number"):
            try:
                async with httpx.AsyncClient() as _client:
                    details = await self._get_phone_number_details(_client)
                    if details.get("phone_number"):
                        refreshed = dict(ad.bot_config or {})
                        refreshed["voice_phone_number"] = details["phone_number"]
                        ad.bot_config = refreshed
                        await self.db.commit()
                        logger.info(
                            "Stored voice_phone_number %s for ad %s",
                            details["phone_number"], advertisement_id,
                        )
            except Exception as exc:
                logger.warning("Could not fetch ElevenLabs phone number for ad %s: %s", advertisement_id, exc)

        return agent

    async def _get_phone_number_details(self, client: httpx.AsyncClient) -> Dict[str, str]:
        """
        Return the phone number ID and actual E.164 number for outbound calls.
        Prefers ELEVENLABS_PHONE_NUMBER_ID env var; falls back to fetching
        the first configured phone number from the ElevenLabs account.
        Returns {"phone_number_id": "...", "phone_number": "+1234567890"}
        """
        resp = await client.get(
            f"{ELEVENLABS_BASE}/v1/convai/phone-numbers",
            headers=self._headers,
            timeout=15.0,
        )
        if not resp.is_success:
            raise ValueError(
                f"Could not fetch phone numbers from ElevenLabs ({resp.status_code}): {resp.text}"
            )
        data = resp.json()
        # API returns either a list or {"phone_numbers": [...]}
        numbers = data if isinstance(data, list) else data.get("phone_numbers", [])
        if not numbers:
            raise ValueError(
                "No phone numbers are configured in your ElevenLabs account. "
                "Go to ElevenLabs > Conversational AI > Phone Numbers and add one."
            )
        # If env var is set, find matching entry; otherwise use first
        target = numbers[0]
        if settings.ELEVENLABS_PHONE_NUMBER_ID:
            match = next(
                (n for n in numbers
                 if n.get("phone_number_id") == settings.ELEVENLABS_PHONE_NUMBER_ID
                 or n.get("id") == settings.ELEVENLABS_PHONE_NUMBER_ID),
                None,
            )
            if match:
                target = match

        return {
            "phone_number_id": target.get("phone_number_id") or target.get("id", ""),
            "phone_number":    target.get("phone_number", ""),
        }

    async def _get_phone_number_id(self, client: httpx.AsyncClient) -> str:
        """Return just the phone number ID (backwards-compat wrapper)."""
        details = await self._get_phone_number_details(client)
        return details["phone_number_id"]

    async def outbound_call(self, advertisement_id: str, to_number: str) -> Dict[str, Any]:
        """
        Trigger an outbound phone call from ElevenLabs to the given number.
        Creates a VoiceSession record immediately so the post-call webhook can
        find it by conversation_id and link the transcript to this participant.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")
        if not agent_id:
            raise ValueError(
                "No ElevenLabs agent provisioned for this campaign. "
                "Provision the agent first from the publisher dashboard."
            )

        async with httpx.AsyncClient() as client:
            phone_number_id = await self._get_phone_number_id(client)
            resp = await client.post(
                f"{ELEVENLABS_BASE}/v1/convai/twilio/outbound-call",
                headers=self._headers,
                json={
                    "agent_id": agent_id,
                    "agent_phone_number_id": phone_number_id,
                    "to_number": to_number,
                },
                timeout=30.0,
            )
            if not resp.is_success:
                raise ValueError(f"ElevenLabs outbound call failed ({resp.status_code}): {resp.text}")
            result = resp.json()

        # Persist a VoiceSession so the post-call webhook can attach the transcript.
        conversation_id = (
            result.get("conversation_id")
            or result.get("callSid")
            or result.get("call_sid")
        )
        session = VoiceSession(
            advertisement_id=advertisement_id,
            elevenlabs_conversation_id=conversation_id,
            phone=to_number,
            status="active",
            caller_metadata={"type": "outbound", "to": to_number},
        )
        self.db.add(session)

        # Try to link immediately to an existing SurveyResponse with the same phone.
        norm = _normalise_phone(to_number)
        if norm:
            sr_result = await self.db.execute(
                select(SurveyResponse).where(
                    SurveyResponse.advertisement_id == advertisement_id,
                    SurveyResponse.phone == norm,
                )
            )
            survey_resp = sr_result.scalars().first()
            if survey_resp:
                session.survey_response_id = survey_resp.id

        await self.db.commit()
        logger.info("Outbound call initiated to %s for ad %s, conversation_id=%s",
                    to_number, advertisement_id, conversation_id)
        return result

    async def get_signed_url(self, advertisement_id: str) -> str:
        """
        Return a short-lived signed WebSocket URL for the ElevenLabs browser SDK.
        The browser client uses this to start a voice session directly with ElevenLabs,
        so audio never passes through our servers.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            raise ValueError(
                "No ElevenLabs agent provisioned for this campaign. "
                "Call POST /voice-agent first."
            )

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversation/get-signed-url",
                headers=self._headers,
                params={"agent_id": agent_id},
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json()["signed_url"]

    async def delete_agent(self, advertisement_id: str) -> bool:
        """
        Delete the ElevenLabs agent when a campaign is ended or deleted.
        Clears elevenlabs_agent_id from bot_config.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            return True  # Nothing to delete

        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{ELEVENLABS_BASE}/v1/convai/agents/{agent_id}",
                headers=self._headers,
                timeout=15.0,
            )
            # 404 means already gone — treat as success
            if resp.status_code not in (200, 204, 404):
                resp.raise_for_status()

        new_config = {k: v for k, v in bot_config.items() if k != "elevenlabs_agent_id"}
        ad.bot_config = new_config
        await self.db.commit()
        logger.info("Deleted ElevenLabs agent %s for ad %s", agent_id, advertisement_id)
        return True

    async def list_conversations(
        self, advertisement_id: str, page_size: int = 20
    ) -> Dict[str, Any]:
        """
        Fetch past call conversations for this agent from ElevenLabs.
        Returns the raw ElevenLabs paginated response.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            return {"conversations": [], "total_count": 0}

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations",
                headers=self._headers,
                params={"agent_id": agent_id, "page_size": page_size},
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_conversation_transcript(self, conversation_id: str) -> Dict[str, Any]:
        """
        Fetch the full transcript and metadata for a single conversation.
        Returns speaker turns, timestamps, and call outcome.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations/{conversation_id}",
                headers=self._headers,
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def sync_all_transcripts(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Pull all completed conversations for this campaign from ElevenLabs,
        store transcripts in CallTranscript, and link sessions to SurveyResponse
        by phone number.  Called manually from the Participants tab.
        Returns {"synced": N, "skipped": M}.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")
        if not agent_id:
            return {"synced": 0, "skipped": 0, "error": "No ElevenLabs agent provisioned"}

        # Fetch conversation list from ElevenLabs (up to 100 most recent)
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations",
                headers=self._headers,
                params={"agent_id": agent_id, "page_size": 100},
                timeout=15.0,
            )
            resp.raise_for_status()
            conversations = resp.json().get("conversations", [])

        synced = 0
        skipped = 0
        for conv in conversations:
            conv_id = conv.get("conversation_id")
            if not conv_id:
                continue

            # Skip if we already have transcripts for this session
            existing = await self.db.execute(
                select(VoiceSession).where(VoiceSession.elevenlabs_conversation_id == conv_id)
            )
            session = existing.scalar_one_or_none()
            if session:
                transcript_check = await self.db.execute(
                    select(CallTranscript).where(CallTranscript.session_id == session.id).limit(1)
                )
                if transcript_check.scalar_one_or_none() is not None:
                    skipped += 1
                    continue

            # Fetch full conversation detail
            try:
                async with httpx.AsyncClient() as client:
                    detail_resp = await client.get(
                        f"{ELEVENLABS_BASE}/v1/convai/conversations/{conv_id}",
                        headers=self._headers,
                        timeout=15.0,
                    )
                    detail_resp.raise_for_status()
                    detail = detail_resp.json()
            except Exception as exc:
                logger.warning("Could not fetch conversation %s: %s", conv_id, exc)
                skipped += 1
                continue

            transcript_turns = detail.get("transcript") or []
            metadata = detail.get("metadata") or {}

            # Extract phone number — outbound calls have phone_number_to
            phone_call = metadata.get("phone_call") or {}
            phone_to = (
                phone_call.get("called_number")
                or phone_call.get("to")
                or metadata.get("phone_number_to")
                or metadata.get("to_number")
            )

            duration = metadata.get("call_duration_secs") or metadata.get("duration_seconds")
            try:
                duration = int(duration) if duration is not None else None
            except (TypeError, ValueError):
                duration = None

            status_raw = (detail.get("status") or conv.get("status") or "ended").lower()
            call_status = "failed" if status_raw in ("failed", "error") else "ended"

            # Ensure the VoiceSession is scoped to this advertisement
            if session is None:
                session = VoiceSession(
                    advertisement_id=advertisement_id,
                    elevenlabs_conversation_id=conv_id,
                    phone=_normalise_phone(phone_to) if phone_to else None,
                    status=call_status,
                    caller_metadata={"type": "outbound", "source": "manual_sync"},
                )
                self.db.add(session)
                await self.db.flush()

            await self.store_transcript_from_webhook(
                conversation_id=conv_id,
                transcript_turns=transcript_turns,
                phone_to=_normalise_phone(phone_to) if phone_to else None,
                duration_seconds=duration,
                status=call_status,
            )
            synced += 1

        logger.info("Manual transcript sync for ad %s: synced=%d skipped=%d", advertisement_id, synced, skipped)
        return {"synced": synced, "skipped": skipped}

    async def store_transcript_from_webhook(
        self,
        conversation_id: str,
        transcript_turns: list,
        phone_to: Optional[str],
        duration_seconds: Optional[int],
        status: str = "ended",
    ) -> VoiceSession:
        """
        Upsert a VoiceSession + CallTranscript rows from a webhook payload.
        Matches the VoiceSession by elevenlabs_conversation_id.
        Matches SurveyResponse by phone_to if no link exists yet.
        Returns the VoiceSession.
        """
        from datetime import datetime, timezone as _tz

        # Find existing session (created at call-start) or create one.
        res = await self.db.execute(
            select(VoiceSession).where(VoiceSession.elevenlabs_conversation_id == conversation_id)
        )
        session = res.scalar_one_or_none()

        if session is None:
            # Webhook arrived before or without our session record — create it now.
            session = VoiceSession(
                elevenlabs_conversation_id=conversation_id,
                advertisement_id="",   # filled below if we can find the agent mapping
                phone=phone_to,
                status=status,
                caller_metadata={"type": "outbound", "to": phone_to},
            )
            self.db.add(session)

        session.status = status
        session.ended_at = datetime.now(_tz.utc).replace(tzinfo=None)
        if duration_seconds is not None:
            session.duration_seconds = duration_seconds
        if phone_to and not session.phone:
            session.phone = phone_to

        # Delete stale transcripts before re-inserting (idempotent).
        from sqlalchemy import delete as _delete
        await self.db.execute(
            _delete(CallTranscript).where(CallTranscript.session_id == session.id)
        )
        await self.db.flush()   # make sure the delete is visible before inserts

        for idx, turn in enumerate(transcript_turns):
            role = turn.get("role", "").lower()
            speaker = "agent" if role in ("agent", "assistant") else "user"
            text = turn.get("message") or turn.get("text") or ""
            ts = turn.get("time_in_call_secs")
            ts_ms = int(ts * 1000) if ts is not None else None
            self.db.add(CallTranscript(
                session_id=session.id,
                speaker=speaker,
                text=text,
                turn_index=idx,
                timestamp_ms=ts_ms,
            ))

        # Link to SurveyResponse if not already linked.
        if not session.survey_response_id and phone_to and session.advertisement_id:
            norm = _normalise_phone(phone_to)
            sr_res = await self.db.execute(
                select(SurveyResponse).where(
                    SurveyResponse.advertisement_id == session.advertisement_id,
                    SurveyResponse.phone == norm,
                )
            )
            sr = sr_res.scalars().first()
            if sr:
                session.survey_response_id = sr.id

        await self.db.commit()
        logger.info("Stored transcript for conversation %s (%d turns)", conversation_id, len(transcript_turns))
        return session

    async def get_agent_status(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Return current agent info from ElevenLabs (name, voice, status).
        Used by the Publisher UI to show provisioning status.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            return {"provisioned": False}

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/agents/{agent_id}",
                headers=self._headers,
                timeout=15.0,
            )
            if resp.status_code == 404:
                return {"provisioned": False}
            resp.raise_for_status()
            data = resp.json()
            data["provisioned"] = True
            return data

    async def recommend_voice(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Analyze the campaign's target audience and strategy using Claude,
        then recommend the best ElevenLabs voice profile.

        Returns:
            {
                "voice_id": str,
                "voice_name": str,
                "reason": str,          # 1-sentence explanation
                "conversation_style": str,
                "first_message": str,
            }
        """
        ad = await self._get_advertisement(advertisement_id)
        strategy = ad.strategy_json if isinstance(ad.strategy_json, dict) else {}
        target_audience = strategy.get("target_audience", {})
        messaging = strategy.get("messaging", {}) or {}
        executive_summary = strategy.get("executive_summary", "")

        voices_catalogue = [
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Rachel", "traits": "calm, professional, warm female — suits healthcare, B2B, corporate, clinical"},
            {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam",   "traits": "deep, authoritative male — suits financial, legal, insurance, executive audiences"},
            {"id": "oWAxZDx7w5VEj9dCyTzz", "name": "Grace",  "traits": "warm, friendly female — suits consumer wellness, lifestyle, retail, family"},
            {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh",   "traits": "conversational, relatable male — suits tech, startups, younger demographics"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi",   "traits": "strong, confident female — suits fitness, empowerment, sports, motivation"},
            {"id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "traits": "crisp, clear male — suits education, SaaS, technical product demos"},
            {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli",   "traits": "bright, energetic female — suits entertainment, youth, e-commerce, events"},
            {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "traits": "sophisticated, composed female — suits luxury, premium brands, fashion, finance"},
        ]

        prompt = f"""You are a voice casting expert for AI voice agents used in marketing campaigns.

Campaign summary: {executive_summary}

Target audience:
{json.dumps(target_audience, indent=2)}

Messaging tone: {messaging.get("tone", "N/A")}
Core message: {messaging.get("core_message", "N/A")}

Available voices:
{json.dumps(voices_catalogue, indent=2)}

Based on the target audience demographics, tone, and campaign goals, select the single best voice.
Also suggest a conversation_style (one of: professional, friendly, casual, formal, empathetic, energetic)
and a natural first_message the agent should say when a user picks up.

Respond with ONLY a valid JSON object, no markdown:
{{
  "voice_id": "<id from catalogue>",
  "voice_name": "<name>",
  "reason": "<one sentence explaining why this voice fits this audience>",
  "conversation_style": "<style>",
  "first_message": "<opening line the agent says, max 20 words>"
}}"""

        if not is_configured():
            # Fallback: pick Rachel for professional, Josh for casual, etc.
            tone = (messaging.get("tone") or "").lower()
            fallback = voices_catalogue[3] if "casual" in tone or "young" in tone else voices_catalogue[0]
            return {
                "voice_id": fallback["id"],
                "voice_name": fallback["name"],
                "reason": "Default recommendation — configure AI API for personalized suggestions.",
                "conversation_style": "professional",
                "first_message": "Hi! How can I help you today?",
            }

        client = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown fences if Claude wrapped it
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]

        return json.loads(raw.strip())

    # ──────────────────────────────────────────────────────────────────────────
    # ElevenLabs REST helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _create_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{ELEVENLABS_BASE}/v1/convai/agents/create",
                headers=self._headers,
                json=payload,
                timeout=30.0,
            )
            if not resp.is_success:
                raise ValueError(f"ElevenLabs {resp.status_code}: {resp.text}")
            return resp.json()

    async def _update_agent(self, agent_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{ELEVENLABS_BASE}/v1/convai/agents/{agent_id}",
                headers=self._headers,
                json=payload,
                timeout=30.0,
            )
            if not resp.is_success:
                raise ValueError(f"ElevenLabs {resp.status_code}: {resp.text}")
            return resp.json()

    # ──────────────────────────────────────────────────────────────────────────
    # Payload builders
    # ──────────────────────────────────────────────────────────────────────────

    def _build_agent_payload(
        self,
        bot_config: Dict[str, Any],
        system_prompt: str,
        trial_location: Optional[list] = None,
        advertisement_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Map bot_config fields → ElevenLabs agent creation payload.

        bot_config keys consumed:
          voice_id           - ElevenLabs voice ID (overrides accent auto-select)
          first_message      - Agent's opening line
          language           - BCP-47 language code, e.g. "en", "en-US"
          bot_name           - Display name for the agent

        If voice_id is not set, the voice is auto-selected from the country in
        trial_location[0] so the accent matches the campaign's target region.
        """
        # Voice selection priority:
        #   1. bot_config.voice_id — publisher explicitly chose a voice
        #   2. Country-based accent matching from trial_location
        #   3. settings.ELEVENLABS_VOICE_ID — global fallback (last resort only)
        publisher_voice = bot_config.get("voice_id")
        country = ""
        if trial_location and isinstance(trial_location, list) and len(trial_location) > 0:
            loc = trial_location[0]
            country = (loc.get("country") or "") if isinstance(loc, dict) else ""

        if publisher_voice:
            voice_id = publisher_voice
            logger.info("Using publisher-selected voice %s for ad", voice_id)
        elif country:
            selected = _voice_for_country(country)
            voice_id = selected["id"]
            logger.info("Auto-selected accent voice for country=%r → %s (%s)", country, selected["name"], voice_id)
        else:
            voice_id = settings.ELEVENLABS_VOICE_ID or "EXAVITQu4vr4xnSDxMaL"
            logger.info("No country set — using default voice %s", voice_id)

        first_message = bot_config.get(
            "first_message", "Hello! How can I help you today?"
        )
        language = bot_config.get("language", "en")
        agent_name = bot_config.get("bot_name", "Marketing Assistant")

        # Booking webhook tool — ElevenLabs calls this mid-call when the agent
        # decides to book a screening appointment for an eligible candidate.
        public_url = (settings.APP_PUBLIC_URL or "").rstrip("/")
        booking_tool = {
            "type": "webhook",
            "name": "book_appointment",
            "description": (
                "Book a screening appointment for a candidate who has passed eligibility "
                "screening and agreed to attend. Call this ONLY after the candidate confirms "
                "they want to proceed and has provided their preferred date and time."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_name":  {"type": "string", "description": "Full name of the candidate"},
                    "preferred_date":  {"type": "string", "description": "Preferred appointment date, e.g. '2026-05-10' or 'next Monday'"},
                    "preferred_time":  {"type": "string", "description": "Preferred time slot, e.g. '10:00 AM' or 'morning'"},
                    "candidate_phone": {"type": "string", "description": "Candidate's phone number"},
                    "candidate_email": {"type": "string", "description": "Candidate's email address if provided"},
                    "notes":           {"type": "string", "description": "Any extra context from the conversation"},
                },
                "required": ["candidate_name", "preferred_date", "preferred_time"],
            },
            "url": f"{public_url}/api/voice-agent/{{}}/book-slot",   # EL fills ad_id at runtime via path
            "method": "POST",
        }
        # Embed the ad_id directly in the URL — one webhook URL per provisioned agent
        booking_tool["url"] = f"{public_url}/api/voice-agent/{advertisement_id or ''}/book-slot"

        payload: Dict[str, Any] = {
            "name": agent_name,
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": system_prompt,
                        "llm": "claude-3-7-sonnet",
                        "temperature": 0.7,
                        "tools": [booking_tool] if public_url else [],
                    },
                    "first_message": first_message,
                    "language": language,
                },
                "tts": {
                    "voice_id": voice_id,
                    "model_id": settings.ELEVENLABS_TTS_MODEL,
                    "optimize_streaming_latency": 3,
                },
            },
        }

        return payload

    async def _build_system_prompt(self, ad: Advertisement) -> str:
        """
        Build the ElevenLabs agent system prompt with full campaign context.

        Sections injected (matching the agreed context table):
          - Identity & tone
          - Trial facts (title, category, location, dates, duration, summary)
          - Target audience & messaging (for guidance only — not to recite)
          - Eligibility criteria (inclusion / exclusion)
          - Screening questionnaire (agent walks through conversationally)
          - Approved FAQs (may quote verbatim)
          - Ethical / compliance guardrails (enforced silently)
          - Voice rules
        """
        company_result = await self.db.execute(
            select(Company).where(Company.id == ad.company_id)
        )
        company = company_result.scalar_one_or_none()
        company_name = company.name     if company else "our company"
        industry     = company.industry if company else "our industry"

        skill_result = await self.db.execute(
            select(SkillConfig).where(
                SkillConfig.company_id == ad.company_id,
                SkillConfig.skill_type == "voicebot",
            )
        )
        skill = skill_result.scalar_one_or_none()

        # ── Pull campaign fields ──────────────────────────────────────────────
        bot_config  : Dict[str, Any] = ad.bot_config   if isinstance(ad.bot_config,   dict) else {}
        strategy    : Dict[str, Any] = ad.strategy_json if isinstance(ad.strategy_json, dict) else {}
        website_reqs: Dict[str, Any] = ad.website_reqs  if isinstance(ad.website_reqs,  dict) else {}
        messaging   : Dict[str, Any] = strategy.get("messaging") or {}
        messaging = messaging if isinstance(messaging, dict) else {}

        bot_name   = bot_config.get("name", "Assistant")
        style      = bot_config.get("conversation_style", "professional and helpful")
        compliance = bot_config.get("compliance_notes", "")
        first_msg  = bot_config.get("first_message", "")

        exec_summary = strategy.get("executive_summary", "")
        target_aud   = strategy.get("target_audience", {})
        tone         = messaging.get("tone", "")
        core_message = messaging.get("core_message", "")

        must_have  = website_reqs.get("must_have",    [])
        must_avoid = website_reqs.get("must_avoid",   [])
        faqs       = website_reqs.get("faqs",         [])
        eth_flags  = website_reqs.get("ethical_flags",[])

        # trial_location is [{country, city}]
        locations = ad.trial_location or []
        loc_str = ", ".join(
            f"{l.get('city', '')}, {l.get('country', '')}".strip(", ")
            for l in locations if isinstance(l, dict)
        ) if locations else ""

        start_date = str(ad.trial_start_date) if ad.trial_start_date else ""
        end_date   = str(ad.trial_end_date)   if ad.trial_end_date   else ""
        duration   = ad.duration or ""

        # questionnaire: {questions: [{id, text, type, options, required}]}
        questionnaire = ad.questionnaire or {}
        questions = questionnaire.get("questions", []) if isinstance(questionnaire, dict) else []

        # ── Base identity (skill.md overrides the default identity block only) ─
        if skill and skill.skill_md:
            identity_block = skill.skill_md
        else:
            identity_block = (
                f"You are {bot_name}, a voice assistant representing {company_name} "
                f"in the {industry} sector. "
                f"You are calling because the person expressed interest in the \"{ad.title}\" campaign. "
                "Your goal is to answer their questions, walk them through the eligibility screening, "
                "and if they qualify, encourage them to take the next step."
            )

        # ── Build the prompt sections ─────────────────────────────────────────
        sections: list[str] = [identity_block]

        # 1. Trial facts
        facts_lines = [f"- Trial name: {ad.title}"]
        if ad.campaign_category:
            facts_lines.append(f"- Category: {ad.campaign_category}")
        if exec_summary:
            facts_lines.append(f"- About this trial: {exec_summary}")
        if loc_str:
            facts_lines.append(f"- Location(s): {loc_str}")
        if start_date:
            facts_lines.append(f"- Enrolment opens: {start_date}")
        if end_date:
            facts_lines.append(f"- Enrolment closes: {end_date}")
        if duration:
            facts_lines.append(f"- Trial duration: {duration}")
        sections.append("## Trial Facts\n" + "\n".join(facts_lines))

        # 2. Audience & messaging — guidance only, never recite
        guidance_lines = []
        if target_aud:
            guidance_lines.append(
                f"The person you're speaking with likely matches this profile: "
                f"{json.dumps(target_aud) if isinstance(target_aud, dict) else target_aud}. "
                "Use this to tailor your language — do NOT read this description aloud."
            )
        if tone:
            guidance_lines.append(f"Speak in a {tone} tone — do NOT mention this instruction.")
        if core_message:
            guidance_lines.append(
                f"The underlying message to convey is: \"{core_message}\" — "
                "weave this in naturally, never quote it verbatim."
            )
        if guidance_lines:
            sections.append("## Audience & Tone Guidance (internal — never recite)\n" + "\n".join(guidance_lines))

        # 3. Eligibility criteria
        if must_have or must_avoid:
            elig_lines = []
            if must_have:
                elig_lines.append(
                    "Inclusion criteria (share these conversationally when asked):\n" +
                    "\n".join(f"  - {c}" for c in must_have)
                )
            if must_avoid:
                elig_lines.append(
                    "Exclusion criteria (mention gently only if directly relevant):\n" +
                    "\n".join(f"  - {c}" for c in must_avoid)
                )
            sections.append("## Eligibility Criteria\n" + "\n\n".join(elig_lines))

        # 4. Screening questionnaire
        if questions:
            q_lines = [
                "Walk through these screening questions one at a time, conversationally — "
                "do NOT read them as a list. Wait for the answer before asking the next question. "
                "If the caller answers in a way that makes them ineligible, be empathetic and honest.\n"
            ]
            for i, q in enumerate(questions, 1):
                if not isinstance(q, dict):
                    continue
                q_text    = q.get("text", "")
                q_options = q.get("options", [])
                q_options = q_options if isinstance(q_options, list) else []
                q_req     = q.get("required", True)
                line = f"Q{i}: {q_text}"
                if q_options:
                    line += f" (options: {', '.join(str(o) for o in q_options)})"
                if not q_req:
                    line += " [optional]"
                q_lines.append(line)
            q_lines.append(
                "\nAfter all questions are answered, summarise eligibility warmly. "
                "If eligible, say the team will follow up. "
                "If not, thank them sincerely and let them know other trials may suit them."
            )
            sections.append("## Screening Questions\n" + "\n".join(q_lines))

        # 5. Approved FAQs
        if faqs:
            faq_lines = ["You may quote these answers verbatim when the caller asks:"]
            for faq in faqs:
                if isinstance(faq, dict):
                    faq_lines.append(f"Q: {faq.get('question', '')}\nA: {faq.get('answer', '')}")
                else:
                    faq_lines.append(str(faq))
            sections.append("## Approved FAQs\n" + "\n\n".join(faq_lines))

        # 6. Guardrails (ethical flags + compliance — enforced silently)
        guardrail_lines = []
        if eth_flags:
            guardrail_lines.append(
                "Ethical guardrails (enforce silently — never mention to the caller):\n" +
                "\n".join(f"  - {f}" for f in eth_flags)
            )
        if compliance:
            guardrail_lines.append(
                f"Compliance rules (enforce silently — never mention to the caller):\n  - {compliance}"
            )
        if guardrail_lines:
            sections.append("## Guardrails (internal — never recite or acknowledge)\n" + "\n\n".join(guardrail_lines))

        # 7. Conversation style
        sections.append(f"## Conversation Style\nSpeak in a {style} manner throughout the call.")

        # 8. Booking flow instructions
        public_url = (settings.APP_PUBLIC_URL or "").rstrip("/")
        if public_url:
            sections.append(
                "## Booking Flow (follow this sequence exactly after eligibility is confirmed)\n"
                "Once you have determined the caller is eligible AND they express willingness to proceed:\n"
                "\n"
                "Step 1 — Warmly confirm eligibility:\n"
                "  \"That's great news! <break time=\"0.4s\" /> Based on what you've told me, "
                "you sound like a wonderful fit for this study.\"\n"
                "\n"
                "Step 2 — Offer to book on the spot:\n"
                "  \"I can actually lock in a screening appointment for you right now — "
                "it only takes a moment. <break time=\"0.5s\" /> Would that work for you?\"\n"
                "\n"
                "Step 3 — Collect booking details conversationally (one question at a time):\n"
                "  a) Full name (\"Could I grab your full name for the booking?\")\n"
                "  b) Preferred date (\"What date works best for you?\")\n"
                "  c) Preferred time (\"And is there a time of day that suits — morning, afternoon, or a specific time?\")\n"
                "  d) Phone number (\"What's the best number to reach you on?\") — skip if already known from outbound call\n"
                "  e) Email (\"And do you have an email address we can send the confirmation to?\" — optional, don't push)\n"
                "\n"
                "Step 4 — Call the book_appointment tool with all collected details.\n"
                "  Wait for the confirmation response, then read it naturally to the caller.\n"
                "\n"
                "Step 5 — Close warmly:\n"
                "  \"You're all set! <break time=\"0.3s\" /> The team will be in touch very soon "
                "to confirm everything. <break time=\"0.4s\" /> Is there anything else I can help you with today?\"\n"
                "\n"
                "RULES:\n"
                "- Never call book_appointment before the caller explicitly agrees to book.\n"
                "- Never fabricate a date or time — only use what the caller provides.\n"
                "- If the caller is not eligible, do NOT offer booking. Thank them sincerely and "
                "let them know other studies may be a better fit."
            )

        # 8. Voice rules + ElevenLabs audio tags (always last)
        locations = ad.trial_location or []
        loc_country = ""
        if locations and isinstance(locations[0], dict):
            loc_country = locations[0].get("country", "")

        # Map country name → adjective for the accent instruction
        _country_adj = {
            "australia": "Australian", "new zealand": "New Zealand",
            "united kingdom": "British", "ireland": "Irish",
            "united states": "American", "canada": "Canadian",
            "india": "Indian", "germany": "German",
            "france": "French", "spain": "Spanish",
        }
        accent_adj = _country_adj.get(loc_country.lower(), loc_country)
        accent_note = (
            f"You have a natural {accent_adj} accent. "
            f"Use locally natural expressions, rhythm, and warmth — speak exactly as a {accent_adj} local would. "
            "Never sound robotic or overly formal."
        ) if accent_adj else "Speak with a warm, natural, conversational tone."

        sections.append(
            "## Critical Voice Rules\n"
            "You are speaking out loud via a phone call — not typing.\n"
            f"{accent_note}\n"
            "- Keep every turn to 1–2 short sentences. Never exceed 3.\n"
            "- Never use bullet points, numbered lists, markdown, or headers.\n"
            "- Never spell out punctuation (no 'dash', 'colon', 'asterisk').\n"
            "- Speak naturally — contractions and filler affirmations (Sure!, Got it., Oh absolutely!) are encouraged.\n"
            "- If asked something you don't know, say so honestly and offer to have a human follow up.\n"
            "- Never fabricate trial data, timelines, or medical claims.\n"
            "\n"
            "## Audio Delivery — Pauses & Human Expressions (REQUIRED in every response)\n"
            "ElevenLabs v3 renders these tags and written expressions natively. Use them.\n"
            "\n"
            "PAUSES — use <break time=\"Xs\" /> only:\n"
            "- <break time=\"0.2s\" /> — brief pause between two clauses.\n"
            "- <break time=\"0.4s\" /> — natural breath after a greeting or topic shift.\n"
            "- <break time=\"0.6s\" /> — before asking a question.\n"
            "- <break time=\"1.0s\" /> — after delivering key info (dates, eligibility result).\n"
            "- Never use <break> mid-word or inside a proper noun.\n"
            "- Every response must contain at least one <break time> tag.\n"
            "\n"
            "HUMAN WARMTH — write these as plain text, NOT in brackets:\n"
            "- Write 'Ha!' or 'Haha!' for a genuine light laugh — ElevenLabs v3 renders this naturally.\n"
            "- Write 'Heh.' for a soft, warm chuckle moment.\n"
            "- Write 'Oh!' 'Mm!' 'Ah!' as natural listening reactions.\n"
            "- Never write [laughs], [chuckles], [giggles] — those are read aloud literally.\n"
            "- Only use warmth expressions on light-hearted moments. Never on medical topics or bad news.\n"
            "\n"
            "EXAMPLE of a well-formed response:\n"
            "\"G'day! <break time=\"0.3s\" /> Thanks so much for your interest in the Sleep Trials study. "
            "<break time=\"0.4s\" /> It's a pretty exciting one — eight weeks, no medication, completely free. "
            "<break time=\"0.6s\" /> Mind if I ask you a couple of quick questions to see if it's a good fit?\"\n"
            "\n"
            "EXAMPLE of a warm moment:\n"
            "\"Haha, yeah, I totally get that — those early morning wake-ups are the worst! "
            "<break time=\"0.4s\" /> Let me see if this study might be just the thing for you.\""
        )

        return "\n\n".join(sections)

    # ──────────────────────────────────────────────────────────────────────────
    # DB helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _get_advertisement(self, advertisement_id: str) -> Advertisement:
        result = await self.db.execute(
            select(Advertisement).where(Advertisement.id == advertisement_id)
        )
        ad = result.scalar_one_or_none()
        if not ad:
            raise ValueError(f"Advertisement {advertisement_id} not found")
        return ad
