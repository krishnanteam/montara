# OffMarket Bot: Storage Design

> Focused design document for the data storage layer.
> Companion to the [Architecture Plan](./OffMarketBot-Architecture-Plan.md).

---

## The Core Problem

A property starts as a whisper: *"Joe heard about a 4BR near Van Ness, maybe $6M, coming in April."*

Two weeks later, Ruth adds: *"That Van Ness place Joe mentioned — turns out it's a TIC, seller is motivated."*

A week after that, Sam says: *"I got the address for the Van Ness listing — 1847 Van Ness Ave."*

These are three separate Slack messages, from three different agents, over three weeks. They're all about the **same property**. The storage system needs to:

1. Capture each observation without losing who said what and when.
2. Recognize that they're about the same property (without an address until message #3).
3. Build a progressively richer picture of the property over time.
4. Handle conflicting information gracefully (e.g., one agent says $6M, another says $5.5M).

---

## Design: Event-Sourced Property Graph

The design separates **what was observed** (immutable) from **what we currently believe** (derived and mutable).

```
                    ┌─────────────────────────────────┐
                    │         CONTRIBUTIONS            │
                    │         (immutable events)       │
                    │                                  │
                    │  "Joe heard 4BR near Van Ness,   │
                    │   ~$6M, coming April"            │
                    │          ──────                   │
                    │  "That Van Ness place — it's a   │
                    │   TIC, seller is motivated"      │
                    │          ──────                   │
                    │  "Address is 1847 Van Ness Ave"  │
                    └──────────────┬──────────────────┘
                                   │
                          LLM merges + resolves
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │          PROPERTY                │
                    │          (current best state)    │
                    │                                  │
                    │  address: 1847 Van Ness Ave      │
                    │  neighborhood: Van Ness/Civic Ctr│
                    │  bedrooms: 4                     │
                    │  type: TIC                       │
                    │  price: ~$6M                     │
                    │  timeline: April (coming soon)   │
                    │  seller motivated: yes           │
                    │  contributors: [Joe, Ruth, Sam]  │
                    └─────────────────────────────────┘
```

This is the **event sourcing** pattern:
- **Contributions** are the events — immutable, append-only, fully attributed.
- **Property** is the projection — mutable, derived from all its contributions.

---

## Collections

### 1. `properties` — The Evolving Entity

This is the "best known state" of a property. It is rebuilt/updated every time a new contribution arrives.

```typescript
interface Property {
  id: string;

  // --- Current best-known state (mutable, LLM-derived) ---
  current: {
    address?: string;
    neighborhood?: string;
    crossStreets?: string;
    city?: string;
    zip?: string;

    propertyType?: string;          // "condo", "SFH", "TIC", etc.
    bedrooms?: number;
    bathrooms?: number;
    sqft?: number;

    priceEstimate?: number;
    priceQualifier?: string;        // "approximately", "asking", "reduced"

    timeline?: string;              // freeform: "April", "Q2 2026", "soon"
    status: 'rumor' | 'coming_soon' | 'in_prep' | 'pocket' | 'listed' | 'dead';

    sellerNotes?: string;
    additionalNotes?: string;
  };

  // --- Identity signature (used for fuzzy matching) ---
  signature: {
    neighborhoodNorm: string;       // Lowercased canonical neighborhood
    priceRange: [number, number];   // e.g., [5500000, 6500000] (±10%)
    bedroomsBucket?: string;        // "studio", "1-2", "3-4", "5+"
    typeNorm?: string;              // Lowercased property type
  };

  // --- Provenance ---
  contributorAgentIds: string[];    // All agents who contributed
  contributionCount: number;
  firstMentionedAt: Timestamp;
  lastUpdatedAt: Timestamp;

  // --- Relationships ---
  relatedPropertyIds: string[];     // Potentially same property, flagged for review
  neighborhoodRef?: string;         // Link to neighborhoods/{id}
}
```

**Why `signature`?** Before asking the LLM "is this the same property?", we use the signature for a fast Firestore pre-filter. Only properties with overlapping neighborhood + price range are candidates. This keeps LLM calls to a minimum.

### 2. `contributions` — The Immutable Record

Sub-collection under each property: `properties/{propertyId}/contributions/{contributionId}`

```typescript
interface Contribution {
  id: string;

  // --- Source attribution (immutable) ---
  source: {
    agentRef: string;               // Reference to agents/{id}
    agentName: string;              // Denormalized for display
    slackUserId: string;
    slackMessageTs: string;         // Unique Slack message ID
    slackChannelId: string;
    slackThreadTs?: string;
    sourceType: 'text' | 'image';
    imageUrl?: string;
  };

  // --- Raw content (immutable) ---
  rawText: string;                  // Original message or OCR transcription

  // --- What this contribution specifically added (immutable) ---
  extractedFields: {
    [field: string]: {
      value: any;                   // The extracted value
      confidence: number;           // 0-1 LLM confidence
    };
  };
  // Example:
  // {
  //   "bedrooms":    { value: 4,              confidence: 0.95 },
  //   "priceEstimate": { value: 6000000,      confidence: 0.7  },
  //   "neighborhood":  { value: "Van Ness",   confidence: 0.9  },
  //   "timeline":      { value: "April",      confidence: 0.8  }
  // }

  createdAt: Timestamp;
}
```

**Key property of this design:** Each contribution records only what *it* added. If Joe said "$6M, 4BR" and Ruth later said "it's a TIC", Ruth's contribution only contains `{ propertyType: { value: "TIC", confidence: 0.9 } }`. The full picture lives on the parent `Property`.

### 3. `agents` — The Contributors

```typescript
interface Agent {
  id: string;
  name: string;
  email: string;
  slackUserId: string;
  role: 'listing_agent' | 'buyer_agent' | 'team_lead';
  contributionCount: number;        // Denormalized
  createdAt: Timestamp;
}
```

### 4. `neighborhoods` — The Location Reference

```typescript
interface Neighborhood {
  id: string;
  name: string;                     // Canonical: "Pacific Heights"
  aliases: string[];                // ["Pac Heights", "Pacific Hts"]
  city: string;
  zip: string[];
  propertyCount: number;            // Denormalized
}
```

Pre-seeded with known neighborhoods. The LLM resolves free-text locations (like "Van Ness and Geary") to a canonical neighborhood.

### 5. `unmatched_contributions` — The Holding Pen

When a new Slack message arrives and the system **cannot confidently link it to an existing property**, the contribution lands here temporarily.

```typescript
interface UnmatchedContribution {
  id: string;
  source: Contribution['source'];
  rawText: string;
  extractedFields: Contribution['extractedFields'];
  candidatePropertyIds: string[];   // Properties it *might* belong to, with low confidence
  createdAt: Timestamp;
}
```

This is resolved in one of three ways:
1. **Auto-resolved:** A future message provides enough context for the LLM to link it.
2. **New property created:** If no match after 24 hours, promote to a new `Property` with this as its first contribution.
3. **Manually linked:** An agent in Slack or the portal UI links it to the right property.

---

## The Merge Problem: How Contributions Find Their Property

This is the hardest part of the system. Here's the algorithm:

```
New Slack message arrives
         │
         ▼
┌─────────────────────────┐
│  LLM extracts entities  │
│  from the message       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  STEP 1: Fast pre-filter via signature  │
│                                         │
│  Query Firestore for properties where:  │
│  - neighborhoodNorm overlaps            │
│  - priceRange overlaps                  │
│  - bedroomsBucket matches (if known)    │
│                                         │
│  Result: 0-N candidate properties       │
└────────────┬────────────────────────────┘
             │
     ┌───────┴──────────┐
     │                   │
  0 candidates      1+ candidates
     │                   │
     ▼                   ▼
  Create new    ┌────────────────────────┐
  Property      │  STEP 2: LLM matching  │
                │                        │
                │  For each candidate,   │
                │  ask the LLM:          │
                │  "Given what we know   │
                │  about Property X and  │
                │  this new message, are │
                │  they about the same   │
                │  property?"            │
                │                        │
                │  Return: match (0-1)   │
                └───────────┬────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         High match    Uncertain     No match
         (>0.8)       (0.4-0.8)      (<0.4)
              │             │             │
              ▼             ▼             ▼
         Add to        Add to         Create new
         existing      unmatched_     Property
         Property      contributions
                       (with candidate
                       IDs noted)
```

### What the LLM sees for matching

```
You are matching real estate intel. Does this new message refer to the
same property as the existing record?

EXISTING PROPERTY:
- Neighborhood: Van Ness / Civic Center
- Price: ~$6M
- Bedrooms: 4
- Timeline: April
- First mentioned by: Joe, 2 weeks ago
- Raw context: "Just met a seller at Van Ness and Geary, 4BR likely
  hitting in April for ~$6M."

NEW MESSAGE (from Ruth):
"That Van Ness place Joe mentioned — turns out it's a TIC, seller is motivated."

Are these about the same property? Return:
{ "match": true/false, "confidence": 0.0-1.0, "reasoning": "..." }
```

In this case, Ruth explicitly references "the Van Ness place Joe mentioned" — the LLM will return high confidence. Even without the explicit reference, the neighborhood + price overlap would make it a strong candidate.

---

## How a Property Evolves

When a contribution is linked to a property, the property's `current` state is updated:

```
BEFORE (after Joe's contribution):
{
  current: {
    neighborhood: "Van Ness / Civic Center",
    crossStreets: "Van Ness and Geary",
    bedrooms: 4,
    priceEstimate: 6000000,
    priceQualifier: "approximately",
    timeline: "April",
    status: "rumor"
  },
  contributorAgentIds: ["joe_id"],
  contributionCount: 1
}

AFTER (Ruth's contribution added):
{
  current: {
    neighborhood: "Van Ness / Civic Center",
    crossStreets: "Van Ness and Geary",
    bedrooms: 4,
    propertyType: "TIC",                    ◀ NEW from Ruth
    priceEstimate: 6000000,
    priceQualifier: "approximately",
    timeline: "April",
    status: "coming_soon",                  ◀ UPGRADED: "rumor" → "coming_soon"
    sellerNotes: "seller is motivated"      ◀ NEW from Ruth
  },
  contributorAgentIds: ["joe_id", "ruth_id"],
  contributionCount: 2
}

AFTER (Sam's contribution added):
{
  current: {
    address: "1847 Van Ness Ave",           ◀ NEW from Sam
    neighborhood: "Van Ness / Civic Center",
    crossStreets: "Van Ness and Geary",
    bedrooms: 4,
    propertyType: "TIC",
    priceEstimate: 6000000,
    priceQualifier: "approximately",
    timeline: "April",
    status: "coming_soon",
    sellerNotes: "seller is motivated"
  },
  contributorAgentIds: ["joe_id", "ruth_id", "sam_id"],
  contributionCount: 3
}
```

Each step is a Firestore transaction:
1. Write the new `Contribution` to the sub-collection.
2. Update the `Property.current` fields (only fields that are new or higher-confidence).
3. Update `contributorAgentIds`, `contributionCount`, `lastUpdatedAt`.

---

## Handling Conflicts

What if Joe says "$6M" but Sam later says "$5.5M"?

**Rule: Latest contribution wins for the projection, but nothing is lost.**

The `Property.current.priceEstimate` updates to `5500000`, but Joe's original contribution still says `{ value: 6000000, confidence: 0.7 }`. If someone queries "what do we know about this property?", the LLM can surface the discrepancy:

> *"Price is approximately $5.5M (per Sam, Feb 3) — note: Joe originally estimated ~$6M (Jan 20)."*

For truly conflicting facts, a `conflictFlags` field can be added:

```typescript
conflicts?: {
  field: string;         // e.g., "priceEstimate"
  values: {
    value: any;
    agentRef: string;
    contributionId: string;
    timestamp: Timestamp;
  }[];
}[];
```

---

## Why This Design

| Concern | How it's addressed |
|---|---|
| **Nothing is lost** | Contributions are immutable. Even if a property's current state changes, every original observation is preserved with full attribution. |
| **Properties evolve** | The `current` state is a projection — updated incrementally as contributions arrive. A property can start as just "neighborhood + price" and grow into a full listing. |
| **Attribution is preserved** | Every field can be traced back to who contributed it and when, via the contribution sub-collection. |
| **Fuzzy identity** | The `signature` field enables fast pre-filtering. The LLM handles the hard matching. The `unmatched_contributions` collection handles uncertainty gracefully. |
| **Queryable** | Firestore composite indexes on `current.neighborhood`, `current.priceEstimate`, `current.status` support the most common queries. The LLM translates natural language into these filters. |
| **Auditable** | The full history of how a property's knowledge was built is available in the contribution sub-collection — useful for disputes, commission tracking, and trust. |

---

## Firestore Structure Summary

```
firestore/
│
├── properties/
│   └── {propertyId}/
│       ├── (Property document — current state + signature + metadata)
│       └── contributions/
│           └── {contributionId}/
│               └── (Contribution document — immutable observation)
│
├── agents/
│   └── {agentId}/
│       └── (Agent document)
│
├── neighborhoods/
│   └── {neighborhoodId}/
│       └── (Neighborhood document with aliases)
│
└── unmatched_contributions/
    └── {id}/
        └── (Contribution awaiting property linkage)
```

---

## Indexes Required

| Collection | Fields | Query it supports |
|---|---|---|
| `properties` | `signature.neighborhoodNorm` + `signature.priceRange` | Candidate matching for new contributions |
| `properties` | `current.status` + `lastUpdatedAt` desc | "What's coming soon?" |
| `properties` | `current.neighborhood` + `current.priceEstimate` | "What's in Pacific Heights around $X?" |
| `properties` | `contributorAgentIds` (array-contains) + `lastUpdatedAt` desc | "What has Joe reported?" |
| `unmatched_contributions` | `createdAt` + `candidatePropertyIds` | Periodic re-matching job |
