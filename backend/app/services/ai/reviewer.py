"""
M6: Reviewer Service (Reviewer Skill Template Agent)
Owner: AI Dev
Dependencies: M1, M4 (Training)

Reviews Curator-generated strategies and produces:
- Website Requirements (for the Website Development Agent)
- Advertisement Details (for the Advertisement Agent)
- Compliance checks and ethical flags
"""

import json
import os
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Advertisement, SkillConfig, Review
from app.core.bedrock import get_async_client, get_model, is_configured

_SKILLS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "skills", "templates")
)


class ReviewerService:
    def __init__(self, db: AsyncSession, company_id: str):
        self.db = db
        self.company_id = company_id

    async def pre_review(self, advertisement: Advertisement) -> Dict[str, Any]:
        """
        AI pre-review of the Curator's strategy.
        Produces structured outputs for downstream agents.
        
        Returns:
            {
                "review_verdict": "approved" | "needs_revision",
                "website_requirements": {...},
                "ad_details": {...},
                "ethical_flags": [...],
                "compliance_check": {...}
            }
        """
        # Load reviewer skill
        skill_md = await self._load_skill("reviewer")

        # Build review prompt
        prompt = self._build_review_prompt(advertisement)

        # Call Claude API
        review_output = await self._call_claude(skill_md, prompt)

        return review_output

    async def incorporate_human_feedback(
        self,
        advertisement: Advertisement,
        reviews: List[Review],
    ) -> Dict[str, Any]:
        """
        Re-process strategy incorporating human reviewer feedback.
        Called when a human reviewer sends suggestions back to the AI.
        """
        skill_md = await self._load_skill("reviewer")
        
        feedback_context = "\n\n".join([
            f"### Review by {r.review_type} reviewer\n"
            f"Status: {r.status}\n"
            f"Comments: {r.comments or 'None'}\n"
            f"Suggestions: {json.dumps(r.suggestions) if r.suggestions else 'None'}\n"
            f"Edited Strategy: {json.dumps(r.edited_strategy) if r.edited_strategy else 'None'}"
            for r in reviews
        ])

        prompt = f"""{self._build_review_prompt(advertisement)}

## Human Reviewer Feedback (HIGH PRIORITY)
{feedback_context}

Incorporate all human feedback and produce an updated review output.
"""
        return await self._call_claude(skill_md, prompt)

    def _build_review_prompt(self, ad: Advertisement) -> str:
        strategy = json.dumps(ad.strategy_json, indent=2) if ad.strategy_json else "No strategy generated yet"
        return f"""## Strategy to Review

**Advertisement:** {ad.title}
**Type:** {", ".join(ad.ad_type if isinstance(ad.ad_type, list) else [])}
**Budget:** {ad.budget or 'Not specified'}

### Strategy JSON
```json
{strategy}
```

Review this strategy and produce the complete review output as JSON,
including website_requirements and ad_details sections.
Respond ONLY with the JSON object.
"""

    async def _load_skill(self, skill_type: str) -> str:
        result = await self.db.execute(
            select(SkillConfig).where(
                SkillConfig.company_id == self.company_id,
                SkillConfig.skill_type == skill_type,
            ).order_by(SkillConfig.version.desc())
        )
        skill = result.scalars().first()
        if skill:
            return skill.skill_md

        # Fall back to generic template so review works before training is run
        template_path = os.path.join(_SKILLS_DIR, f"{skill_type}_template.md")
        if os.path.exists(template_path):
            import logging
            logging.getLogger(__name__).warning(
                "No trained '%s' skill for company %s — using generic template. "
                "Run POST /api/onboarding/train to customise.",
                skill_type, self.company_id,
            )
            with open(template_path, "r") as f:
                return f.read()

        raise ValueError(
            f"Skill '{skill_type}' not found and template is missing. "
            "Run POST /api/onboarding/train first."
        )

    async def _call_claude(self, system_prompt: str, user_message: str) -> Dict[str, Any]:
        if not is_configured():
            return self._mock_review()

        client   = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text

        try:
            clean = text.strip().removeprefix("```json").removesuffix("```").strip()
            return json.loads(clean)
        except json.JSONDecodeError:
            return {"raw_response": text, "parse_error": True}

    def _mock_review(self) -> Dict[str, Any]:
        return {
            "review_verdict": "approved",
            "quality_score": 8.5,
            "compliance_check": {"passed": True, "issues": []},
            "ethical_flags": [],
            "website_requirements": {
                "pages": ["Home", "About", "Services", "Contact", "Blog"],
                "design_system": {"colors": ["#1a1a2e", "#16213e", "#e94560"], "font": "Inter"},
                "content_blocks": ["Hero", "Features", "Testimonials", "CTA", "Footer"],
                "seo_requirements": {"meta_tags": True, "structured_data": True},
            },
            "ad_details": {
                "formats": ["1080x1080 Static", "1080x1920 Story", "16:9 Video"],
                "copy_variants": [
                    {"headline": "Transform Your Business", "body": "Start your journey today"},
                    {"headline": "Results That Speak", "body": "Join thousands of satisfied clients"},
                ],
                "visual_specs": {"style": "Modern minimal", "imagery": "Professional photography"},
                "platform_configs": {
                    "instagram": {"placements": ["feed", "stories", "reels"]},
                    "google": {"campaign_type": "search+display"},
                },
            },
        }