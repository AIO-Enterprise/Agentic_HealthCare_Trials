"""
Google Ads Service
Handles publishing campaigns to Google Ads (Display Network) via the Google Ads API v18.

OAuth token strategy:
  • Authorization code flow returns access_token (1hr) + refresh_token (permanent).
  • We store only the refresh_token in PlatformConnection.access_token.
  • On every API call we exchange the refresh_token for a fresh access_token.
  • No token expiry tracking needed — refresh tokens only expire if revoked.

Full publish pipeline per distribute call:
  1. Refresh access_token from stored refresh_token
  2. Create (or reuse) Campaign (DISPLAY, starts PAUSED → ENABLED)
  3. Create Ad Group
  4. For each selected creative: upload image asset → create ResponsiveDisplayAd
  5. Return campaign_id, ad_group_id, ad_ids, ads_manager_url
"""

import base64
import logging
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests as _requests

logger = logging.getLogger(__name__)

# Google OAuth + API constants
_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL    = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_ADS_BASE     = "https://googleads.googleapis.com/v18"
_ADS_SCOPE    = "https://www.googleapis.com/auth/adwords"


class GoogleAdsService:
    """
    Google Ads API client.

    Static helpers handle OAuth (no credentials needed).
    Instance methods require a valid access_token, customer_id, and developer_token.
    """

    # ── OAuth (static) ────────────────────────────────────────────────────────

    @staticmethod
    def build_oauth_url(client_id: str, redirect_uri: str, state: str) -> str:
        """Return the Google OAuth consent URL to open in a popup."""
        params = {
            "client_id":     client_id,
            "redirect_uri":  redirect_uri,
            "response_type": "code",
            "scope":         _ADS_SCOPE,
            "access_type":   "offline",   # required to receive refresh_token
            "prompt":        "consent",   # force refresh_token even on re-auth
            "state":         state,
        }
        return f"{_AUTH_URL}?{urlencode(params)}"

    @staticmethod
    def exchange_code_for_tokens(
        code: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> tuple[str, str]:
        """Exchange authorization code for (access_token, refresh_token)."""
        resp = _requests.post(
            _TOKEN_URL,
            data={
                "code":          code,
                "client_id":     client_id,
                "client_secret": client_secret,
                "redirect_uri":  redirect_uri,
                "grant_type":    "authorization_code",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        access_token  = data.get("access_token")
        refresh_token = data.get("refresh_token")
        if not access_token:
            raise ValueError(f"No access_token in Google token response: {data}")
        if not refresh_token:
            raise ValueError(
                "No refresh_token returned. Ensure access_type=offline and prompt=consent."
            )
        return access_token, refresh_token

    @staticmethod
    def refresh_access_token(
        refresh_token: str,
        client_id: str,
        client_secret: str,
    ) -> str:
        """Exchange a stored refresh_token for a fresh 1-hour access_token."""
        resp = _requests.post(
            _TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id":     client_id,
                "client_secret": client_secret,
                "grant_type":    "refresh_token",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        access_token = data.get("access_token")
        if not access_token:
            raise ValueError(f"Failed to refresh Google access token: {data}")
        return access_token

    @staticmethod
    def fetch_me(access_token: str) -> dict:
        """Return basic profile info for the authenticated Google user."""
        resp = _requests.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def list_accessible_customers(access_token: str, developer_token: str) -> list[dict]:
        """
        Return all Google Ads customer accounts accessible to this user.
        Each item: {id, name, descriptive_name}
        """
        headers = {
            "Authorization":  f"Bearer {access_token}",
            "developer-token": developer_token,
        }

        # 1. Get resource names of accessible customers
        resp = _requests.get(
            f"{_ADS_BASE}/customers:listAccessibleCustomers",
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        resource_names = resp.json().get("resourceNames", [])

        customers = []
        for resource_name in resource_names:
            # resource_name = "customers/1234567890"
            customer_id = resource_name.split("/")[-1]
            try:
                detail_resp = _requests.get(
                    f"{_ADS_BASE}/customers/{customer_id}",
                    headers={**headers, "login-customer-id": customer_id},
                    params={"fieldMask": "id,descriptiveName,currencyCode,timeZone"},
                    timeout=10,
                )
                detail_resp.raise_for_status()
                detail = detail_resp.json()
                customers.append({
                    "id":   str(detail.get("id", customer_id)),
                    "name": detail.get("descriptiveName") or f"Account {customer_id}",
                })
            except Exception as exc:
                logger.warning("Could not fetch details for customer %s: %s", customer_id, exc)
                customers.append({"id": customer_id, "name": f"Account {customer_id}"})

        return customers

    # ── Instance (per-request) ────────────────────────────────────────────────

    def __init__(self, access_token: str, customer_id: str, developer_token: str):
        self._access_token   = access_token
        self._customer_id    = customer_id.replace("-", "")  # strip dashes if any
        self._developer_token = developer_token

    def _headers(self) -> dict:
        return {
            "Authorization":    f"Bearer {self._access_token}",
            "developer-token":  self._developer_token,
            "login-customer-id": self._customer_id,
            "Content-Type":     "application/json",
        }

    def _post(self, path: str, body: dict) -> dict:
        url  = f"{_ADS_BASE}/customers/{self._customer_id}/{path}"
        resp = _requests.post(url, json=body, headers=self._headers(), timeout=30)
        if not resp.ok:
            raise RuntimeError(
                f"Google Ads API error {resp.status_code} at {path}: {resp.text[:400]}"
            )
        return resp.json()

    # ── Campaign helpers ──────────────────────────────────────────────────────

    def create_budget(self, name: str, daily_budget_micros: int) -> str:
        """Create a campaign budget and return its resource name."""
        result = self._post("campaignBudgets:mutate", {
            "operations": [{
                "create": {
                    "name":             name,
                    "amountMicros":     str(daily_budget_micros),
                    "deliveryMethod":   "STANDARD",
                    "explicitlyShared": False,
                }
            }]
        })
        return result["results"][0]["resourceName"]

    def create_campaign(
        self,
        name: str,
        budget_resource: str,
        targeting_countries: list[str],
    ) -> str:
        """Create a Display campaign (ENABLED) and return its resource name."""
        geo_targets = [
            {"geo_target_constant": f"geoTargetConstants/{_COUNTRY_CRITERION_IDS.get(c, '2036')}"}
            for c in targeting_countries
        ]
        body = {
            "operations": [{
                "create": {
                    "name":                      name,
                    "status":                    "ENABLED",
                    "advertisingChannelType":    "DISPLAY",
                    "campaignBudget":            budget_resource,
                    "targetSpend":               {},
                    "geoTargets":                geo_targets if geo_targets else [
                        {"geoTargetConstant": "geoTargetConstants/2036"}  # AU default
                    ],
                    "networkSettings": {
                        "targetContentNetwork": True,
                    },
                }
            }]
        }
        result = self._post("campaigns:mutate", body)
        return result["results"][0]["resourceName"]

    def create_ad_group(self, campaign_resource: str, name: str) -> str:
        """Create an ad group within the campaign and return its resource name."""
        result = self._post("adGroups:mutate", {
            "operations": [{
                "create": {
                    "name":     name,
                    "campaign": campaign_resource,
                    "status":   "ENABLED",
                    "type":     "DISPLAY_STANDARD",
                }
            }]
        })
        return result["results"][0]["resourceName"]

    def upload_image_asset(self, disk_path: str, asset_name: str) -> str:
        """Upload an image file as a Google Ads asset and return its resource name."""
        with open(disk_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()

        result = self._post("assets:mutate", {
            "operations": [{
                "create": {
                    "name":      asset_name,
                    "type":      "IMAGE",
                    "imageAsset": {"data": image_data},
                }
            }]
        })
        return result["results"][0]["resourceName"]

    def create_responsive_display_ad(
        self,
        ad_group_resource: str,
        headline: str,
        description: str,
        long_headline: str,
        business_name: str,
        image_asset_resource: str,
        final_url: str,
    ) -> str:
        """Create a ResponsiveDisplayAd in the ad group and return resource name."""
        result = self._post("adGroupAds:mutate", {
            "operations": [{
                "create": {
                    "adGroup": ad_group_resource,
                    "status":  "ENABLED",
                    "ad": {
                        "finalUrls": [final_url],
                        "responsiveDisplayAd": {
                            "headlines":      [{"text": headline[:30]}],
                            "longHeadline":   {"text": long_headline[:90]},
                            "descriptions":   [{"text": description[:90]}],
                            "businessName":   business_name[:25],
                            "marketingImages": [{
                                "asset": image_asset_resource,
                            }],
                            "squareMarketingImages": [{
                                "asset": image_asset_resource,
                            }],
                        }
                    }
                }
            }]
        })
        return result["results"][0]["resourceName"]

    # ── Full publish pipeline ─────────────────────────────────────────────────

    async def publish_campaign(
        self,
        campaign_name: str,
        creatives: list[dict],
        selected_indices: list[int],
        daily_budget_usd: float,
        destination_url: str,
        targeting_countries: list[str],
        backend_root: str,
        existing_campaign_id: Optional[str] = None,
    ) -> dict:
        """
        End-to-end: create campaign + ad group + ads on Google Ads.
        Returns {campaign_id, ad_group_id, ad_ids, ads_manager_url}.
        """
        # Resolve which creatives to publish
        if selected_indices:
            selected = [creatives[i] for i in selected_indices if i < len(creatives)]
        else:
            selected = creatives[:1]

        if not selected:
            raise ValueError("No creatives available to publish.")

        daily_budget_micros = int(daily_budget_usd * 1_000_000)

        # 1. Budget
        budget_resource = self.create_budget(
            name=f"{campaign_name} Budget",
            daily_budget_micros=daily_budget_micros,
        )

        # 2. Campaign (always create new — no reuse for Google Ads)
        campaign_resource = self.create_campaign(
            name=campaign_name,
            budget_resource=budget_resource,
            targeting_countries=targeting_countries,
        )
        campaign_id = campaign_resource.split("/")[-1]

        # 3. Ad group
        ad_group_resource = self.create_ad_group(
            campaign_resource=campaign_resource,
            name=f"{campaign_name} Ad Group",
        )
        ad_group_id = ad_group_resource.split("/")[-1]

        # 4. For each creative: upload image → create ad
        ad_ids = []
        for i, creative in enumerate(selected):
            # Resolve image path
            image_path = None
            if creative.get("image_path"):
                candidate = Path(backend_root) / creative["image_path"].lstrip("/")
                if candidate.exists():
                    image_path = str(candidate)

            if not image_path:
                logger.warning("Skipping creative %d — image file not found: %s", i, creative.get("image_path"))
                continue

            headline    = (creative.get("headline") or campaign_name)[:30]
            description = (creative.get("body") or creative.get("description") or "Learn more")[:90]
            long_headline = (creative.get("headline") or campaign_name)[:90]
            business_name = (creative.get("company") or campaign_name)[:25]

            asset_resource = self.upload_image_asset(
                disk_path=image_path,
                asset_name=f"{campaign_name} Image {i + 1}",
            )

            ad_resource = self.create_responsive_display_ad(
                ad_group_resource=ad_group_resource,
                headline=headline,
                description=description,
                long_headline=long_headline,
                business_name=business_name,
                image_asset_resource=asset_resource,
                final_url=destination_url,
            )
            ad_ids.append(ad_resource.split("/")[-1])

        if not ad_ids:
            raise FileNotFoundError(
                "No creative image files could be found on disk. "
                "Re-generate ad creatives before publishing."
            )

        ads_manager_url = (
            f"https://ads.google.com/aw/campaigns"
            f"?campaignId={campaign_id}"
            f"&__e={self._customer_id}"
        )

        return {
            "campaign_id":     campaign_id,
            "ad_group_id":     ad_group_id,
            "ad_ids":          ad_ids,
            "ads_manager_url": ads_manager_url,
        }


# ── Country → Google criterion ID mapping (top countries) ────────────────────
# Full list: https://developers.google.com/google-ads/api/data/geotargets
_COUNTRY_CRITERION_IDS: dict[str, str] = {
    "US": "2840",
    "GB": "2826",
    "CA": "2124",
    "AU": "2036",
    "NZ": "2554",
    "IE": "2372",
    "DE": "2276",
    "FR": "2250",
    "NL": "2528",
    "SE": "2752",
    "NO": "2578",
    "DK": "2208",
    "CH": "2756",
    "AT": "2040",
    "BE": "2056",
    "ES": "2724",
    "IT": "2380",
    "PT": "2620",
    "PL": "2616",
    "FI": "2246",
    "SG": "2702",
    "HK": "2344",
    "JP": "2392",
    "IN": "2356",
    "ZA": "2710",
    "BR": "2076",
    "MX": "2484",
    "AR": "2032",
    "MY": "2458",
    "PH": "2608",
}
