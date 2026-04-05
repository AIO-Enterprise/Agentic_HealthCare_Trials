"""
Creative Agent - Ad Copy + Image Generation
Owner: AI Dev

Pipeline:
  1. Claude Sonnet  → structured JSON (layout specs + copy + photo prompt)
  2. GPT-image-1    → clean background photo (scene only, no text)
  3. Compositor     → Pillow overlays headline, divider, subtext onto photo
  4. Save PNG       → served via /outputs/
"""

import asyncio
import base64
import json
import os
from typing import Dict, Any, List

from openai import AzureOpenAI, OpenAI

from app.models.models import Advertisement
from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings


def _get_image_client():
    """Returns AzureOpenAI if Azure Foundry vars are set, else standard OpenAI."""
    if settings.AZURE_OPENAI_ENDPOINT and settings.AZURE_OPENAI_API_KEY:
        return AzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _image_generation_enabled() -> bool:
    return bool(
        (settings.AZURE_OPENAI_ENDPOINT and settings.AZURE_OPENAI_API_KEY)
        or settings.OPENAI_API_KEY
    )


# ── Claude system prompt ──────────────────────────────────────────────────────

_CREATIVE_SYSTEM = """You are an expert healthcare advertising creative director specializing in pharma and clinical trial recruitment ads.

Given a marketing strategy and ad specifications, output structured creative briefs — one per format.

Each creative has two parts:
1. LAYOUT SPECS  — everything the compositor needs to render the text design overlay
2. IMAGE PROMPT  — a prompt for GPT-image-1 to generate the PHOTO ONLY (bottom section, no text, no layout)

Layout rules:
- top_bg_color   : hex color for the solid top panel (navy #0a1f5c, deep teal #0d4f5c, dark slate #1a2b4a, or similar dark brand color)
- top_height_pct : integer 38–48 (percent of total image height for the top text panel)
- headline_text  : the HOOK question or statement. Write ALL CAPS for the key condition/disease/action words to mark emphasis (e.g. "Did you previously have PROSTATE CANCER?")
- divider_color  : hex color for the thin horizontal line (usually #FFFFFF or a brand accent)
- subtext        : short supporting line below the divider (e.g. "You may qualify for a clinical research study.")
- text_color     : headline text color (usually #FFFFFF)
- subtext_color  : subtext color (usually #CCCCCC or #E0E0E0)

Image prompt rules:
- ONLY describe the scene/subjects for the photo (bottom section)
- Smiling, hopeful subjects matching the target demographic
- Warm natural light, sky or soft background, uplifting mood
- Pharma ad style, photorealistic, editorial photography quality
- NO text, NO words, NO letters, NO overlays, NO graphics
- Max 400 characters

Respond ONLY with valid JSON (no markdown fences, no extra text):
{
  "creatives": [
    {
      "index": 0,
      "format": "<format name>",
      "headline": "<short punchy headline, max 8 words>",
      "body": "<2-3 sentence ad body text>",
      "cta": "<call to action, max 4 words>",
      "layout": {
        "top_bg_color": "#0a1f5c",
        "top_height_pct": 42,
        "headline_text": "<HOOK with ALL CAPS emphasis on key words>",
        "divider_color": "#FFFFFF",
        "subtext": "<short supporting line>",
        "text_color": "#FFFFFF",
        "subtext_color": "#CCCCCC"
      },
      "image_prompt": "<photo-only prompt for GPT-image-1, no text, no layout>"
    }
  ]
}"""


class CreativeService:
    def __init__(self, company_id: str):
        self.company_id = company_id

    async def generate_creatives(self, ad: Advertisement) -> List[Dict[str, Any]]:
        """
        Main entry point.
        Returns list of creative dicts: {format, headline, body, cta, layout, image_prompt, image_url}
        """
        output_dir = os.path.join(settings.OUTPUT_DIR, self.company_id, ad.id)
        os.makedirs(output_dir, exist_ok=True)

        # Step 1: Claude → structured JSON (layout + photo prompt)
        brief = await self._generate_brief(ad)
        items = brief.get("creatives", [])
        if not items:
            return []

        # Steps 2 + 3: GPT photo → Pillow composite (each in a thread, concurrent)
        async def process(item):
            image_url = None
            if _image_generation_enabled():
                image_url = await asyncio.to_thread(
                    self._generate_and_composite,
                    item.get("image_prompt", ""),
                    item.get("layout", {}),
                    item.get("format", "square"),
                    item.get("index", 0),
                    output_dir,
                    ad.id,
                )
            return {
                "format":       item.get("format", ""),
                "headline":     item.get("headline", ""),
                "body":         item.get("body", ""),
                "cta":          item.get("cta", ""),
                "layout":       item.get("layout", {}),
                "image_prompt": item.get("image_prompt", ""),
                "image_url":    image_url,
            }

        results = await asyncio.gather(*[process(c) for c in items])
        return list(results)

    # ── Step 1: Claude brief ──────────────────────────────────────────────────

    async def _generate_brief(self, ad: Advertisement) -> Dict[str, Any]:
        if not is_configured():
            return self._mock_brief(ad)

        client     = get_async_client()
        strategy   = json.dumps(ad.strategy_json, indent=2) if ad.strategy_json else "{}"
        ad_details = json.dumps(ad.ad_details,    indent=2) if ad.ad_details    else "{}"

        user_msg = f"""## Campaign: {ad.title}
Budget: {ad.budget or 'unspecified'}

## Marketing Strategy
{strategy}

## Ad Specifications (from Reviewer AI)
{ad_details}

Generate one creative brief per format listed in the ad specifications.
If no formats are defined, generate three 1080x1920 Meta Story Ads — each a distinct creative with different hook, mood, and photo concept."""

        try:
            response = await client.messages.create(
                model=get_model(),
                max_tokens=3000,
                system=_CREATIVE_SYSTEM,
                messages=[{"role": "user", "content": user_msg}],
            )
            text = response.content[0].text.strip()
            return json.loads(text.removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            import logging
            logging.getLogger(__name__).warning(
                "Creative brief JSON parse failed for ad %s — using mock", ad.id
            )
            return self._mock_brief(ad)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(
                "Claude brief generation failed for ad %s: %s", ad.id, exc
            )
            return self._mock_brief(ad)

    # ── Steps 2+3: GPT photo → composite ─────────────────────────────────────

    def _generate_and_composite(
        self,
        image_prompt: str,
        layout: dict,
        format_name: str,
        index: int,
        output_dir: str,
        ad_id: str,
    ) -> str | None:
        """
        Synchronous — run via asyncio.to_thread.
        1. GPT-image-1 generates the scene photo
        2. Compositor overlays text design
        3. Saves final PNG and returns URL path
        """
        import logging
        log = logging.getLogger(__name__)

        import logging
        log = logging.getLogger(__name__)

        # Step 2: GPT-image-1 → raw scene photo
        try:
            client = _get_image_client()
            size   = self._get_openai_size(format_name)

            safe_prompt = (
                image_prompt or
                "Smiling hopeful older couple outdoors, warm sunlight, blue sky, photorealistic, no text"
            )[:400]

            response = client.images.generate(
                model=settings.OPENAI_IMAGE_MODEL,
                prompt=safe_prompt,
                size=size,
                quality="high",
                n=1,
                output_format="png",
            )
            photo_bytes = base64.b64decode(response.data[0].b64_json)
            log.info("GPT image generated [format=%s, ad=%s]", format_name, ad_id)
        except Exception as exc:
            log.error("GPT image generation failed [format=%s, ad=%s]: %s", format_name, ad_id, exc)
            return None

        # Step 3: Compositor → overlay text design
        try:
            from app.services.ai.compositor import composite_ad
            canvas_w, canvas_h = self._get_canvas_dimensions(format_name)
            final_png = composite_ad(photo_bytes, layout, canvas_w, canvas_h)
        except ImportError:
            log.error("Pillow not installed — skipping compositor. Run: pip install Pillow>=10.0.0")
            final_png = photo_bytes  # fall back to raw photo
        except Exception as exc:
            log.error("Compositor failed [format=%s, ad=%s]: %s", format_name, ad_id, exc)
            final_png = photo_bytes  # fall back to raw photo

        # Save final PNG
        try:
            safe_fmt  = format_name.replace(" ", "_").replace("/", "-").replace(":", "-").lower()
            filename  = f"creative_{index}_{safe_fmt}.png"
            file_path = os.path.join(output_dir, filename)
            with open(file_path, "wb") as f:
                f.write(final_png)
            return f"/outputs/{self.company_id}/{ad_id}/{filename}"
        except Exception as exc:
            log.error("Failed to save creative [format=%s, ad=%s]: %s", format_name, ad_id, exc)
            return None

    def _get_openai_size(self, format_name: str) -> str:
        fmt = format_name.lower()
        if any(k in fmt for k in ("1080x1920", "story", "portrait", "9x16", "9:16")):
            return "1024x1536"
        if any(k in fmt for k in ("16x9", "16:9", "landscape", "banner")):
            return "1536x1024"
        return "1024x1024"

    def _get_canvas_dimensions(self, format_name: str) -> tuple[int, int]:
        fmt = format_name.lower()
        if any(k in fmt for k in ("1080x1920", "story", "portrait", "9x16", "9:16")):
            return (1080, 1920)
        if any(k in fmt for k in ("16x9", "16:9", "landscape", "banner")):
            return (1920, 1080)
        return (1080, 1080)

    # ── Mock (no API keys configured) ────────────────────────────────────────

    def _mock_brief(self, ad: Advertisement) -> Dict[str, Any]:
        return {
            "creatives": [
                {
                    "index": 0,
                    "format": "1080x1920 Meta Ad",
                    "headline": f"Discover {ad.title}",
                    "body": "Cutting-edge solutions built around your needs. Trusted by professionals worldwide.",
                    "cta": "Learn More",
                    "layout": {
                        "top_bg_color": "#0a1f5c",
                        "top_height_pct": 42,
                        "headline_text": "Have you been diagnosed with a SERIOUS CONDITION?",
                        "divider_color": "#FFFFFF",
                        "subtext": "You may qualify for a clinical research study.",
                        "text_color": "#FFFFFF",
                        "subtext_color": "#CCCCCC",
                    },
                    "image_prompt": "Smiling hopeful older couple outdoors, warm natural sunlight, blue sky background, optimistic mood, pharma ad style, photorealistic, no text",
                    "image_url": None,
                },
                {
                    "index": 1,
                    "format": "1080x1920 Meta Ad",
                    "headline": "Take Control of Your Health",
                    "body": "The future starts with one decision. Join thousands who already made the leap.",
                    "cta": "Get Started",
                    "layout": {
                        "top_bg_color": "#0d4f5c",
                        "top_height_pct": 40,
                        "headline_text": "Are you living with TYPE 2 DIABETES?",
                        "divider_color": "#FFD700",
                        "subtext": "Explore a clinical study that could change your life.",
                        "text_color": "#FFFFFF",
                        "subtext_color": "#E0E0E0",
                    },
                    "image_prompt": "Confident smiling middle-aged woman looking upward, warm golden light, soft nature background, hopeful uplifting mood, photorealistic, no text",
                    "image_url": None,
                },
                {
                    "index": 2,
                    "format": "1080x1920 Meta Ad",
                    "headline": "Results That Speak",
                    "body": "Data-driven campaigns that convert. See the difference on day one.",
                    "cta": "See Results",
                    "layout": {
                        "top_bg_color": "#1a2b4a",
                        "top_height_pct": 44,
                        "headline_text": "Are you suffering from CHRONIC PAIN?",
                        "divider_color": "#FFFFFF",
                        "subtext": "A clinical study near you may help.",
                        "text_color": "#FFFFFF",
                        "subtext_color": "#BBBBBB",
                    },
                    "image_prompt": "Smiling senior man outdoors, soft warm light, green park background, relaxed hopeful expression, photorealistic, no text",
                    "image_url": None,
                },
            ]
        }
