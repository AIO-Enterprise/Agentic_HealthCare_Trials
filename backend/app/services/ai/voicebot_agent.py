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

from app.models.models import Advertisement, SkillConfig, Company
from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_BASE = "https://api.elevenlabs.io"


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
        payload = self._build_agent_payload(bot_config, system_prompt)

        existing_agent_id = bot_config.get("elevenlabs_agent_id")

        if existing_agent_id:
            agent = await self._update_agent(existing_agent_id, payload)
            logger.info("Updated ElevenLabs agent %s for ad %s", existing_agent_id, advertisement_id)
        else:
            agent = await self._create_agent(payload)
            bot_config["elevenlabs_agent_id"] = agent["agent_id"]
            ad.bot_config = bot_config
            await self.db.commit()
            logger.info("Created ElevenLabs agent %s for ad %s", agent["agent_id"], advertisement_id)

        return agent

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
                f"{ELEVENLABS_BASE}/v1/convai/conversations/token",
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

        bot_config.pop("elevenlabs_agent_id", None)
        ad.bot_config = bot_config
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
        strategy = ad.strategy_json or {}
        target_audience = strategy.get("target_audience", {})
        messaging = strategy.get("messaging", {})
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
        self, bot_config: Dict[str, Any], system_prompt: str
    ) -> Dict[str, Any]:
        """
        Map bot_config fields → ElevenLabs agent creation payload.

        bot_config keys consumed:
          voice_id           - ElevenLabs voice ID (falls back to settings default)
          first_message      - Agent's opening line
          language           - BCP-47 language code, e.g. "en", "en-US"
          bot_name           - Display name for the agent
        """
        voice_id = bot_config.get("voice_id") or settings.ELEVENLABS_VOICE_ID or "EXAVITQu4vr4xnSDxMaL"
        first_message = bot_config.get(
            "first_message", "Hello! How can I help you today?"
        )
        language = bot_config.get("language", "en")
        agent_name = bot_config.get("bot_name", "Marketing Assistant")

        return {
            "name": agent_name,
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": system_prompt,
                        "llm": "claude-3-7-sonnet",
                        "temperature": 0.7,
                    },
                    "first_message": first_message,
                    "language": language,
                },
                "tts": {
                    "voice_id": voice_id,
                    "model_id": "eleven_turbo_v2",
                },
            },
        }

    async def _build_system_prompt(self, ad: Advertisement) -> str:
        """
        Build the ElevenLabs agent system prompt.

        Priority:
        1. Company-trained voicebot SKILL.md (from SkillConfig table)
        2. Default prompt generated from company name + industry

        Always appends runtime overrides from bot_config (style, compliance).
        """
        company_result = await self.db.execute(
            select(Company).where(Company.id == ad.company_id)
        )
        company = company_result.scalar_one_or_none()
        company_name = company.name if company else "our company"
        industry = company.industry if company else "our industry"

        skill_result = await self.db.execute(
            select(SkillConfig).where(
                SkillConfig.company_id == ad.company_id,
                SkillConfig.skill_type == "voicebot",
            )
        )
        skill = skill_result.scalar_one_or_none()

        base_prompt = (
            skill.skill_md
            if (skill and skill.skill_md)
            else self._default_voicebot_prompt(company_name, industry)
        )

        bot_config: Dict[str, Any] = ad.bot_config or {}
        style = bot_config.get("conversation_style", "professional and helpful")
        compliance = bot_config.get("compliance_notes", "")

        addendum = f"\n\n## Runtime Configuration\nConversation style: {style}."
        if compliance:
            addendum += f"\nCompliance rules: {compliance}"
        addendum += (
            "\n\nCRITICAL VOICE RULES: You are speaking out loud via audio. "
            "Keep every response to 1–2 short sentences maximum. "
            "Never use bullet points, markdown, or lists. "
            "Sound natural and conversational, like a real person on the phone."
        )

        return base_prompt + addendum

    @staticmethod
    def _default_voicebot_prompt(company_name: str, industry: str) -> str:
        return (
            f"You are a friendly and knowledgeable voice assistant representing {company_name}, "
            f"a company in the {industry} industry. "
            "Your goal is to help callers learn about products and services, "
            "answer their questions clearly, and guide them toward the next step. "
            "Be warm, concise, and professional at all times."
        )

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
