"""
M7: Reinforcement Learning Service
Owner: AI Dev
Dependencies: M1, M4

Closes the feedback loop:
1. Collects: User Reviews + Performance Reviews + Ethics Reviews
2. Analyzes and formalizes into a Reference Document via RAG
3. Appends "Lessons Learned" to the Curator/Reviewer SKILL.md files
4. Reference document gets HIGH PRIORITY in future strategy generation

The reference doc can contain: failed UI/UX from previous iterations,
demographics reached, ethical considerations, admin reviews.
"""

import json
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import (
    ReinforcementLog, SkillConfig, CompanyDocument, DocumentType,
    OptimizerLog, Advertisement, Review, AdAnalytics,
)
from app.core.bedrock import get_async_client, get_model, is_configured


class ReinforcementService:
    def __init__(self, db: AsyncSession, company_id: str):
        self.db = db
        self.company_id = company_id

    async def record_outcome(
        self,
        advertisement_id: str,
        optimizer_log: OptimizerLog,
        decision: str,
    ):
        """
        Record an optimization outcome and trigger the learning cycle.
        Called when a human accepts/rejects optimizer suggestions.
        """
        # Gather all feedback sources
        raw_data = await self._gather_feedback(advertisement_id, optimizer_log, decision)

        # Formalize into a reference document
        formalized = await self._formalize_document(raw_data)

        # Store reinforcement log
        rl_log = ReinforcementLog(
            company_id=self.company_id,
            advertisement_id=advertisement_id,
            source_type="performance",
            raw_data=raw_data,
            formalized_doc=formalized,
        )
        self.db.add(rl_log)

        # Update / create reference document (HIGH PRIORITY)
        await self._update_reference_document(formalized, advertisement_id)

        # Append lessons to Curator and Reviewer skills
        await self._append_lessons_to_skills(formalized)

        rl_log.applied_to_skill = True

    async def process_ethics_review(
        self,
        advertisement_id: str,
        review: Review,
    ):
        """Process an ethics review into the learning system."""
        raw_data = {
            "source": "ethics_review",
            "advertisement_id": advertisement_id,
            "reviewer_comments": review.comments,
            "ethical_flags": review.suggestions,
            "timestamp": datetime.utcnow().isoformat(),
        }

        formalized = await self._formalize_document(raw_data)

        rl_log = ReinforcementLog(
            company_id=self.company_id,
            advertisement_id=advertisement_id,
            source_type="ethics",
            raw_data=raw_data,
            formalized_doc=formalized,
        )
        self.db.add(rl_log)

        await self._update_reference_document(formalized, advertisement_id)
        await self._append_lessons_to_skills(formalized)
        rl_log.applied_to_skill = True

    async def _gather_feedback(
        self, ad_id: str, opt_log: OptimizerLog, decision: str
    ) -> Dict[str, Any]:
        """Gather all feedback sources for a given advertisement."""
        # Get advertisement
        ad_result = await self.db.execute(
            select(Advertisement).where(Advertisement.id == ad_id)
        )
        ad = ad_result.scalar_one_or_none()

        # Get all reviews
        review_result = await self.db.execute(
            select(Review).where(Review.advertisement_id == ad_id)
        )
        reviews = review_result.scalars().all()

        # Get analytics
        analytics_result = await self.db.execute(
            select(AdAnalytics).where(AdAnalytics.advertisement_id == ad_id)
        )
        analytics = analytics_result.scalars().all()

        return {
            "advertisement": {
                "id": ad_id,
                "title": ad.title if ad else "Unknown",
                "type": ", ".join(ad.ad_type if isinstance(ad.ad_type, list) else []) if ad else "Unknown",
                "strategy": ad.strategy_json if ad else None,
            },
            "optimizer_suggestions": opt_log.suggestions,
            "human_decision": decision,
            "applied_changes": opt_log.applied_changes,
            "reviews": [
                {
                    "type": r.review_type,
                    "status": r.status,
                    "comments": r.comments,
                    "suggestions": r.suggestions,
                }
                for r in reviews
            ],
            "performance_data": [
                {
                    "click_rate": a.click_rate,
                    "views": a.views,
                    "conversions": a.conversions,
                    "user_retention": a.user_retention,
                }
                for a in analytics[-10:]  # Last 10 data points
            ],
            "timestamp": datetime.utcnow().isoformat(),
        }

    async def _formalize_document(self, raw_data: Dict[str, Any]) -> str:
        """
        Use Claude to analyze raw feedback and formalize into a structured
        reference document via RAG-style processing.
        """
        system_prompt = """You are a marketing intelligence analyst.
Analyze the provided feedback data and produce a concise reference document.
Focus on: what worked, what failed, demographics reached, ethical considerations,
UI/UX failures, and actionable lessons for future campaigns.
Write in clear, structured prose suitable for inclusion in an AI skill prompt."""

        user_message = f"""## Feedback Data
{json.dumps(raw_data, indent=2, default=str)}

Produce a structured reference document covering:
1. Campaign Summary
2. What Worked (keep doing)
3. What Failed (avoid in future) — including UI/UX failures
4. Demographics Reached vs Intended
5. Ethical Considerations & Admin Reviews
6. Key Lessons Learned (prioritized list)
"""

        if not is_configured():
            return self._mock_formalized(raw_data)

        client   = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    async def _update_reference_document(self, content: str, ad_id: str):
        """
        Create or update the HIGH-PRIORITY reference document.
        This document is given equal priority to input documents
        when creating new strategies.
        """
        title = f"Lessons Learned — Campaign {ad_id[:8]}"

        doc = CompanyDocument(
            company_id=self.company_id,
            doc_type=DocumentType.REFERENCE,
            title=title,
            content=content,
            priority=100,  # HIGH PRIORITY
        )
        self.db.add(doc)

    async def _append_lessons_to_skills(self, formalized: str):
        """Append lessons to the Lessons Learned section of both skills."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        lesson_entry = f"\n\n### [{timestamp}]\n{formalized}"

        for skill_type in ("curator", "reviewer"):
            result = await self.db.execute(
                select(SkillConfig).where(
                    SkillConfig.company_id == self.company_id,
                    SkillConfig.skill_type == skill_type,
                )
            )
            skill = result.scalar_one_or_none()
            if skill:
                existing = skill.lessons_learnt or ""
                skill.lessons_learnt = existing + lesson_entry

                # Also update the SKILL.md content itself
                if "{{LESSONS_LEARNED}}" in skill.skill_md:
                    skill.skill_md = skill.skill_md.replace(
                        "{{LESSONS_LEARNED}}", lesson_entry
                    )
                elif "## Lessons Learned" in skill.skill_md:
                    skill.skill_md += lesson_entry

                skill.version += 1

    def _mock_formalized(self, raw: Dict) -> str:
        adv = raw.get("advertisement") or {}
        adv = adv if isinstance(adv, dict) else {}
        ad_title = adv.get("title", "Unknown Campaign")
        return f"""## Reference Document — {ad_title}

### Campaign Summary
Campaign type: {adv.get('type', 'N/A')}.
Human decision on optimizer suggestions: {raw.get('human_decision', 'N/A')}.

### What Worked
- Strategy structure was well-received by reviewers
- Channel allocation showed positive early signals

### What Failed
- Initial CTR below target threshold
- Mobile UX needs improvement per reviewer feedback

### Demographics Reached
- Data collection ongoing; initial reach aligned with targets

### Ethical Considerations
- No ethical flags raised in this iteration

### Key Lessons Learned
1. Prioritize mobile-first design in future website strategies
2. A/B test headlines before full deployment
3. Monitor CTR within first 48 hours for early course correction
"""
