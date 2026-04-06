"""
Meta Marketing API Service
Handles publishing campaigns to Meta (Facebook/Instagram) via the Marketing API v21.0.

Full pipeline per distribute call:
  1. Upload image file → image_hash
  2. Create Campaign (OUTCOME_AWARENESS, starts PAUSED)
  3. Create Ad Set  (daily budget, geo targeting)
  4. Create Ad Creative (image + headline + body + CTA link)
  5. Create Ad (links ad set + creative, starts PAUSED)

Docs: https://developers.facebook.com/docs/marketing-apis
"""

import asyncio
import json
import base64
import logging
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

META_API_VERSION = "v21.0"
META_BASE_URL = f"https://graph.facebook.com/{META_API_VERSION}"

# CTA text → Meta CTA type mapping
CTA_MAP = {
    "LEARN MORE":   "LEARN_MORE",
    "SIGN UP":      "SIGN_UP",
    "CONTACT US":   "CONTACT_US",
    "GET STARTED":  "GET_STARTED",
    "APPLY NOW":    "APPLY_NOW",
    "BOOK NOW":     "BOOK_NOW",
    "REGISTER":     "SIGN_UP",
    "JOIN NOW":     "SIGN_UP",
}


class MetaAdsService:
    def __init__(self, access_token: str, ad_account_id: str):
        self.access_token = access_token
        # Normalise: ensure the "act_" prefix is present
        self.ad_account_id = (
            ad_account_id if ad_account_id.startswith("act_")
            else f"act_{ad_account_id}"
        )

    async def close(self):
        pass

    # ─── Low-level helpers ─────────────────────────────────────────────────────

    def _url(self, path: str) -> str:
        return f"{META_BASE_URL}/{path}"

    async def _post(self, path: str, data: dict) -> dict:
        """Form-encoded POST via requests in a thread pool."""
        payload = {**data, "access_token": self.access_token}
        url = self._url(path)

        def _sync_post() -> dict:
            resp = requests.post(url, data=payload, timeout=60)
            return resp.json()

        body = await asyncio.to_thread(_sync_post)
        if "error" in body:
            err = body["error"]
            logger.error("Meta API full error response: %s", body)
            raise RuntimeError(
                f"Meta API error {err.get('code')} ({err.get('error_subcode', '')}): "
                f"{err.get('message', 'Unknown error')} | "
                f"{err.get('error_user_msg', '')} | fbtrace: {err.get('fbtrace_id', '')}"
            )
        return body

    # ─── Step 1: Upload image ──────────────────────────────────────────────────

    async def upload_image(self, disk_path: str) -> str:
        """Upload an image by base64 and return its image_hash."""
        path = Path(disk_path)
        if not path.exists():
            raise FileNotFoundError(f"Ad image not found on disk: {disk_path}")

        image_b64 = base64.b64encode(path.read_bytes()).decode()
        result = await self._post(
            f"{self.ad_account_id}/adimages",
            {"bytes": image_b64},
        )
        # Response: {"images": {"<filename>": {"hash": "...", ...}}}
        for _fname, img_data in result.get("images", {}).items():
            return img_data["hash"]
        raise RuntimeError("Meta did not return an image hash")

    # ─── Step 2: Create Campaign ───────────────────────────────────────────────

    async def create_campaign(self, name: str) -> str:
        """Create a campaign (OUTCOME_AWARENESS, PAUSED) and return its ID."""
        result = await self._post(
            f"{self.ad_account_id}/campaigns",
            {
                "name": name,
                "objective": "OUTCOME_TRAFFIC",
                "status": "PAUSED",
                # Required: JSON-encoded empty array for non-special campaigns
                "special_ad_categories": "[]",
                # Required when not using campaign budget optimisation (CBO)
                "is_adset_budget_sharing_enabled": "false",
            },
        )
        return result["id"]

    # ─── Step 3: Create Ad Set ─────────────────────────────────────────────────

    async def create_adset(
        self,
        campaign_id: str,
        name: str,
        daily_budget_cents: int,
        targeting_countries: list[str],
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> str:
        """Create an ad set (PAUSED) and return its ID."""
        targeting = {
            "geo_locations": {"countries": targeting_countries or ["US"]},
            "age_min": 18,
            "age_max": 65,
        }
        data: dict = {
            "name": name,
            "campaign_id": campaign_id,
            # Budget in account currency cents (USD → cents)
            "daily_budget": str(daily_budget_cents),
            "billing_event": "IMPRESSIONS",
            "optimization_goal": "LINK_CLICKS",
            "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
            "destination_type": "WEBSITE",
            "targeting": json.dumps(targeting),
            "status": "PAUSED",
        }
        if start_time:
            data["start_time"] = start_time
        if end_time:
            data["end_time"] = end_time

        result = await self._post(f"{self.ad_account_id}/adsets", data)
        return result["id"]

    # ─── Step 4: Create Ad Creative ───────────────────────────────────────────

    async def create_creative(
        self,
        name: str,
        page_id: str,
        image_hash: str,
        headline: str,
        body: str,
        cta_type: str,
        link_url: str,
    ) -> str:
        """Create an ad creative and return its ID."""
        object_story_spec = {
            "page_id": page_id,
            "link_data": {
                "image_hash": image_hash,
                "link": link_url,
                # message (body) must be non-empty
                "message": body or "Learn more about this opportunity.",
                "name": headline,
                "call_to_action": {
                    "type": cta_type,
                    "value": {"link": link_url},
                },
            },
        }
        result = await self._post(
            f"{self.ad_account_id}/adcreatives",
            {
                "name": name,
                "object_story_spec": json.dumps(object_story_spec),
            },
        )
        return result["id"]

    # ─── Step 5: Create Ad ────────────────────────────────────────────────────

    async def create_ad(self, name: str, adset_id: str, creative_id: str) -> str:
        """Create the ad (PAUSED) and return its ID."""
        result = await self._post(
            f"{self.ad_account_id}/ads",
            {
                "name": name,
                "adset_id": adset_id,
                "creative": json.dumps({"creative_id": creative_id}),
                "status": "PAUSED",
            },
        )
        return result["id"]

    # ─── Orchestrator ─────────────────────────────────────────────────────────

    async def publish_campaign(
        self,
        campaign_name: str,
        page_id: str,
        creatives: list[dict],
        selected_indices: list[int],
        daily_budget_usd: float,
        destination_url: str,
        targeting_countries: list[str],
        backend_root: str,
    ) -> dict:
        """
        Full pipeline: images → campaign → ad set → creatives → ads.

        All ads start PAUSED so the publisher can review in Meta Ads Manager
        before activating.  Returns campaign_id, adset_id, ad_ids, and a
        direct link to the Ads Manager.
        """
        to_publish = (
            [creatives[i] for i in selected_indices if i < len(creatives)]
            if selected_indices
            else creatives[:1]
        )
        if not to_publish:
            raise ValueError("No creatives available to publish")

        # Meta expects budget in account currency subunits (cents for USD).
        # Minimum enforced at 100 cents ($1.00).
        daily_budget_cents = max(100, int(daily_budget_usd * 100))

        logger.info("STEP 1: Creating campaign...")
        campaign_id = await self.create_campaign(campaign_name)
        logger.info("STEP 1 OK: campaign %s", campaign_id)

        logger.info("STEP 2: Creating adset...")
        adset_id = await self.create_adset(
            campaign_id=campaign_id,
            name=f"{campaign_name} – Ad Set",
            daily_budget_cents=daily_budget_cents,
            targeting_countries=targeting_countries,
        )
        logger.info("STEP 2 OK: adset %s", adset_id)

        ad_ids = []
        for idx, creative in enumerate(to_publish):
            # Resolve image_url (/outputs/…) → absolute disk path
            image_url: str = creative.get("image_url", "")
            disk_path = str(Path(backend_root) / image_url.lstrip("/"))

            logger.info("STEP 3: Uploading image %s...", disk_path)
            image_hash = await self.upload_image(disk_path)
            logger.info("STEP 3 OK: image_hash %s", image_hash)

            cta_text = (creative.get("cta") or "Learn More").upper().strip()
            cta_type = CTA_MAP.get(cta_text, "LEARN_MORE")

            logger.info("STEP 4: Creating creative %d...", idx + 1)
            creative_id = await self.create_creative(
                name=f"{campaign_name} – Creative {idx + 1}",
                page_id=page_id,
                image_hash=image_hash,
                headline=creative.get("headline") or campaign_name,
                body=creative.get("body") or "",
                cta_type=cta_type,
                link_url=destination_url,
            )

            logger.info("STEP 4 OK: creative %s", creative_id)

            logger.info("STEP 5: Creating ad %d...", idx + 1)
            ad_id = await self.create_ad(
                name=f"{campaign_name} – Ad {idx + 1}",
                adset_id=adset_id,
                creative_id=creative_id,
            )
            ad_ids.append(ad_id)
            logger.info("STEP 5 OK: ad %s", ad_id)

        account_num = self.ad_account_id.replace("act_", "")
        ads_manager_url = (
            f"https://adsmanager.facebook.com/adsmanager/manage/campaigns"
            f"?act={account_num}&selected_campaign_ids={campaign_id}"
        )

        return {
            "campaign_id": campaign_id,
            "adset_id": adset_id,
            "ad_ids": ad_ids,
            "ads_manager_url": ads_manager_url,
            "status": "paused",
            "note": "All ads created in PAUSED state. Activate them in Meta Ads Manager after review.",
        }
