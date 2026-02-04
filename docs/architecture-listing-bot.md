# Real Estate Listing Bot - Architecture Document

> **Status:** Planning
> **Last Updated:** 2026-02-04
> **Author:** Engineering Team

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Components](#components)
4. [Data Flow](#data-flow)
5. [BigQuery Schema](#bigquery-schema)
6. [Firestore Schema](#firestore-schema)
7. [Cloud Functions](#cloud-functions)
8. [External Services](#external-services)
9. [Frontend Components](#frontend-components)
10. [Security](#security)
11. [Implementation Phases](#implementation-phases)
12. [Cost Estimates](#cost-estimates)

---

## Overview

### Purpose

The Real Estate Listing Bot is an AI-powered system that:

1. **Ingests** San Francisco MLS listings daily from the Repliers API
2. **Persists** all raw and processed data in BigQuery for analytics and history
3. **Enriches** listings with AI-generated summaries and insights via Google Gemini
4. **Matches** listings against user-defined filters stored in Firestore
5. **Delivers** personalized email digests to subscribed users via SendGrid

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MLS Data Provider | **Repliers API** | Raw field access, webhooks, comprehensive data |
| Primary Data Store | **BigQuery (rpk1)** | Analytics-ready, handles full history, cost-effective at scale |
| User Data Store | **Firestore** | Real-time sync with frontend, low latency for user preferences |
| Compute | **Cloud Functions (2nd gen)** | Serverless, scheduled triggers, Firebase integration |
| AI Processing | **Google Gemini** | Already integrated (@google/genai), strong summarization |
| Email Delivery | **SendGrid** | Reliable, free tier (100/day), good deliverability |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GOOGLE CLOUD PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                        montara-portal project                            │   │
│   │                                                                          │   │
│   │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │   │
│   │  │  Firebase        │    │  Cloud Firestore │    │  Cloud Functions │   │   │
│   │  │  Hosting         │    │                  │    │  (2nd gen)       │   │   │
│   │  │                  │    │  - users         │    │                  │   │   │
│   │  │  React Frontend  │◄──►│  - subscriptions │◄──►│  - mlsSync       │   │   │
│   │  │  (Vite + TS)     │    │  - filters       │    │  - mlsWebhook    │   │   │
│   │  │                  │    │  - email_logs    │    │  - emailDigest   │   │   │
│   │  └──────────────────┘    └──────────────────┘    │  - aiEnrichment  │   │   │
│   │           │                                       │  - queryListings │   │   │
│   │           │                                       └────────┬─────────┘   │   │
│   │           ▼                                                │             │   │
│   │  ┌──────────────────┐                                      │             │   │
│   │  │  Firebase Auth   │                                      │             │   │
│   │  │  (Google SSO)    │                                      │             │   │
│   │  │  @ruthkrishnan.com only                                 │             │   │
│   │  └──────────────────┘                                      │             │   │
│   └────────────────────────────────────────────────────────────│─────────────┘   │
│                                                                │                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                            rpk1 project                                  │   │
│   │                                                                          │   │
│   │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│   │  │                         BigQuery                                  │   │   │
│   │  │                      Dataset: mls_data                            │   │   │
│   │  │                                                                   │   │   │
│   │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │   │   │
│   │  │  │  listings   │ │  listing_   │ │   photos    │ │  market_    │ │   │   │
│   │  │  │             │ │  history    │ │             │ │  stats      │ │   │   │
│   │  │  │ - raw_data  │ │             │ │ - AI class  │ │             │ │   │   │
│   │  │  │ - AI fields │ │ - changes   │ │ - room type │ │ - metrics   │ │   │   │
│   │  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │   │   │
│   │  └──────────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                            ▲                                     │
└────────────────────────────────────────────│─────────────────────────────────────┘
                                             │
           ┌─────────────────────────────────┼─────────────────────────────────┐
           │                                 │                                 │
           ▼                                 ▼                                 ▼
  ┌──────────────────┐            ┌──────────────────┐            ┌──────────────────┐
  │   Repliers API   │            │     SendGrid     │            │  Google Gemini   │
  │                  │            │                  │            │                  │
  │  - MLS listings  │            │  - Email digest  │            │  - AI summaries  │
  │  - Raw fields    │            │  - Tracking      │            │  - Insights      │
  │  - Photos/media  │            │  - Unsubscribe   │            │  - Analysis      │
  │  - Webhooks      │            │                  │            │                  │
  └──────────────────┘            └──────────────────┘            └──────────────────┘
```

---

## Components

### 1. Frontend (montara-portal)

| Component | Technology | Purpose |
|-----------|------------|---------|
| React App | React 18 + TypeScript + Vite | User interface |
| Firebase Hosting | Firebase | Static hosting |
| Firebase Auth | Google SSO | Authentication (@ruthkrishnan.com) |

### 2. Backend (Cloud Functions)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `mlsSync` | Scheduled (5am PT daily) | Full sync from Repliers → BigQuery |
| `mlsWebhook` | HTTP (Repliers webhook) | Real-time updates → BigQuery |
| `aiEnrichment` | Scheduled (5:30am PT) | Process new listings with Gemini |
| `emailDigest` | Scheduled (7am PT daily) | Match filters & send emails |
| `queryListings` | HTTP | Frontend queries to BigQuery |

### 3. Data Stores

| Store | Project | Purpose |
|-------|---------|---------|
| BigQuery | rpk1 | All MLS data, history, analytics |
| Firestore | montara-portal | User preferences, subscriptions, filters |

### 4. External Services

| Service | Purpose | Pricing |
|---------|---------|---------|
| Repliers | MLS data source | ~$300/month |
| SendGrid | Email delivery | Free (100/day) |
| Google Gemini | AI processing | ~$5-15/month |

---

## Data Flow

### Daily Sync Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│Repliers │────►│  mlsSync    │────►│  BigQuery   │────►│  Done    │
│  API    │     │  Function   │     │  listings   │     │          │
└─────────┘     └─────────────┘     └─────────────┘     └──────────┘
   5:00am            5:00am              5:00am

┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│BigQuery │────►│aiEnrichment │────►│  BigQuery   │────►│  Done    │
│listings │     │  Function   │     │  (updated)  │     │          │
└─────────┘     └─────────────┘     └─────────────┘     └──────────┘
   5:30am            5:30am              5:30am
```

### Email Digest Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Firestore │────►│  Match   │────►│ BigQuery │────►│ SendGrid │────►│  User    │
│ filters  │     │  Engine  │     │ listings │     │  Email   │     │  Inbox   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                    7:00am PT daily
```

### Real-time Webhook Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│Repliers │────►│ mlsWebhook  │────►│  BigQuery   │────►│  Done    │
│ Webhook │     │  Function   │     │ (streaming) │     │          │
└─────────┘     └─────────────┘     └─────────────┘     └──────────┘
   Real-time         <1 min              <1 min
```

---

## BigQuery Schema

### Project: `rpk1`
### Dataset: `mls_data`

### Table: `listings`

Primary table storing all MLS listing data with full raw JSON preservation.

```sql
CREATE TABLE rpk1.mls_data.listings (
  -- Primary identifiers
  id STRING NOT NULL,                    -- Repliers listing ID
  mls_id STRING,                         -- Original MLS ID
  mls_source STRING,                     -- e.g., "SFAR", "CRMLS"

  -- Listing status
  status STRING,                         -- Active, Pending, Sold, Expired, Withdrawn
  list_price FLOAT64,
  sold_price FLOAT64,
  original_list_price FLOAT64,
  list_date DATE,
  sold_date DATE,
  pending_date DATE,
  expiration_date DATE,
  days_on_market INT64,
  cumulative_dom INT64,                  -- Cumulative days on market

  -- Location
  address STRING,
  unit_number STRING,
  city STRING,
  state STRING,
  zip STRING,
  neighborhood STRING,
  county STRING,
  latitude FLOAT64,
  longitude FLOAT64,

  -- Property characteristics
  property_type STRING,                  -- Single Family, Condo, Townhouse, Multi-Family
  property_subtype STRING,
  beds INT64,
  baths FLOAT64,
  baths_full INT64,
  baths_half INT64,
  sqft INT64,
  lot_sqft INT64,
  lot_acres FLOAT64,
  year_built INT64,
  stories INT64,
  parking_spaces INT64,
  garage_spaces INT64,

  -- Features (arrays)
  features ARRAY<STRING>,                -- Pool, View, Fireplace, etc.
  appliances ARRAY<STRING>,
  interior_features ARRAY<STRING>,
  exterior_features ARRAY<STRING>,
  heating ARRAY<STRING>,
  cooling ARRAY<STRING>,
  flooring ARRAY<STRING>,
  roof STRING,
  construction_materials ARRAY<STRING>,

  -- HOA & Financials
  hoa_fee FLOAT64,
  hoa_fee_frequency STRING,              -- Monthly, Quarterly, Annual
  tax_annual FLOAT64,
  tax_year INT64,
  zoning STRING,

  -- Description & Remarks
  description STRING,                    -- Public remarks
  private_remarks STRING,                -- Agent remarks (if accessible)
  directions STRING,

  -- Agent & Office
  listing_agent_id STRING,
  listing_agent_name STRING,
  listing_agent_email STRING,
  listing_agent_phone STRING,
  listing_office_id STRING,
  listing_office_name STRING,

  -- Co-listing (if applicable)
  co_listing_agent_name STRING,
  co_listing_office_name STRING,

  -- Buyer side (for sold listings)
  buyer_agent_name STRING,
  buyer_office_name STRING,

  -- Media
  photo_count INT64,
  virtual_tour_url STRING,
  video_url STRING,

  -- AI Enrichment (populated by aiEnrichment function)
  ai_summary STRING,                     -- 2-3 sentence summary
  ai_price_analysis STRING,              -- Price vs market analysis
  ai_highlights ARRAY<STRING>,           -- Key selling points
  ai_concerns ARRAY<STRING>,             -- Potential issues to investigate
  ai_neighborhood_summary STRING,        -- Neighborhood context
  ai_processed_at TIMESTAMP,
  ai_model_version STRING,               -- e.g., "gemini-1.5-flash"

  -- Raw data (CRITICAL: preserves all original MLS fields)
  raw_data JSON,                         -- Full Repliers API response

  -- Metadata
  created_at TIMESTAMP,                  -- First seen
  updated_at TIMESTAMP,                  -- Last modified in MLS
  ingested_at TIMESTAMP,                 -- When we pulled it

  -- Partitioning
  _partition_date DATE                   -- For table partitioning
)
PARTITION BY _partition_date
CLUSTER BY city, status, property_type, neighborhood
OPTIONS (
  description = 'San Francisco MLS listings with full raw data preservation',
  labels = [('team', 'montara'), ('data_source', 'repliers')]
);
```

### Table: `listing_history`

Tracks all changes to listings over time for trend analysis.

```sql
CREATE TABLE rpk1.mls_data.listing_history (
  id STRING NOT NULL,                    -- Unique event ID
  listing_id STRING NOT NULL,            -- FK to listings.id
  mls_id STRING,

  -- Event details
  event_type STRING NOT NULL,            -- new_listing, price_change, status_change, update
  event_timestamp TIMESTAMP NOT NULL,

  -- Price tracking
  previous_price FLOAT64,
  new_price FLOAT64,
  price_change_amount FLOAT64,
  price_change_percent FLOAT64,

  -- Status tracking
  previous_status STRING,
  new_status STRING,

  -- Days tracking
  dom_at_event INT64,                    -- Days on market when event occurred

  -- Changed fields (for debugging/audit)
  changed_fields ARRAY<STRING>,          -- List of fields that changed

  -- Snapshot (optional, for full point-in-time reconstruction)
  snapshot JSON,

  -- Metadata
  created_at TIMESTAMP
)
PARTITION BY DATE(event_timestamp)
CLUSTER BY listing_id, event_type
OPTIONS (
  description = 'Historical tracking of all listing changes'
);
```

### Table: `photos`

Stores photo metadata with AI classification from Repliers.

```sql
CREATE TABLE rpk1.mls_data.photos (
  id STRING NOT NULL,                    -- Unique photo ID
  listing_id STRING NOT NULL,            -- FK to listings.id
  mls_id STRING,

  -- URLs
  original_url STRING,                   -- Original MLS URL
  cdn_url STRING,                        -- Repliers CDN URL (optimized)
  thumbnail_url STRING,

  -- Ordering
  sequence_number INT64,                 -- Order in listing gallery
  is_primary BOOL,                       -- Is this the main photo?

  -- AI Classification (from Repliers Photo Insights)
  room_type STRING,                      -- kitchen, bedroom, bathroom, exterior, etc.
  room_type_confidence FLOAT64,          -- 0.0 - 1.0
  detected_objects ARRAY<STRING>,        -- appliances, furniture, features
  quality_score FLOAT64,                 -- Image quality rating
  brightness_score FLOAT64,
  caption STRING,                        -- AI-generated description

  -- Image metadata
  width INT64,
  height INT64,
  file_size_bytes INT64,
  format STRING,                         -- jpg, png, webp

  -- Metadata
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
CLUSTER BY listing_id, room_type
OPTIONS (
  description = 'Listing photos with AI classification'
);
```

### Table: `market_stats`

Aggregated market statistics for trend analysis and reporting.

```sql
CREATE TABLE rpk1.mls_data.market_stats (
  id STRING NOT NULL,

  -- Dimensions
  stat_date DATE NOT NULL,
  granularity STRING,                    -- daily, weekly, monthly
  city STRING,
  neighborhood STRING,
  zip STRING,
  property_type STRING,
  beds_bucket STRING,                    -- '1', '2', '3', '4', '5+'
  price_bucket STRING,                   -- '<500k', '500k-1m', '1m-2m', '2m-5m', '5m+'

  -- Inventory metrics
  active_count INT64,
  new_listings_count INT64,
  pending_count INT64,
  sold_count INT64,
  expired_count INT64,
  withdrawn_count INT64,
  back_on_market_count INT64,

  -- Price metrics
  median_list_price FLOAT64,
  avg_list_price FLOAT64,
  median_sold_price FLOAT64,
  avg_sold_price FLOAT64,
  median_price_per_sqft FLOAT64,
  avg_price_per_sqft FLOAT64,

  -- Price change metrics
  median_price_change_pct FLOAT64,       -- From original to final price
  pct_with_price_reduction FLOAT64,

  -- Time metrics
  median_dom INT64,                      -- Days on market
  avg_dom FLOAT64,
  median_days_to_pending INT64,

  -- Sale metrics
  sale_to_list_ratio FLOAT64,            -- Avg sold_price / list_price
  pct_over_asking FLOAT64,

  -- Supply metrics
  months_of_supply FLOAT64,              -- Active / (Sold per month)
  absorption_rate FLOAT64,

  -- Metadata
  listings_analyzed INT64,               -- Sample size
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
PARTITION BY stat_date
CLUSTER BY city, neighborhood, property_type
OPTIONS (
  description = 'Aggregated market statistics by geography and property type'
);
```

### Views

```sql
-- Active San Francisco listings (last 90 days)
CREATE VIEW rpk1.mls_data.v_active_sf_listings AS
SELECT *
FROM rpk1.mls_data.listings
WHERE status = 'Active'
  AND city = 'San Francisco'
  AND _partition_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY);

-- New listings today
CREATE VIEW rpk1.mls_data.v_new_listings_today AS
SELECT *
FROM rpk1.mls_data.listings
WHERE DATE(created_at) = CURRENT_DATE()
  AND city = 'San Francisco';

-- Price reductions (last 7 days)
CREATE VIEW rpk1.mls_data.v_recent_price_reductions AS
SELECT
  l.*,
  h.previous_price,
  h.price_change_percent
FROM rpk1.mls_data.listings l
JOIN rpk1.mls_data.listing_history h ON l.id = h.listing_id
WHERE h.event_type = 'price_change'
  AND h.price_change_amount < 0
  AND h.event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND l.city = 'San Francisco';
```

---

## Firestore Schema

User-specific data stored in Firestore (montara-portal project) for real-time frontend sync.

### Collection: `users`

```typescript
interface User {
  // Document ID: Firebase Auth UID
  email: string;
  displayName: string;
  photoURL: string;
  domain: string;                        // ruthkrishnan.com
  createdAt: Timestamp;
  lastLogin: Timestamp;
}
```

### Collection: `subscriptions`

```typescript
interface Subscription {
  // Document ID: auto-generated
  userId: string;                        // FK to users
  email: string;                         // Delivery email
  isActive: boolean;                     // Master on/off switch

  // Schedule
  frequency: 'daily' | 'weekly';
  preferredTime: string;                 // '07:00'
  timezone: string;                      // 'America/Los_Angeles'
  weeklyDay?: number;                    // 0-6 for weekly (0 = Sunday)

  // Tracking
  lastEmailSent: Timestamp | null;
  emailsSentCount: number;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `filters`

```typescript
interface Filter {
  // Document ID: auto-generated
  userId: string;                        // FK to users
  subscriptionId: string;                // FK to subscriptions
  name: string;                          // User-friendly name
  isDefault: boolean;
  isActive: boolean;

  // Filter criteria
  criteria: FilterCriteria;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface FilterCriteria {
  // Location
  neighborhoods: string[];               // e.g., ['Pacific Heights', 'Marina']
  zipCodes: string[];

  // Price
  priceMin: number | null;
  priceMax: number | null;

  // Property characteristics
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  lotSqftMin: number | null;
  yearBuiltMin: number | null;

  // Property types
  propertyTypes: string[];               // ['Single Family', 'Condo']

  // Parking
  parkingSpacesMin: number | null;
  garageSpacesMin: number | null;

  // Features
  mustHaveFeatures: string[];            // ['Pool', 'View']
  niceToHaveFeatures: string[];

  // Keywords
  includeKeywords: string[];             // Search in description
  excludeKeywords: string[];

  // Listing status
  includeStatuses: string[];             // ['Active', 'Coming Soon']

  // Other
  maxDom: number | null;                 // Max days on market
  maxHoaFee: number | null;
}
```

### Collection: `emailLogs`

```typescript
interface EmailLog {
  // Document ID: auto-generated
  userId: string;
  subscriptionId: string;
  filterId: string;

  // Email details
  sentAt: Timestamp;
  recipientEmail: string;
  subject: string;

  // Content
  listingCount: number;
  listingIds: string[];                  // BigQuery listing IDs included

  // Status
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sendgridMessageId: string | null;

  // Error tracking
  errorMessage: string | null;
  errorCode: string | null;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: Check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: Check if user owns the resource
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Helper: Check allowed email domain
    function isAllowedDomain() {
      return request.auth.token.email.matches('.*@ruthkrishnan[.]com$');
    }

    // Users collection
    match /users/{userId} {
      allow read: if isOwner(userId) && isAllowedDomain();
      allow create: if isOwner(userId) && isAllowedDomain();
      allow update: if isOwner(userId) && isAllowedDomain();
      allow delete: if false;
    }

    // Subscriptions collection
    match /subscriptions/{subscriptionId} {
      allow read: if isAuthenticated() &&
                    isAllowedDomain() &&
                    resource.data.userId == request.auth.uid;
      allow create: if isAuthenticated() &&
                     isAllowedDomain() &&
                     request.resource.data.userId == request.auth.uid;
      allow update: if isAuthenticated() &&
                     isAllowedDomain() &&
                     resource.data.userId == request.auth.uid;
      allow delete: if isAuthenticated() &&
                     isAllowedDomain() &&
                     resource.data.userId == request.auth.uid;
    }

    // Filters collection
    match /filters/{filterId} {
      allow read: if isAuthenticated() &&
                    isAllowedDomain() &&
                    resource.data.userId == request.auth.uid;
      allow create: if isAuthenticated() &&
                     isAllowedDomain() &&
                     request.resource.data.userId == request.auth.uid;
      allow update: if isAuthenticated() &&
                     isAllowedDomain() &&
                     resource.data.userId == request.auth.uid;
      allow delete: if isAuthenticated() &&
                     isAllowedDomain() &&
                     resource.data.userId == request.auth.uid;
    }

    // Email logs - read only for own logs
    match /emailLogs/{logId} {
      allow read: if isAuthenticated() &&
                    isAllowedDomain() &&
                    resource.data.userId == request.auth.uid;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

---

## Cloud Functions

### Directory Structure

```
functions/
├── src/
│   ├── index.ts                         # Main exports
│   │
│   ├── config/
│   │   ├── firebase.ts                  # Firebase Admin init
│   │   ├── bigquery.ts                  # BigQuery client (rpk1)
│   │   └── secrets.ts                   # Secret Manager refs
│   │
│   ├── scheduled/
│   │   ├── mlsSync.ts                   # Daily Repliers → BigQuery sync
│   │   ├── aiEnrichment.ts              # Gemini AI processing
│   │   ├── emailDigest.ts               # Daily email sending
│   │   └── marketStats.ts               # Weekly stats aggregation
│   │
│   ├── webhooks/
│   │   └── repliersWebhook.ts           # Real-time listing updates
│   │
│   ├── api/
│   │   ├── listings.ts                  # Query listings for frontend
│   │   ├── stats.ts                     # Market stats endpoint
│   │   └── health.ts                    # Health check endpoint
│   │
│   ├── services/
│   │   ├── repliers/
│   │   │   ├── client.ts                # Repliers API client
│   │   │   ├── types.ts                 # Repliers response types
│   │   │   └── transformer.ts           # Raw → BigQuery schema
│   │   │
│   │   ├── bigquery/
│   │   │   ├── client.ts                # BigQuery client setup
│   │   │   ├── listings.ts              # Listing CRUD operations
│   │   │   ├── history.ts               # History tracking
│   │   │   ├── photos.ts                # Photo operations
│   │   │   └── streaming.ts             # Streaming inserts
│   │   │
│   │   ├── gemini/
│   │   │   ├── client.ts                # Gemini API client
│   │   │   ├── prompts.ts               # AI prompt templates
│   │   │   └── types.ts                 # AI response types
│   │   │
│   │   ├── email/
│   │   │   ├── sendgrid.ts              # SendGrid client
│   │   │   └── templates/
│   │   │       ├── dailyDigest.ts       # Daily email template
│   │   │       ├── weeklyDigest.ts      # Weekly summary template
│   │   │       └── components.ts        # Reusable email components
│   │   │
│   │   └── firestore/
│   │       ├── users.ts                 # User operations
│   │       ├── subscriptions.ts         # Subscription operations
│   │       ├── filters.ts               # Filter operations
│   │       └── emailLogs.ts             # Email log operations
│   │
│   ├── triggers/
│   │   ├── onUserCreate.ts              # Create default subscription
│   │   └── onSubscriptionUpdate.ts      # Handle subscription changes
│   │
│   └── utils/
│       ├── logger.ts                    # Structured logging
│       ├── errors.ts                    # Error handling
│       ├── validation.ts                # Input validation
│       ├── filterMatcher.ts             # Apply filters to listings
│       └── constants/
│           ├── neighborhoods.ts         # SF neighborhood list
│           └── propertyTypes.ts         # Property type mappings
│
├── package.json
├── tsconfig.json
└── .env.example
```

### Function: `mlsSync` (Daily Full Sync)

```typescript
// functions/src/scheduled/mlsSync.ts

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { BigQuery } from '@google-cloud/bigquery';
import { defineSecret } from 'firebase-functions/params';
import { RepliersClient } from '../services/repliers/client';
import { transformListing, detectChanges } from '../services/repliers/transformer';
import { logger } from '../utils/logger';

const REPLIERS_API_KEY = defineSecret('REPLIERS_API_KEY');

const bigquery = new BigQuery({ projectId: 'rpk1' });

export const mlsSync = onSchedule(
  {
    schedule: '0 5 * * *',               // 5:00 AM PT daily
    timeZone: 'America/Los_Angeles',
    secrets: [REPLIERS_API_KEY],
    memory: '2GiB',
    timeoutSeconds: 540,                 // 9 minutes
    retryCount: 3,
  },
  async (event) => {
    logger.info('Starting daily MLS sync');

    const repliers = new RepliersClient(REPLIERS_API_KEY.value());
    const dataset = bigquery.dataset('mls_data');
    const listingsTable = dataset.table('listings');
    const historyTable = dataset.table('listing_history');

    let totalProcessed = 0;
    let newListings = 0;
    let updatedListings = 0;

    try {
      // Fetch listings in batches (Repliers paginates at 200)
      let hasMore = true;
      let offset = 0;
      const batchSize = 200;

      while (hasMore) {
        const response = await repliers.getListings({
          city: 'San Francisco',
          status: ['Active', 'Pending', 'Coming Soon'],
          fields: 'raw',                 // Get ALL raw fields
          limit: batchSize,
          offset: offset,
          updatedWithin: '24h',          // Only listings changed in last 24h
        });

        const listings = response.listings;
        hasMore = listings.length === batchSize;
        offset += batchSize;

        if (listings.length === 0) break;

        // Get existing listings for change detection
        const listingIds = listings.map(l => l.id);
        const [existingRows] = await bigquery.query({
          query: `
            SELECT id, list_price, status, updated_at
            FROM rpk1.mls_data.listings
            WHERE id IN UNNEST(@ids)
          `,
          params: { ids: listingIds },
        });
        const existingMap = new Map(existingRows.map(r => [r.id, r]));

        // Transform and prepare rows
        const listingRows = [];
        const historyRows = [];
        const now = new Date();

        for (const listing of listings) {
          const transformed = transformListing(listing);
          const existing = existingMap.get(listing.id);

          // Prepare listing row
          listingRows.push({
            ...transformed,
            raw_data: JSON.stringify(listing),
            ingested_at: now.toISOString(),
            _partition_date: now.toISOString().split('T')[0],
          });

          // Track history
          if (!existing) {
            newListings++;
            historyRows.push({
              id: `${listing.id}-${now.getTime()}`,
              listing_id: listing.id,
              mls_id: listing.mlsId,
              event_type: 'new_listing',
              event_timestamp: now.toISOString(),
              new_price: transformed.list_price,
              new_status: transformed.status,
              created_at: now.toISOString(),
            });
          } else {
            const changes = detectChanges(existing, transformed);
            if (changes.length > 0) {
              updatedListings++;
              historyRows.push({
                id: `${listing.id}-${now.getTime()}`,
                listing_id: listing.id,
                mls_id: listing.mlsId,
                event_type: changes.includes('list_price') ? 'price_change' :
                           changes.includes('status') ? 'status_change' : 'update',
                event_timestamp: now.toISOString(),
                previous_price: existing.list_price,
                new_price: transformed.list_price,
                price_change_amount: transformed.list_price - existing.list_price,
                price_change_percent: ((transformed.list_price - existing.list_price) / existing.list_price) * 100,
                previous_status: existing.status,
                new_status: transformed.status,
                changed_fields: changes,
                created_at: now.toISOString(),
              });
            }
          }
        }

        // Insert into BigQuery (merge/upsert via streaming + dedup)
        if (listingRows.length > 0) {
          await listingsTable.insert(listingRows, {
            ignoreUnknownValues: true,
            skipInvalidRows: false,
          });
        }

        if (historyRows.length > 0) {
          await historyTable.insert(historyRows);
        }

        totalProcessed += listings.length;
        logger.info(`Processed batch: ${listings.length} listings (offset: ${offset})`);
      }

      logger.info('MLS sync completed', {
        totalProcessed,
        newListings,
        updatedListings,
      });

    } catch (error) {
      logger.error('MLS sync failed', { error });
      throw error;
    }
  }
);
```

### Function: `aiEnrichment` (AI Processing)

```typescript
// functions/src/scheduled/aiEnrichment.ts

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { BigQuery } from '@google-cloud/bigquery';
import { defineSecret } from 'firebase-functions/params';
import { GeminiClient } from '../services/gemini/client';
import { LISTING_ANALYSIS_PROMPT } from '../services/gemini/prompts';
import { logger } from '../utils/logger';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const bigquery = new BigQuery({ projectId: 'rpk1' });

export const aiEnrichment = onSchedule(
  {
    schedule: '30 5 * * *',              // 5:30 AM PT (after mlsSync)
    timeZone: 'America/Los_Angeles',
    secrets: [GEMINI_API_KEY],
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    logger.info('Starting AI enrichment');

    const gemini = new GeminiClient(GEMINI_API_KEY.value());

    // Get listings without AI processing (or stale)
    const [rows] = await bigquery.query({
      query: `
        SELECT id, address, neighborhood, list_price, beds, baths, sqft,
               property_type, year_built, description, features
        FROM rpk1.mls_data.listings
        WHERE city = 'San Francisco'
          AND status = 'Active'
          AND (ai_processed_at IS NULL
               OR ai_processed_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY))
        ORDER BY created_at DESC
        LIMIT 100
      `,
    });

    logger.info(`Processing ${rows.length} listings with AI`);

    const updates = [];

    for (const listing of rows) {
      try {
        const analysis = await gemini.analyzeListing({
          address: listing.address,
          neighborhood: listing.neighborhood,
          price: listing.list_price,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          propertyType: listing.property_type,
          yearBuilt: listing.year_built,
          description: listing.description,
          features: listing.features,
        });

        updates.push({
          id: listing.id,
          ai_summary: analysis.summary,
          ai_price_analysis: analysis.priceAnalysis,
          ai_highlights: analysis.highlights,
          ai_concerns: analysis.concerns,
          ai_neighborhood_summary: analysis.neighborhoodSummary,
          ai_processed_at: new Date().toISOString(),
          ai_model_version: 'gemini-1.5-flash',
        });

        // Rate limiting: 1 request per second
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        logger.error(`AI processing failed for ${listing.id}`, { error });
      }
    }

    // Batch update BigQuery
    if (updates.length > 0) {
      const updateQuery = `
        UPDATE rpk1.mls_data.listings
        SET ai_summary = updates.ai_summary,
            ai_price_analysis = updates.ai_price_analysis,
            ai_highlights = updates.ai_highlights,
            ai_concerns = updates.ai_concerns,
            ai_neighborhood_summary = updates.ai_neighborhood_summary,
            ai_processed_at = PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', updates.ai_processed_at),
            ai_model_version = updates.ai_model_version
        FROM UNNEST(@updates) AS updates
        WHERE listings.id = updates.id
      `;

      await bigquery.query({
        query: updateQuery,
        params: { updates },
      });
    }

    logger.info('AI enrichment completed', { processed: updates.length });
  }
);
```

### Function: `emailDigest` (Daily Emails)

```typescript
// functions/src/scheduled/emailDigest.ts

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { BigQuery } from '@google-cloud/bigquery';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { SendGridClient } from '../services/email/sendgrid';
import { generateDailyDigestHtml } from '../services/email/templates/dailyDigest';
import { applyFilters } from '../utils/filterMatcher';
import { logger } from '../utils/logger';

const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');

const bigquery = new BigQuery({ projectId: 'rpk1' });
const firestore = getFirestore();

export const emailDigest = onSchedule(
  {
    schedule: '0 7 * * *',               // 7:00 AM PT
    timeZone: 'America/Los_Angeles',
    secrets: [SENDGRID_API_KEY],
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    logger.info('Starting daily email digest');

    const sendgrid = new SendGridClient(SENDGRID_API_KEY.value());

    // Get active daily subscriptions
    const subscriptionsSnapshot = await firestore
      .collection('subscriptions')
      .where('isActive', '==', true)
      .where('frequency', '==', 'daily')
      .get();

    logger.info(`Processing ${subscriptionsSnapshot.size} subscriptions`);

    // Get new listings from last 24 hours
    const [listings] = await bigquery.query({
      query: `
        SELECT *
        FROM rpk1.mls_data.listings
        WHERE city = 'San Francisco'
          AND status IN ('Active', 'Coming Soon')
          AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        ORDER BY list_price DESC
      `,
    });

    logger.info(`Found ${listings.length} new listings`);

    if (listings.length === 0) {
      logger.info('No new listings, skipping emails');
      return;
    }

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const subscriptionDoc of subscriptionsSnapshot.docs) {
      const subscription = subscriptionDoc.data();

      try {
        // Get user's filters
        const filtersSnapshot = await firestore
          .collection('filters')
          .where('subscriptionId', '==', subscriptionDoc.id)
          .where('isActive', '==', true)
          .get();

        // Apply filters to listings
        let matchedListings = listings;
        let filterName = 'All Listings';

        if (!filtersSnapshot.empty) {
          const filter = filtersSnapshot.docs[0].data();
          filterName = filter.name;
          matchedListings = applyFilters(listings, filter.criteria);
        }

        if (matchedListings.length === 0) {
          logger.info(`No matches for ${subscription.email}`);
          continue;
        }

        // Generate and send email
        const html = generateDailyDigestHtml({
          listings: matchedListings.slice(0, 20), // Max 20 per email
          filterName,
          date: new Date(),
          totalMatches: matchedListings.length,
        });

        const messageId = await sendgrid.send({
          to: subscription.email,
          subject: `${matchedListings.length} New SF Listings - ${formatDate(new Date())}`,
          html,
        });

        // Log email
        await firestore.collection('emailLogs').add({
          userId: subscription.userId,
          subscriptionId: subscriptionDoc.id,
          filterId: filtersSnapshot.empty ? null : filtersSnapshot.docs[0].id,
          sentAt: new Date(),
          recipientEmail: subscription.email,
          subject: `${matchedListings.length} New SF Listings`,
          listingCount: matchedListings.length,
          listingIds: matchedListings.slice(0, 20).map(l => l.id),
          status: 'sent',
          sendgridMessageId: messageId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Update subscription
        await subscriptionDoc.ref.update({
          lastEmailSent: new Date(),
          emailsSentCount: (subscription.emailsSentCount || 0) + 1,
        });

        emailsSent++;
        logger.info(`Sent ${matchedListings.length} listings to ${subscription.email}`);

      } catch (error) {
        emailsFailed++;
        logger.error(`Failed to send to ${subscription.email}`, { error });

        await firestore.collection('emailLogs').add({
          userId: subscription.userId,
          subscriptionId: subscriptionDoc.id,
          sentAt: new Date(),
          recipientEmail: subscription.email,
          status: 'failed',
          errorMessage: error.message,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    logger.info('Email digest completed', { emailsSent, emailsFailed });
  }
);
```

---

## External Services

### Repliers API

**Purpose:** San Francisco MLS data source with raw field access

**Configuration:**
```typescript
// functions/src/services/repliers/client.ts

const REPLIERS_BASE_URL = 'https://api.repliers.io';

interface RepliersConfig {
  apiKey: string;
  boardId?: string;        // SF MLS board ID
  timeout?: number;        // Request timeout (ms)
}

// Key endpoints:
// GET /listings          - Search/filter listings
// GET /listings/{id}     - Single listing with full details
// GET /listings/{id}/history - Price/status history
// GET /statistics        - Market stats
// POST /webhooks         - Register for real-time updates
```

**Webhook Setup:**
```typescript
// Register webhook for real-time updates
await repliers.registerWebhook({
  url: 'https://us-central1-montara-portal.cloudfunctions.net/repliersWebhook',
  events: ['listing.created', 'listing.updated', 'listing.sold'],
  filters: {
    city: 'San Francisco',
  },
});
```

### SendGrid

**Purpose:** Email delivery with tracking

**Configuration:**
```typescript
// functions/src/services/email/sendgrid.ts

import sgMail from '@sendgrid/mail';

const SENDGRID_CONFIG = {
  fromEmail: 'listings@ruthkrishnan.com',
  fromName: 'Montara Listing Bot',
  replyTo: 'support@ruthkrishnan.com',

  // Tracking
  trackOpens: true,
  trackClicks: true,

  // Categories for analytics
  categories: ['listing-bot', 'daily-digest'],
};
```

### Google Gemini

**Purpose:** AI-powered listing analysis and summaries

**Configuration:**
```typescript
// functions/src/services/gemini/client.ts

import { GoogleGenerativeAI } from '@google/genai';

const GEMINI_CONFIG = {
  model: 'gemini-1.5-flash',           // Fast, cost-effective
  maxTokens: 500,                       // Keep summaries concise
  temperature: 0.3,                     // Lower = more factual
};
```

**Prompt Template:**
```typescript
// functions/src/services/gemini/prompts.ts

export const LISTING_ANALYSIS_PROMPT = `
You are a San Francisco real estate expert. Analyze this listing and provide insights for a home buyer.

LISTING:
- Address: {{address}}
- Neighborhood: {{neighborhood}}
- Price: ${{price}}
- Beds: {{beds}} | Baths: {{baths}} | Sqft: {{sqft}}
- Property Type: {{propertyType}}
- Year Built: {{yearBuilt}}
- Features: {{features}}
- Description: {{description}}

Provide your analysis as JSON:
{
  "summary": "2-3 sentence summary highlighting key value proposition",
  "priceAnalysis": "Brief analysis of price relative to neighborhood/size",
  "highlights": ["3-4 key selling points"],
  "concerns": ["0-2 potential concerns or things to investigate"],
  "neighborhoodSummary": "1 sentence about the neighborhood fit"
}

Be concise, factual, and helpful. Respond ONLY with valid JSON.
`;
```

---

## Frontend Components

### New Components to Build

```
src/
├── components/
│   ├── listing-bot/
│   │   ├── ListingBotCard.tsx           # Skill card for main grid
│   │   ├── ListingBotModal.tsx          # Settings modal
│   │   ├── SubscriptionToggle.tsx       # On/off switch
│   │   ├── FilterForm.tsx               # Filter configuration
│   │   ├── FilterPreview.tsx            # Show active filters
│   │   ├── NeighborhoodSelect.tsx       # Multi-select SF neighborhoods
│   │   ├── PriceRangeInput.tsx          # Min/max price inputs
│   │   ├── PropertyTypeSelect.tsx       # Checkbox group
│   │   ├── RecentMatches.tsx            # Preview matching listings
│   │   └── EmailHistory.tsx             # Past emails sent
│   │
│   └── ui/
│       ├── Modal.tsx                    # Reusable modal
│       ├── Toggle.tsx                   # Switch component
│       ├── MultiSelect.tsx              # Multi-select dropdown
│       ├── RangeInput.tsx               # Number range input
│       └── Checkbox.tsx                 # Checkbox component
│
├── hooks/
│   ├── useSubscription.ts               # Subscription CRUD
│   ├── useFilters.ts                    # Filter CRUD
│   ├── useListings.ts                   # Query listings (via Cloud Function)
│   └── useEmailHistory.ts               # Fetch email logs
│
├── contexts/
│   └── ListingBotContext.tsx            # Listing bot state management
│
├── lib/
│   ├── firebase.ts                      # Add Firestore init
│   ├── api.ts                           # Cloud Function API calls
│   └── constants/
│       ├── neighborhoods.ts             # SF neighborhood list
│       └── propertyTypes.ts             # Property type options
│
└── types/
    ├── subscription.ts
    ├── filter.ts
    └── listing.ts
```

### San Francisco Neighborhoods

```typescript
// src/lib/constants/neighborhoods.ts

export const SF_NEIGHBORHOODS = [
  // North
  'Marina',
  'Cow Hollow',
  'Pacific Heights',
  'Presidio Heights',
  'Sea Cliff',
  'Russian Hill',
  'North Beach',
  'Telegraph Hill',
  'Fisherman\'s Wharf',

  // Central
  'Nob Hill',
  'Downtown',
  'Financial District',
  'SoMa',
  'South Beach',
  'Mission Bay',
  'Civic Center',
  'Tenderloin',
  'Hayes Valley',

  // West
  'Richmond',
  'Inner Richmond',
  'Outer Richmond',
  'Sunset',
  'Inner Sunset',
  'Outer Sunset',
  'Parkside',
  'Golden Gate Heights',
  'Forest Hill',
  'West Portal',
  'St. Francis Wood',

  // South Central
  'Castro',
  'Noe Valley',
  'Mission',
  'Mission Dolores',
  'Bernal Heights',
  'Glen Park',
  'Diamond Heights',
  'Twin Peaks',
  'Cole Valley',
  'Haight-Ashbury',
  'Lower Haight',
  'Duboce Triangle',

  // South
  'Potrero Hill',
  'Dogpatch',
  'Bayview',
  'Hunter\'s Point',
  'Visitacion Valley',
  'Excelsior',
  'Ingleside',
  'Oceanview',
  'Outer Mission',
  'Crocker-Amazon',
];
```

---

## Security

### Authentication & Authorization

| Layer | Protection |
|-------|------------|
| Firebase Auth | Google SSO only; @ruthkrishnan.com domain restriction |
| Firestore | Security rules enforce user-owns-data pattern |
| Cloud Functions | Authenticated via Firebase Admin SDK |
| BigQuery | IAM roles; service account with minimal permissions |
| API Keys | Stored in Secret Manager, not in code |

### Secret Management

```bash
# Store secrets via Firebase CLI
firebase functions:secrets:set REPLIERS_API_KEY
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set GEMINI_API_KEY

# Or via Google Cloud Secret Manager
gcloud secrets create REPLIERS_API_KEY --project=montara-portal
gcloud secrets versions add REPLIERS_API_KEY --data-file=./key.txt
```

### IAM Configuration

```yaml
# BigQuery access for Cloud Functions
# Service account: montara-portal@appspot.gserviceaccount.com

roles:
  - roles/bigquery.dataEditor      # Insert/update listings
  - roles/bigquery.jobUser         # Run queries

# Cross-project access to rpk1
gcloud projects add-iam-policy-binding rpk1 \
  --member="serviceAccount:montara-portal@appspot.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

### Data Privacy

- User emails stored in Firestore (encrypted at rest)
- MLS data in BigQuery (encrypted at rest)
- No PII sent to Gemini beyond listing addresses
- Email logs retained 90 days
- GDPR-compliant unsubscribe mechanism

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1)

| Task | Description | Owner |
|------|-------------|-------|
| BigQuery setup | Create dataset, tables, views in rpk1 | Backend |
| Cloud Functions init | Set up functions project with TypeScript | Backend |
| Secret Manager | Configure API keys | Backend |
| IAM cross-project | Grant montara-portal access to rpk1 BigQuery | Backend |
| Firestore schema | Create collections, deploy security rules | Backend |

**Deliverables:**
- [ ] BigQuery `mls_data` dataset with all tables
- [ ] Cloud Functions project structure
- [ ] Secrets configured
- [ ] IAM permissions working

### Phase 2: MLS Integration (Week 2)

| Task | Description | Owner |
|------|-------------|-------|
| Repliers client | Implement API client with auth | Backend |
| Data transformer | Raw Repliers → BigQuery schema | Backend |
| mlsSync function | Daily sync scheduled function | Backend |
| History tracking | Detect and log changes | Backend |
| Webhook handler | Real-time updates (optional) | Backend |

**Deliverables:**
- [ ] Working Repliers integration
- [ ] Daily sync populating BigQuery
- [ ] History table tracking changes

### Phase 3: AI Enrichment (Week 3)

| Task | Description | Owner |
|------|-------------|-------|
| Gemini client | Implement with rate limiting | Backend |
| Prompts | Design and test analysis prompts | Backend |
| aiEnrichment function | Scheduled AI processing | Backend |
| Error handling | Fallbacks for AI failures | Backend |

**Deliverables:**
- [ ] AI summaries on all active listings
- [ ] Reliable batch processing

### Phase 4: Email Service (Week 4)

| Task | Description | Owner |
|------|-------------|-------|
| SendGrid setup | Account, domain verification | Backend |
| Email client | SendGrid API integration | Backend |
| Templates | Daily digest HTML email | Backend |
| emailDigest function | Scheduled email sending | Backend |
| Logging | Email delivery tracking | Backend |

**Deliverables:**
- [ ] Working email delivery
- [ ] Professional email template
- [ ] Delivery tracking in Firestore

### Phase 5: Frontend UI (Weeks 5-6)

| Task | Description | Owner |
|------|-------------|-------|
| Firestore integration | Add to frontend | Frontend |
| ListingBotCard | Skill card component | Frontend |
| ListingBotModal | Settings modal | Frontend |
| FilterForm | Filter configuration UI | Frontend |
| SubscriptionToggle | On/off control | Frontend |
| Hooks | useSubscription, useFilters | Frontend |
| API integration | Query listings from BigQuery | Frontend |

**Deliverables:**
- [ ] Complete settings UI
- [ ] Real-time Firestore sync
- [ ] Filter configuration working

### Phase 6: Testing & Launch (Week 7)

| Task | Description | Owner |
|------|-------------|-------|
| Integration testing | End-to-end flow testing | All |
| Load testing | Verify BigQuery performance | Backend |
| Email testing | Deliverability checks | Backend |
| Security audit | Review IAM, rules | Backend |
| Documentation | Update README, add runbooks | All |
| Production deploy | Deploy all components | All |

**Deliverables:**
- [ ] All tests passing
- [ ] Production deployment complete
- [ ] Monitoring/alerting configured

---

## Cost Estimates

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Repliers API | ~$300 | SF MLS access, ~5000 listings |
| BigQuery Storage | ~$5-20 | ~1GB/month @ $0.02/GB |
| BigQuery Queries | ~$5-10 | ~1TB scanned/month @ $5/TB |
| Cloud Functions | ~$0-5 | Likely within free tier |
| Firestore | ~$0-5 | User data only, low volume |
| SendGrid | $0 | Free tier (100 emails/day) |
| Gemini API | ~$5-15 | ~1000 listings/month |
| **Total** | **~$320-355/month** | MLS API is primary cost |

### Cost Optimization

- **BigQuery:** Use partitioning and clustering to minimize scanned data
- **Gemini:** Cache AI results, only reprocess weekly
- **Cloud Functions:** Optimize memory allocation based on actual usage
- **Repliers:** Use webhooks to reduce polling frequency

---

## Appendix

### A. Environment Variables

```bash
# functions/.env.example

# Repliers MLS API
REPLIERS_API_KEY=your_repliers_api_key
REPLIERS_BOARD_ID=sf_mls_board_id

# SendGrid Email
SENDGRID_API_KEY=your_sendgrid_api_key

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# BigQuery
BIGQUERY_PROJECT_ID=rpk1
BIGQUERY_DATASET=mls_data

# Firebase (auto-configured in Cloud Functions)
# FIREBASE_PROJECT_ID=montara-portal
```

### B. Useful BigQuery Queries

```sql
-- New listings today
SELECT COUNT(*) as new_today
FROM rpk1.mls_data.listings
WHERE DATE(created_at) = CURRENT_DATE()
  AND city = 'San Francisco';

-- Price reductions this week
SELECT
  l.address,
  l.neighborhood,
  h.previous_price,
  h.new_price,
  h.price_change_percent
FROM rpk1.mls_data.listing_history h
JOIN rpk1.mls_data.listings l ON h.listing_id = l.id
WHERE h.event_type = 'price_change'
  AND h.price_change_amount < 0
  AND h.event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY h.price_change_percent ASC;

-- Median price by neighborhood
SELECT
  neighborhood,
  COUNT(*) as active_count,
  APPROX_QUANTILES(list_price, 100)[OFFSET(50)] as median_price
FROM rpk1.mls_data.listings
WHERE status = 'Active'
  AND city = 'San Francisco'
GROUP BY neighborhood
ORDER BY median_price DESC;
```

### C. Monitoring & Alerts

```yaml
# Cloud Monitoring alerts to configure

- name: MLS Sync Failure
  condition: Cloud Function 'mlsSync' error rate > 0
  notification: Email, Slack

- name: Email Delivery Failure
  condition: Cloud Function 'emailDigest' error rate > 10%
  notification: Email, Slack

- name: BigQuery Insert Errors
  condition: BigQuery insert errors > 0
  notification: Email

- name: High API Latency
  condition: Repliers API latency p95 > 5s
  notification: Slack
```

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-04 | 1.0 | Initial architecture document |
