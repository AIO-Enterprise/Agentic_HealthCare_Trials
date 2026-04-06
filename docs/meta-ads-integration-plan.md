# Meta Ads on Facebook & Instagram
### Developer Reference Guide
> March 2026 | Graph API v24.0

---

## Table of Contents
1. [How Meta Ads Work](#1-how-meta-ads-work)
2. [Prerequisites](#2-prerequisites)
3. [Ad Modes](#3-ad-modes)
4. [API Endpoints](#4-api-endpoints)
5. [Reference URLs](#5-reference-urls)

---

## 1. How Meta Ads Work

Meta's advertising system runs across Facebook, Instagram, Messenger, and the Audience Network. All ad management — creation, targeting, budgeting, and analytics — is accessible programmatically through the **Meta Marketing API**, which is a subset of the **Graph API**.

### 1.1 The Ad Hierarchy

Every ad on Meta lives inside a strict parent-child structure. You must create each layer in order — a campaign first, then an ad set inside it, then an ad inside that.

```
Meta Business Manager
  └── Ad Account (act_XXXXXXXX)
        └── Campaign          ← defines the objective (Traffic, Leads, etc.)
              └── Ad Set      ← defines audience, budget, placements, schedule
                    └── Ad    ← defines the creative (image, headline, CTA) and destination
```

Supporting objects that attach to an ad:

- **Ad Creative** — the visual and copy content of the ad (image, headline, body, CTA button)
- **Lead Gen Form / Instant Form** — a native questionnaire shown inside Facebook/Instagram (used in Mode B only)
- **Meta Pixel** — a tracking script on your website that reports user actions back to Meta (used in Mode A)
- **Facebook Page** — every ad must be associated with a Page, even if the Page is minimal

### 1.2 The API

All API calls go to a single base URL:

```
https://graph.facebook.com/v24.0/
```

Every request is authenticated with a **Bearer Access Token** passed in the request header or as a query parameter. There is no separate SDK — all calls are plain HTTPS REST requests.

> ⚠️ **Graph API versions older than v22.0 are rejected as of September 2025. Always use v24.0 or later.**

### 1.3 Access Tokens

For server-to-server integrations (like this platform), a **System User Token** is the correct token type. It is generated inside Meta Business Manager, assigned specific permissions, and never expires. No user-facing OAuth login flow is required.

| Token Type | Lifespan | Use Case |
|---|---|---|
| User Access Token | 1–2 hours | Browser-based testing only |
| Long-Lived User Token | 60 days | Short-term server scripts |
| Page Access Token | Non-expiring | Page-level operations |
| **System User Token** | **Non-expiring** | **Server-to-server (use this)** |

### 1.4 Campaign Objectives

The campaign objective controls how Meta delivers the ad and what actions it optimises for. The two relevant objectives for this platform are:

| Objective | API Value | What Meta Optimises For | Used In |
|---|---|---|---|
| Traffic | `TRAFFIC` | Clicks to a URL or landing page views | Mode A |
| Lead Generation | `LEAD_GENERATION` | Submissions of a native Instant Form | Mode B |

---

## 2. Prerequisites

### 2.1 From the User / Client Standpoint

These are accounts and assets the client must set up before any campaign can run. These are one-time steps done inside Meta's own products — no code required.

| Step | Where | Notes |
|---|---|---|
| Create a personal Facebook account | facebook.com | Must be a real identity — Meta uses this for business verification |
| Create a Meta Business Manager | business.facebook.com | The root account that owns everything else |
| Create a Facebook Page | facebook.com/pages/create | Required for all ad types — even a basic page works |
| Create an Ad Account | Business Manager → Accounts → Ad Accounts | The billing entity — attach a payment method here |
| Business Verification (Mode B only) | Business Manager → Business Settings → Business Info | Required to get `leads_retrieval` approved. Takes 5–10 business days. Requires business registration documents. |

### 2.2 From the Application / Developer Standpoint

These are one-time developer setup steps done inside Meta's developer platform before any API call can succeed.

| Step | Where | Notes |
|---|---|---|
| Register a Meta Developer account | developers.facebook.com | Use the same Facebook account as the client |
| Create a Facebook App (type: Business) | developers.facebook.com/apps/create | This generates the App ID and App Secret used by the platform |
| Add the Marketing API product to the App | App Dashboard → Add Product → Marketing API | Unlocks access to ad management endpoints |
| Create a System User | Business Manager → System Users | Assign Admin role |
| Assign System User to the Ad Account | Business Manager → System Users → Add Assets | Give the System User full permissions on the Ad Account |
| Generate a System User Token | Business Manager → System Users → Generate Token | Select all required permission scopes (see below) |
| Create a Meta Pixel (Mode A) | Business Manager → Events Manager | Required for tracking landing page visits and firing Conversions API events |

### 2.3 Required API Permissions

These permission scopes must be selected when generating the System User Token.

#### Mode A (Traffic — Website Redirect)
| Permission | Purpose |
|---|---|
| `ads_management` | Create and manage campaigns, ad sets, ads, and creatives |
| `ads_read` | Read campaign performance, status, and insights |
| `pages_manage_ads` | Manage ads associated with the Facebook Page |
| `pages_read_engagement` | Read Page details required during ad creative creation |

> No App Review required for Mode A. These permissions are available immediately.

#### Mode B (Lead Generation — Native Form)
All permissions above, plus:

| Permission | Purpose |
|---|---|
| `leads_retrieval` | Fetch lead responses submitted through Instant Forms |

> `leads_retrieval` **requires Meta App Review** before it works in production. Approval takes 5–14 business days. Development and testing with test accounts work immediately without approval.

---

## 3. Ad Modes

This platform supports two modes of running ads on Meta. The mode is configured per campaign and determines the campaign objective, what the user experiences after clicking the ad, and where data is collected.

---

### Mode A — Website Redirect

**Campaign Objective:** `TRAFFIC`

The ad runs on Meta. When a user clicks the CTA button, they are redirected to a landing page on this platform. The eligibility questionnaire, lead capture, and routing logic all happen on the platform's own website. Meta only handles ad delivery.

**User Journey:**
```
User sees ad on Facebook/Instagram feed
  └── Clicks CTA button (e.g. "Learn More")
        └── Redirected to platform: /trial/{ad_id}
              └── Completes eligibility questionnaire on-platform
                    └── Eligibility evaluated
                          ├── Not eligible → informational message
                          └── Eligible → Call Now or Know More
```

**How Meta is involved:**
- Delivers the ad to the target audience
- Charges the Ad Account per click or landing page view
- Receives a server-side Conversions API (CAPI) event when the user submits the questionnaire — this tells Meta the ad resulted in a lead, without passing any health data

**Why this mode is recommended for healthcare/clinical trials:**
- The eligibility questionnaire never passes through Meta's systems
- No restriction on what questions can be asked (age, diagnosis, medication history, etc.)
- Fewer Meta policy restrictions apply compared to Lead Generation objective
- No App Review required to get started

---

### Mode B — Native Lead Form

**Campaign Objective:** `LEAD_GENERATION`

The ad includes a Meta-hosted Instant Form (also called a Lead Gen Form) shown natively inside the Facebook or Instagram app. The user fills out the questionnaire without leaving Meta. After submission, a webhook notifies the platform, which fetches the lead data and evaluates eligibility.

**User Journey:**
```
User sees ad on Facebook/Instagram feed
  └── Clicks CTA button (e.g. "Apply Now")
        └── Meta Instant Form opens inside the app
              └── User answers questions and submits
                    └── Meta Thank You screen shown
                          └── CTA: "See Your Results" → /trial/{ad_id}/engage
                                └── Platform displays eligibility result
                                      ├── Not eligible → message
                                      └── Eligible → Call Now or Know More
```

**How Meta is involved:**
- Delivers the ad and hosts the Instant Form inside its app
- Pre-fills contact fields (name, email, phone) from the user's Facebook profile
- Fires a webhook to the platform on each lead submission
- Charges the Ad Account per lead submitted

**Restrictions for healthcare advertisers:**
- Questions implying medical diagnosis, current medications, or health history are **not allowed** in Instant Forms and will cause ad rejection
- `leads_retrieval` permission and Meta App Review are required before production use
- The Lead Generation objective is subject to Meta's health and wellness category restrictions

**Compliant question types for Mode B:**
| Allowed | Not Allowed |
|---|---|
| Age range ("Are you between 18–65?") | Diagnosis ("Have you been diagnosed with X?") |
| Location / residency | Current medications |
| General availability | Mental health history |
| Contact information (pre-filled) | Any specific health condition |

---

### Mode Comparison

| | Mode A | Mode B |
|---|---|---|
| Campaign Objective | `TRAFFIC` | `LEAD_GENERATION` |
| Questionnaire Location | Platform website | Inside Facebook/Instagram |
| Health questions allowed | Yes — unrestricted | No — heavily restricted |
| App Review required | No | Yes (5–14 days) |
| Pixel / CAPI required | Yes | Optional |
| API calls to launch | 4 | 6 (includes form creation) |
| Recommended for clinical trials | ✅ Yes | ⚠️ Use with caution |

---

## 4. API Endpoints

All endpoints are relative to `https://graph.facebook.com/v24.0/`. All requests require an `Authorization: Bearer {system_user_token}` header.

### 4.1 Campaign Creation (Both Modes)

**Create Campaign**
```
POST /act_{ad_account_id}/campaigns
```
```json
{
  "name": "Trial Campaign Name",
  "objective": "TRAFFIC",
  "status": "PAUSED",
  "special_ad_categories": ["NONE"]
}
```
> Use `"objective": "LEAD_GENERATION"` for Mode B.
> Always create campaigns as `PAUSED` first — review before activating.

---

**Create Ad Set**
```
POST /act_{ad_account_id}/adsets
```
```json
{
  "name": "Ad Set Name",
  "campaign_id": "{campaign_id}",
  "daily_budget": 1000,
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "LANDING_PAGE_VIEWS",
  "targeting": {
    "age_min": 18,
    "age_max": 65,
    "geo_locations": { "countries": ["US"] }
  },
  "start_time": "2026-04-01T00:00:00+0000",
  "end_time": "2026-05-01T00:00:00+0000",
  "publisher_platforms": ["facebook", "instagram"],
  "is_adset_budget_sharing_enabled": true,
  "status": "PAUSED"
}
```
> `is_adset_budget_sharing_enabled` is **required** in v24.0.
> Do NOT include `facebook_video_feeds` in `publisher_platforms` — removed in v24.0.
> Use `"optimization_goal": "LEAD_GENERATION"` for Mode B.

---

**Upload Ad Image**
```
POST /act_{ad_account_id}/adimages
```
```json
{
  "filename": "ad_image.jpg",
  "{bytes}": "{base64_encoded_image}"
}
```
> Returns an `image_hash` used in the Ad Creative.

---

**Create Ad Creative**
```
POST /act_{ad_account_id}/adcreatives
```
```json
{
  "name": "Creative Name",
  "object_story_spec": {
    "page_id": "{page_id}",
    "link_data": {
      "image_hash": "{image_hash}",
      "link": "https://yourplatform.com/trial/{ad_id}",
      "message": "Body copy text here",
      "name": "Headline text here",
      "call_to_action": {
        "type": "LEARN_MORE",
        "value": { "link": "https://yourplatform.com/trial/{ad_id}" }
      }
    }
  }
}
```
> For Mode B, replace `"link"` with `"lead_gen_form_id": "{form_id}"`.

---

**Create Ad**
```
POST /act_{ad_account_id}/ads
```
```json
{
  "name": "Ad Name",
  "adset_id": "{adset_id}",
  "creative": { "creative_id": "{creative_id}" },
  "status": "ACTIVE"
}
```

---

### 4.2 Mode B — Instant Form Endpoints

**Create Lead Gen Form**
```
POST /{page_id}/leadgen_forms
```
```json
{
  "name": "Eligibility Form",
  "questions": [
    { "type": "CUSTOM", "label": "Are you between 18 and 65 years old?", "key": "age_range" },
    { "type": "CUSTOM", "label": "Are you a resident of the United States?", "key": "residency" },
    { "type": "EMAIL", "key": "email" },
    { "type": "PHONE", "key": "phone_number" }
  ],
  "privacy_policy": { "url": "https://yourplatform.com/privacy" },
  "thank_you_page": {
    "title": "Thank you!",
    "body": "We have received your response.",
    "cta_type": "VIEW_WEBSITE",
    "cta_link": "https://yourplatform.com/trial/{ad_id}/engage"
  }
}
```
> Returns a `form_id` — pass this into the Ad Creative as `lead_gen_form_id`.

---

**Fetch Leads from a Form**
```
GET /{form_id}/leads
  ?access_token={system_user_token}
  &fields=id,created_time,field_data
```
> Call this after receiving a webhook notification of a new lead.

---

**Webhook — Verify Endpoint (Meta calls this on setup)**
```
GET /api/meta/webhook
  ?hub.mode=subscribe
  &hub.verify_token={META_WEBHOOK_VERIFY_TOKEN}
  &hub.challenge={challenge_string}
```
> Your endpoint must return the `hub.challenge` value as plain text to complete verification.

**Webhook — Receive Lead Notification (Meta calls this on submission)**
```
POST /api/meta/webhook
```
```json
{
  "object": "page",
  "entry": [{
    "changes": [{
      "field": "leadgen",
      "value": {
        "form_id": "{form_id}",
        "leadgen_id": "{lead_id}",
        "page_id": "{page_id}",
        "adgroup_id": "{ad_id}"
      }
    }]
  }]
}
```
> On receipt, call `GET /{form_id}/leads` to fetch the actual field data.

---

### 4.3 Mode A — Conversions API (CAPI)

Fire a server-side event to Meta when a user submits the questionnaire on the platform.

```
POST /{pixel_id}/events
```
```json
{
  "data": [{
    "event_name": "Lead",
    "event_time": 1712000000,
    "action_source": "website",
    "user_data": {
      "em": "{sha256_hashed_email}",
      "ph": "{sha256_hashed_phone}"
    },
    "custom_data": {
      "campaign_id": "trial_{ad_id}"
    }
  }],
  "access_token": "{capi_access_token}"
}
```
> Never include health data, diagnosis fields, condition names, or eligibility results in CAPI payloads. Pass only hashed contact identifiers and neutral campaign identifiers.

---

### 4.4 Analytics & Insights

**Get Campaign Insights**
```
GET /{campaign_id}/insights
  ?fields=impressions,reach,clicks,spend,ctr,cpc,actions
  &date_preset=last_30d
  &access_token={system_user_token}
```

**Get Ad-Level Insights**
```
GET /{ad_id}/insights
  ?fields=impressions,reach,clicks,spend,ctr,cpc,actions
  &date_preset=last_7d
  &access_token={system_user_token}
```

---

### 4.5 Campaign Management

**Pause a Campaign**
```
POST /{campaign_id}
```
```json
{ "status": "PAUSED" }
```

**Resume a Campaign**
```
POST /{campaign_id}
```
```json
{ "status": "ACTIVE" }
```

**Get Campaign Status**
```
GET /{campaign_id}
  ?fields=id,name,status,objective,daily_budget
  &access_token={system_user_token}
```

---

## 5. Reference URLs

### Meta Account Setup
| Resource | URL |
|---|---|
| Meta Business Manager | https://business.facebook.com |
| Meta Developer Portal | https://developers.facebook.com |
| Create a Facebook App | https://developers.facebook.com/apps/create |
| Meta Ads Manager | https://www.facebook.com/adsmanager |
| Business Verification Guide | https://www.facebook.com/business/help/2058515294227817 |
| System Users Setup Guide | https://www.facebook.com/business/help/503306463479099 |

### Marketing API Documentation
| Resource | URL |
|---|---|
| Marketing API Overview | https://developers.facebook.com/docs/marketing-apis |
| Graph API v24.0 Changelog | https://developers.facebook.com/docs/graph-api/changelog/version24.0 |
| Campaign API Reference | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group |
| Ad Set API Reference | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign |
| Ad Creative API Reference | https://developers.facebook.com/docs/marketing-api/reference/ad-creative |
| Ad API Reference | https://developers.facebook.com/docs/marketing-api/reference/adgroup |
| Image Upload Reference | https://developers.facebook.com/docs/marketing-api/reference/ad-image |
| Insights / Analytics API | https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights |

### Lead Generation (Mode B)
| Resource | URL |
|---|---|
| Lead Ads Overview | https://developers.facebook.com/docs/marketing-api/guides/lead-ads |
| Instant Form (Lead Gen Form) API | https://developers.facebook.com/docs/marketing-api/reference/lead-ad-form |
| Retrieving Leads (Webhook + Fetch) | https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving |
| Webhook Setup Guide | https://developers.facebook.com/docs/graph-api/webhooks |

### Conversions API (Mode A — CAPI)
| Resource | URL |
|---|---|
| Conversions API Overview | https://developers.facebook.com/docs/marketing-api/conversions-api |
| CAPI Event Parameters | https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event |
| Meta Pixel Setup | https://developers.facebook.com/docs/meta-pixel |

### Permissions & App Review
| Resource | URL |
|---|---|
| App Review Overview | https://developers.facebook.com/docs/app-review |
| `leads_retrieval` Permission | https://developers.facebook.com/docs/permissions/reference/leads_retrieval |
| `ads_management` Permission | https://developers.facebook.com/docs/permissions/reference/ads_management |
| Graph API Explorer (testing) | https://developers.facebook.com/tools/explorer |

### Ad Policies (Healthcare)
| Resource | URL |
|---|---|
| Meta Advertising Standards | https://www.facebook.com/policies/ads |
| Health & Wellness Ad Policy | https://www.facebook.com/business/help/531525880677574 |
| Special Ad Categories | https://www.facebook.com/business/help/298000447747885 |
| Restricted Content Policy | https://www.facebook.com/policies/ads/restricted_content |

### Learning
| Resource | URL |
|---|---|
| Meta Blueprint (free courses) | https://www.facebook.com/business/learn |
| Meta for Developers Blog | https://developers.facebook.com/blog |
| Meta Ads Cost Guide | https://www.facebook.com/business/ads/ad-cost |