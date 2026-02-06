# OffMarket Bot: Architecture & Implementation Plan

> Authored as a technical architecture review of the [OffMarket Bot PRD](./OffMarketBot-PRD.md).
> Baseline: The Montara Portal is a React/TypeScript SPA on Firebase Hosting with Google OAuth (domain-restricted to ruthkrishnan.com). Firebase SDK and `@google/genai` are already dependencies. No Cloud Functions or Firestore are in use yet.
>
> **Rev 2 (2026-02-06):** Incorporated feedback from [architecture reviews](./Reviews/). Added Phase 0 (raw capture), async processing pattern, LLM output validation, and backfill-before-launch strategy.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Components](#2-system-components)
3. [Data Model](#3-data-model) — see also: [Storage Design (detailed)](./OffMarketBot-Storage-Design.md)
4. [Slack Integration Pipeline](#4-slack-integration-pipeline)
5. [LLM Processing Layer](#5-llm-processing-layer)
6. [Query Engine](#6-query-engine)
7. [Portal UI Surface](#7-portal-ui-surface)
8. [Infrastructure & Deployment](#8-infrastructure--deployment)
9. [Security & Privacy](#9-security--privacy)
10. [Phased Rollout](#10-phased-rollout)
11. [Open Questions & Risks](#11-open-questions--risks)

---

## 1. Architecture Overview

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SLACK WORKSPACE                             │
│  #offmarket channel                                                 │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐                       │
│  │ Text msg  │  │ Image    │  │ @bot query  │                       │
│  └─────┬─────┘  └─────┬────┘  └──────┬──────┘                       │
└────────┼──────────────┼──────────────┼──────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FIREBASE CLOUD FUNCTIONS                          │
│                                                                     │
│  ┌──────────────────┐   ┌──────────────────┐  ┌──────────────────┐  │
│  │  Slack Event      │   │  Slack Event      │  │  Slack Event     │  │
│  │  Handler          │   │  Handler          │  │  Handler         │  │
│  │  (message)        │   │  (file_shared)    │  │  (app_mention)   │  │
│  └────────┬──────────┘   └────────┬──────────┘  └───────┬──────────┘  │
│           │                       │                      │           │
│           ▼                       ▼                      ▼           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   LLM PROCESSING LAYER                      │    │
│  │                   (Google Gemini API)                        │    │
│  │                                                             │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │    │
│  │  │ Entity      │  │ Image OCR /  │  │ Query             │  │    │
│  │  │ Extraction  │  │ Multimodal   │  │ Interpretation    │  │    │
│  │  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  │    │
│  └─────────┼───────────────┼────────────────────┼──────────────┘    │
│            │               │                    │                    │
│            ▼               ▼                    ▼                    │
│  ┌─────────────────────────────────┐  ┌─────────────────────────┐   │
│  │         WRITE PATH              │  │       READ PATH          │   │
│  │  Match contribution to property │  │  Search properties,      │   │
│  │  or create new property         │  │  return answer to Slack  │   │
│  └────────────┬────────────────────┘  └────────┬────────────────┘   │
│               │                                │                    │
└───────────────┼────────────────────────────────┼────────────────────┘
                │                                │
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FIRESTORE                                    │
│                                                                     │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐                │
│  │ properties   │  │ agents     │  │ neighborhoods │                │
│  │  └─contri-   │  │            │  │              │                │
│  │   butions    │  │            │  │              │                │
│  └──────────────┘  └────────────┘  └──────────────┘                │
│  ┌──────────────────────┐                                          │
│  │ unmatched_            │                                          │
│  │ contributions         │                                          │
│  └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PORTAL UI (This Repo)                                              │
│  - Dashboard view of properties & contributions                     │
│  - Query interface                                                  │
│  - Property browser with contribution timeline                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Slack-first**: The primary input and query interface is Slack. The portal UI is a secondary read-only dashboard. Agents should not have to change their workflow.
2. **LLM-native**: Entity extraction, relationship building, and querying are all powered by an LLM (Gemini), not brittle regex or keyword matching.
3. **Schema-tolerant**: The data model must accept partial, vague, and conflicting information gracefully. A property with only "neighborhood + price" is valid.
4. **Event-sourced**: Immutable contributions (what agents said) are separated from mutable property state (what we currently believe). Nothing is ever lost.
5. **Firebase-native**: Leverage the existing Firebase project (Firestore, Cloud Functions, Auth) to minimize operational overhead.

---

## 2. System Components

| Component | Technology | Purpose |
|---|---|---|
| **Slack Event Receiver** | Firebase Cloud Functions (Node.js/TS) | Receives and validates Slack events via HTTP |
| **LLM Processor** | Google Gemini API (`@google/genai`) | Extracts entities, interprets images, answers queries |
| **Data Store** | Cloud Firestore | Stores properties, contributions, agents, neighborhoods |
| **Property Merge Engine** | Cloud Functions (on-write trigger) | Matches new contributions to existing properties or creates new ones |
| **Portal Dashboard** | React (existing portal) | Browse and query properties from the web UI |

---

## 3. Data Model

> **The full storage design is documented in [OffMarketBot-Storage-Design.md](./OffMarketBot-Storage-Design.md).**
> That document covers the event-sourced property model, the merge algorithm, conflict handling, and the `unmatched_contributions` holding pen in detail.

The storage layer uses an **event-sourced** pattern:
- **Properties** are the evolving entities — mutable projections of the "best known state."
- **Contributions** are the immutable events — each Slack message that added information, with full attribution.

### Collections Summary

| Collection | Role | Mutability | Phase |
|---|---|---|---|
| `raw_messages` | Every Slack message captured verbatim with image transcriptions | Immutable (append-only) | Phase 0 |
| `properties` | Current best-known state of each property | Mutable (updated as contributions arrive) | Phase 1 |
| `properties/{id}/contributions` | Individual observations from agents | Immutable (append-only) | Phase 1 |
| `agents` | Team members who contribute intel | Mostly static | Phase 1 |
| `neighborhoods` | Canonical location reference with aliases | Pre-seeded, slowly growing | Phase 1 |
| `unmatched_contributions` | Holding pen for contributions that can't be confidently linked yet | Temporary (resolved within ~1 week) | Phase 1 |

### Key Design Decisions

1. **Properties start vague and grow.** A property can exist with only a neighborhood and a price. As agents contribute more information (property type, address, seller details), the property record gets richer.
2. **Multiple agents contribute to one property.** Each contribution is a separate immutable record in the sub-collection, preserving who said what and when.
3. **Fuzzy matching.** New contributions are matched to existing properties via a two-step process: fast Firestore pre-filter (neighborhood + price range) followed by LLM-based confirmation.
4. **Conflicts are surfaced, not hidden.** When two agents disagree (e.g., on price), the latest value wins for the projection, but both contributions are preserved and the LLM can surface the discrepancy when answering queries.

---

## 4. Slack Integration Pipeline

### 4.1 Slack App Configuration

Create a Slack App with the following scopes and features:

**Bot Token Scopes:**
- `channels:history` — Read messages in public channels
- `channels:read` — View channel info
- `chat:write` — Send messages as the bot
- `files:read` — Access shared files (images)
- `users:read` — Resolve Slack user IDs to names

**Event Subscriptions:**
- `message.channels` — New message in a channel
- `app_mention` — Bot is @mentioned (for queries)

**Request URL:** `https://us-central1-montara-portal.cloudfunctions.net/slackEvents`

### 4.2 Event Processing Flow

```
Slack Event API
      │
      ▼
┌─────────────────────┐
│ slackEvents          │  Cloud Function (HTTP)
│                      │
│ 1. Verify signature  │  (Slack signing secret)
│ 2. Handle challenge  │  (URL verification)
│ 3. Route by event    │
│    type              │
└──────┬──────────────┘
       │
       ├── message (no bot_id) ──────▶ processIntelMessage()
       ├── message (file_shared) ────▶ processImageMessage()
       └── app_mention ──────────────▶ processQuery()
```

### 4.3 Deduplication

Slack can retry events. Use Firestore to track processed event IDs:

```typescript
// Check idempotency before processing
const eventRef = db.collection('processed_events').doc(eventId);
const snap = await eventRef.get();
if (snap.exists) return; // Already processed
await eventRef.set({ processedAt: FieldValue.serverTimestamp() });
// TTL: Auto-delete after 7 days via Firestore TTL policy
```

### 4.4 Thread Handling

When a message is part of a thread (`thread_ts` is present):
1. Look up the parent property by matching the thread's root message timestamp.
2. Pass the full thread context to the LLM.
3. Add a new contribution to the parent property if the thread adds new information.
4. Update the property's `current` state with any new fields.

---

## 5. LLM Processing Layer

### 5.1 Entity Extraction (Write Path)

When a new message arrives, call Gemini with a structured extraction prompt:

```typescript
const extractionPrompt = `
You are an entity extraction engine for a real estate team.
Extract structured data from this Slack message posted by agent "{agentName}".

Message: "{messageText}"

Return a JSON object with these fields (omit any field you cannot determine):
- propertyType: string (e.g., "condo", "SFH", "TIC", "multi-unit")
- bedrooms: number
- bathrooms: number
- priceEstimate: { amount: number, qualifier: "approximately"|"asking"|"reduced"|"unknown" }
- location: { neighborhood: string, crossStreets: string, address: string, city: string, zip: string }
- timeline: { expectedListDate: string, status: "rumor"|"coming_soon"|"in_prep"|"pocket"|"withdrawn"|"unknown" }
- sellerInfo: string
- additionalNotes: string
- confidence: number (0-1, your overall confidence in the extraction)

Be liberal in extraction — partial data is valuable. If the message is conversational
and contains no property intel, return { "isIntel": false }.
`;
```

**Model choice:** Use `gemini-2.0-flash` for extraction (fast, cheap, good enough for structured extraction). Reserve `gemini-2.0-pro` for complex query answering.

### 5.2 Image Processing (OCR Path)

For images (screenshots of text conversations):

1. Download the image from Slack using `files:read` scope and the bot token.
2. Send to Gemini as a multimodal prompt:

```typescript
const imagePrompt = `
This is a screenshot of a text conversation related to real estate.
1. Transcribe ALL text visible in the image.
2. Extract the same structured entity fields as the text extraction.
Return JSON with: { transcription: string, extracted: { ... } }
`;

const result = await genai.generateContent({
  contents: [
    { role: 'user', parts: [
      { text: imagePrompt },
      { inlineData: { mimeType: 'image/png', data: base64Image } }
    ]}
  ]
});
```

This eliminates the need for a separate OCR service — Gemini's multimodal capability handles it natively.

### 5.3 Neighborhood Resolution

After extraction, resolve the location to a canonical neighborhood:

1. Query the `neighborhoods` collection for exact or alias match.
2. If no match, ask Gemini: "What San Francisco neighborhood is '{crossStreets}' in?"
3. If it's a new neighborhood, create a new document (or flag for human review).
4. Link the property to the neighborhood via `neighborhoodRef`.

### 5.4 Property Matching & Merge

When new intel arrives, the system must determine: *is this about a property we already know about, or is it new?*

This is detailed in the [Storage Design doc](./OffMarketBot-Storage-Design.md#the-merge-problem-how-contributions-find-their-property). In summary:

1. **Pre-filter**: Query Firestore for properties with overlapping `signature` (neighborhood + price range).
2. **LLM match**: For each candidate, ask Gemini "are these about the same property?" with full context.
3. **High confidence (>0.8)**: Add contribution to existing property, update `current` state.
4. **Uncertain (0.4-0.8)**: Place in `unmatched_contributions` with candidate IDs.
5. **No match (<0.4)**: Create a new property with this as its first contribution.

---

## 6. Query Engine

### 6.1 Query Flow

When an agent @mentions the bot:

```
"@offmarket-bot Any $6M properties coming up in Pacific Heights?"
                          │
                          ▼
              ┌───────────────────────┐
              │  Query Interpretation  │
              │  (Gemini)             │
              │                       │
              │  → price: ~6000000    │
              │  → neighborhood:      │
              │    "Pacific Heights"  │
              │  → timeline: upcoming │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Firestore Query      │
              │  (on properties)      │
              │                       │
              │  WHERE neighborhood   │
              │    == "Pacific Heights"│
              │  WHERE price          │
              │    BETWEEN 5M and 7M  │
              │  WHERE status IN      │
              │    [coming_soon,      │
              │     in_prep, rumor]   │
              │  ORDER BY lastUpdated │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Answer Generation    │
              │  (Gemini)             │
              │                       │
              │  Summarize properties │
              │  with attribution     │
              │  to contributing      │
              │  agents               │
              └───────────┬───────────┘
                          │
                          ▼
              Post reply to Slack thread
```

### 6.2 Query Interpretation Prompt

```typescript
const queryPrompt = `
You are a query interpreter for a real estate intel system.
Parse the agent's natural language question into structured filters.

Question: "{query}"

Return JSON:
{
  "filters": {
    "priceMin": number | null,
    "priceMax": number | null,
    "neighborhoods": string[] | null,
    "propertyTypes": string[] | null,
    "bedroomsMin": number | null,
    "timelineStatuses": string[] | null,
    "agentName": string | null,
    "dateRange": { "from": string, "to": string } | null
  },
  "intent": "search" | "summary" | "count" | "relationship"
}
`;
```

### 6.3 Answer Generation Prompt

```typescript
const answerPrompt = `
You are an assistant for a real estate team. Based on the following properties
and their contribution history, answer the agent's question.
Keep the tone professional but concise — this is a Slack message.

Question: "{query}"
Properties: {JSON.stringify(properties)}

Rules:
- Always attribute information to the agent(s) who contributed it.
- If data is uncertain, say so (e.g., "~$6M (approximate)").
- If multiple agents contributed to the same property, mention all of them.
- If there are conflicting data points, surface both.
- If no results found, say so clearly and suggest broadening the search.
- Format for Slack (use *bold*, bullet points, etc.).
`;
```

---

## 7. Portal UI Surface

Add an "OffMarket Intel" skill card to the existing portal, linking to a new internal route (not an external app).

### 7.1 New Pages

| Route | Component | Purpose |
|---|---|---|
| `/offmarket` | `OffMarketDashboard` | Main dashboard with summary stats |
| `/offmarket/properties` | `PropertyList` | Browse/filter all known properties |
| `/offmarket/property/:id` | `PropertyDetail` | View a property with its full contribution timeline |
| `/offmarket/query` | `QueryInterface` | Natural language search from the portal |

### 7.2 Dashboard Widgets

- **Recent Properties**: Last 10 properties with contributor attribution.
- **Neighborhood Heatmap**: Which neighborhoods have the most activity.
- **Pipeline Summary**: Count of properties by status (rumor / coming_soon / in_prep).
- **Top Contributors**: Agents ranked by contribution count.

### 7.3 Property Detail View

The property detail page is where the event-sourced model shines in the UI:

- **Current State**: The property card showing best-known values for all fields.
- **Contribution Timeline**: A chronological feed showing each contribution, who posted it, what fields it added or changed, and the original Slack message text.
- **Unresolved Conflicts**: Any fields where contributors disagree, shown as a callout.

### 7.4 Routing

The portal currently has no client-side router. Adding `react-router-dom` will be necessary:

```
/ ...................... Existing skills grid (home)
/offmarket ............. OffMarket dashboard
/offmarket/properties .. Property list
/offmarket/property/:id  Property detail
/offmarket/query ....... Query interface
```

---

## 8. Infrastructure & Deployment

### 8.1 New Firebase Services Required

| Service | Purpose | Setup |
|---|---|---|
| **Cloud Functions (2nd Gen)** | Slack event handler, LLM processing, property merge engine | `firebase init functions` |
| **Firestore** | Primary data store | `firebase init firestore` |
| **Secret Manager** | Slack tokens, Gemini API key | Via `firebase functions:secrets:set` |
| **Cloud Storage** | Cache downloaded Slack images | Already available in Firebase project |

### 8.2 Project Structure Addition

```
portal/
├── Docs/
├── functions/                    ◀ NEW: Cloud Functions
│   ├── src/
│   │   ├── index.ts              # Function exports
│   │   ├── slack/
│   │   │   ├── events.ts         # Slack event handler
│   │   │   ├── verify.ts         # Signature verification
│   │   │   └── types.ts          # Slack API types
│   │   ├── llm/
│   │   │   ├── extraction.ts     # Entity extraction prompts
│   │   │   ├── query.ts          # Query interpretation & answering
│   │   │   └── image.ts          # Multimodal image processing
│   │   ├── properties/
│   │   │   ├── merge.ts          # Property matching & merge logic
│   │   │   └── resolve.ts        # Unmatched contribution resolver
│   │   ├── models/
│   │   │   ├── property.ts       # Property & Contribution types
│   │   │   ├── agent.ts          # Agent type
│   │   │   └── neighborhood.ts   # Neighborhood type
│   │   └── utils/
│   │       ├── firestore.ts      # DB helpers
│   │       └── slack-client.ts   # Slack Web API wrapper
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules               ◀ NEW: Security rules
├── firestore.indexes.json        ◀ NEW: Composite indexes
├── src/                          (existing portal frontend)
│   ├── pages/                    ◀ NEW: Page components
│   │   └── offmarket/
│   │       ├── Dashboard.tsx
│   │       ├── PropertyList.tsx
│   │       ├── PropertyDetail.tsx
│   │       └── QueryInterface.tsx
│   └── ...
└── ...
```

### 8.3 Environment & Secrets

| Secret | Where Used | Storage |
|---|---|---|
| `SLACK_BOT_TOKEN` | Cloud Functions | Firebase Secret Manager |
| `SLACK_SIGNING_SECRET` | Cloud Functions | Firebase Secret Manager |
| `GEMINI_API_KEY` | Cloud Functions | Firebase Secret Manager |

**Note:** The frontend already uses `VITE_FIREBASE_*` env vars. No new frontend secrets are needed — the portal reads Firestore directly via Firebase client SDK with security rules.

### 8.4 Updated `firebase.json`

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

---

## 9. Security & Privacy

### 9.1 Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Only authenticated ruthkrishnan.com users can read
    function isTeamMember() {
      return request.auth != null &&
             request.auth.token.email.matches('.*@ruthkrishnan\\.com');
    }

    match /properties/{doc} {
      allow read: if isTeamMember();
      allow write: if false; // Only Cloud Functions write

      match /contributions/{contribution} {
        allow read: if isTeamMember();
        allow write: if false;
      }
    }

    match /agents/{doc} {
      allow read: if isTeamMember();
      allow write: if false;
    }

    match /neighborhoods/{doc} {
      allow read: if isTeamMember();
      allow write: if false;
    }

    match /unmatched_contributions/{doc} {
      allow read: if isTeamMember();
      allow write: if false;
    }

    match /raw_messages/{doc} {
      allow read: if isTeamMember();
      allow write: if false;
    }
  }
}
```

All writes go through Cloud Functions (using the Admin SDK), which bypasses security rules. The frontend is read-only.

### 9.2 Slack Security

- Verify every incoming request using the Slack signing secret (HMAC-SHA256).
- Only process events from the configured #offmarket channel.
- Bot token is stored in Secret Manager, never exposed to the frontend.

### 9.3 Attribution

Every contribution is immutably linked to its source agent via `source.slackUserId` and `source.agentRef`. The property's `contributorAgentIds` array tracks all agents who have contributed. The LLM answer generation prompt is instructed to always include attribution.

---

## 10. Phased Rollout

### Phase 0: Raw Capture & Validation (Weeks 1-2) ◀ NEW

**Goal:** Capture every Slack message from #offmarket into Firestore as-is. Validate assumptions about signal-to-noise ratio and agent behavior before investing in LLM extraction.

**What gets built:**
- [ ] Initialize Cloud Functions (2nd Gen) and Firestore in the Firebase project.
- [ ] Create the Slack App with minimal scopes (`channels:history`, `channels:read`, `files:read`, `users:read`).
- [ ] Implement `slackEvents` Cloud Function with:
  - Slack signature verification (HMAC-SHA256).
  - **Immediate 200 ack** — all processing happens async via Firestore `onCreate` trigger.
  - Idempotent dedup using `create()` (not check-then-act).
- [ ] Build the `raw_messages` Firestore collection:

```typescript
interface RawMessage {
  id: string;
  slackMessageTs: string;           // Slack's unique message timestamp
  slackChannelId: string;
  slackThreadTs?: string;           // null if top-level message
  slackUserId: string;
  userName: string;
  text: string;                     // Original message text
  hasImage: boolean;
  imageUrl?: string;                // Slack file URL (if image)
  imageTranscription?: string;      // Gemini OCR result (images only)
  createdAt: Timestamp;
}
```

- [ ] Implement image processing: download images from Slack, send to Gemini multimodal for **text transcription only** (OCR, not entity extraction). Store the transcribed text in `imageTranscription`.
- [ ] **Backfill**: Export 3-6 months of existing #offmarket Slack history using the Slack API (`conversations.history`). Run through the same pipeline to seed the collection.
- [ ] Build a simple portal page (`/offmarket`) showing the raw message feed:
  - Chronological list with agent name, timestamp, text (or transcription for images).
  - Basic text search (client-side filter at this volume).
  - Thread grouping (messages with the same `slackThreadTs` shown together).
- [ ] Add the "OffMarket Intel" skill card to the portal home, linking to `/offmarket`.
- [ ] Add `react-router-dom` to support the new route.

**What this does NOT do:**
- No entity extraction. No properties. No merging. No querying.
- The only LLM usage is image-to-text transcription (high reliability, narrow scope).

**Exit Criteria:**
- Every message posted in #offmarket appears in Firestore within 3 seconds.
- Images are transcribed and the text is stored alongside the message.
- 3-6 months of historical messages are backfilled.
- The portal shows a browsable, searchable feed.
- **Validation checkpoint:** Manually categorize 100 messages — what % is actionable intel vs. noise/social? If signal < 30%, revisit the product approach (consider opt-in via emoji reaction) before proceeding to Phase 1.

---

### Phase 1: Entity Extraction & Property Model (Weeks 3-5)

**Goal:** Extract structured entities from raw messages and build the event-sourced property model. Gate this phase on Phase 0 validation results.

- [ ] Implement LLM entity extraction via Gemini (`gemini-2.0-flash`).
  - Use Gemini's JSON mode (`responseMimeType: "application/json"` + `responseSchema`).
  - **Validate all LLM outputs** with schema validation (Zod) before writing to Firestore.
  - Log every LLM call (input, output, latency, model version) to an audit collection.
- [ ] Build the `properties` and `contributions` collections (event-sourced model).
- [ ] Implement the property merge engine:
  - Disjunctive (OR) blocking with multiple signature keys.
  - LLM matching with structured reasoning (not just a confidence float).
  - Cap candidates at 5 per contribution.
  - **Write-ahead**: persist every contribution to `unmatched_contributions` first, then attempt matching. Move to property sub-collection on success.
- [ ] Build the `agents` collection (auto-populated from Slack user data).
- [ ] Seed the `neighborhoods` collection with known SF neighborhoods and aliases.
- [ ] Add Slack emoji reactions for processing feedback (checkmark = captured, question mark = unmatched).
- [ ] Process existing `raw_messages` through extraction to bootstrap the property collection.
- [ ] Set `minInstances: 1` on the Cloud Function to eliminate cold starts.

**Exit Criteria:** Messages are extracted into structured properties. The property model grows as contributions arrive. Agents see emoji feedback on their messages.

---

### Phase 2: Threads & Enrichment (Weeks 6-7)

**Goal:** Thread replies enrich existing properties. Unmatched contributions are resolved.

- [ ] Implement thread tracking — add `slack_message_property_map` for fast lookup.
- [ ] Thread replies become contributions to the parent property.
- [ ] Build `unmatched_contributions` auto-resolution: new properties trigger a sweep of the queue.
- [ ] Set auto-promote timer to 1 week (not 24 hours) for unmatched items.
- [ ] Handle property merging when two previously separate properties turn out to be the same.
- [ ] Add `statusHistory` array for deal state transitions.
- [ ] Implement staleness detection (flag properties with no updates in N weeks).

**Exit Criteria:** Thread replies enrich parent properties. Unmatched contributions are actively re-resolved.

---

### Phase 3: Natural Language Querying (Weeks 8-9)

**Goal:** Agents can query the bot in Slack.

- [ ] Implement `app_mention` event handling.
- [ ] Start with "LLM reads everything" approach — serialize all properties into a single Gemini prompt at this scale.
- [ ] Build answer generation with attribution (include contributions in LLM context, not just projections).
- [ ] Also search `unmatched_contributions` and surface results with a qualifier.
- [ ] Handle edge cases: no results, ambiguous queries, broad queries.
- [ ] Generate and store text embeddings per property (preparation for similarity search).

**Exit Criteria:** Agents can @mention the bot and get accurate, attributed answers within 5-8 seconds.

---

### Phase 4: Portal Dashboard (Weeks 10-12)

**Goal:** Web-based property browsing and querying.

- [ ] Build the OffMarket dashboard with summary stats (maintain `neighborhood_stats` collection).
- [ ] Build property list with filters and property detail with contribution timeline.
- [ ] Build the web-based query interface (calls a Cloud Function).
- [ ] Build "Unresolved Intel" page for triaging unmatched contributions.
- [ ] Add merge/split actions (manual correction UI).

**Exit Criteria:** Team leads can browse all properties, see their contribution history, triage unmatched intel, and run queries from the portal.

---

### Phase 5: Refinement (Week 13+)

- [ ] Tune LLM prompts based on real-world extraction quality (golden test set of 30+ messages).
- [ ] Add `external_contacts` collection for sellers and external agents.
- [ ] Switch to embedding-based retrieval when "LLM reads all" becomes too expensive.
- [ ] Add neighborhood auto-complete and alias expansion.
- [ ] Build analytics: property volume trends, query frequency, contributor activity.
- [ ] Performance optimization: caching, query result pagination.
- [ ] Add full-text search (Algolia/Typesense) if volume justifies it.

---

## 11. Open Questions & Risks

| # | Question / Risk | Impact | Recommendation |
|---|---|---|---|
| 1 | **Slack rate limits** — Slack's Events API has rate limits. High-volume channels could hit them. | Medium | The #offmarket channel is low-volume (est. <50 msgs/day). Not a concern for Phase 1. Monitor and add queuing (Cloud Tasks) if needed. |
| 2 | **LLM extraction accuracy** — Gemini may misinterpret vague or slang-heavy messages. | High | Start with `gemini-2.0-flash`, log all extractions, and build a human review queue for low-confidence (<0.5) contributions. Tune prompts iteratively. |
| 3 | **Neighborhood ambiguity** — SF neighborhoods overlap and agents use informal names. | Medium | Seed a curated `neighborhoods` collection with aliases. Use LLM as fallback for resolution. Allow manual correction via Slack reaction (e.g., emoji to flag). |
| 4 | **Property identity / merge accuracy** — The LLM may incorrectly link two contributions to the same property, or fail to link contributions that are about the same property. | High | Use the `unmatched_contributions` holding pen for uncertain cases. Build a manual link/unlink UI in Phase 5. Log all merge decisions for audit. |
| 5 | **Image quality** — Screenshots may be low-res, cropped, or contain overlapping UI elements. | Medium | Gemini's multimodal is robust. Add a fallback: if confidence < 0.3, post a Slack reply asking the agent to type out the key details. |
| 6 | **Cost** — Gemini API calls per message + Firestore reads/writes. | Low-Medium | At ~50 msgs/day, estimated cost is <$5/day for Gemini (flash) + negligible Firestore. Well within free/low-tier thresholds. |
| 7 | **Privacy** — Should the bot process DMs or only channel messages? | High | Phase 1: Only process messages in the designated #offmarket public channel. No DMs. Revisit if agents request DM capture. |
| 8 | **Client-side routing** — Adding react-router-dom is a new dependency and pattern for the portal. | Low | Standard React SPA pattern. Firebase Hosting already rewrites all routes to index.html. Minimal risk. |
