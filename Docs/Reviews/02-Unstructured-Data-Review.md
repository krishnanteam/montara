# OffMarket Bot: Unstructured Data & Entity Resolution Review

**Reviewer:** Staff Engineer -- Unstructured Data Systems / Knowledge Graphs / Entity Resolution
**Documents reviewed:**
- `OffMarketBot-PRD.md`
- `OffMarketBot-Architecture-Plan.md`
- `OffMarketBot-Storage-Design.md`

---

## Executive Summary

The event-sourced contribution model is the single best decision in the document. The signature-based pre-filter + LLM matching is a creative pragmatic choice.

However, the design has seven structural weaknesses that will manifest within months of production use. Below I address each with specific findings and concrete recommendations, tiered into "do now," "do soon," and "do later."

---

## 1. Entity Resolution Quality

### What is good

The two-stage design (cheap filter + expensive classifier) is the right pattern. Passing raw context to the LLM captures coreference signals like "that Van Ness place Joe mentioned" that no feature-based matcher would catch.

### What is fragile

**Problem 1: The signature pre-filter is too coarse and rigid.**

It uses conjunctive (AND) matching. A single missing or misclassified field kills recall. Example: Agent A says "4BR near Van Ness, ~$6M". Agent B says "1847 Van Ness Ave, 4BR TIC" (no price). Price range has no overlap because B's is null. Pre-filter returns empty. System creates a duplicate.

**Recommendation (Do Now):** Switch to disjunctive (OR) blocking with multiple blocking keys:
- Block 1: neighborhoodNorm + bedroomsBucket
- Block 2: neighborhoodNorm + priceRange(+-20%)
- Block 3: addressTokens (if available)
- Block 4: crossStreets (normalized)

Take the union of candidate sets. Standard entity resolution practice.

**Problem 2: No embedding-based similarity as a fallback.**

Messages like "motivated seller on that TIC near Van Ness" have no structured fields to match on.

**Recommendation (Do Soon):** Generate text embeddings per property. At <1000 properties, brute-force cosine similarity in a Cloud Function is sub-100ms. No vector database needed yet.

**Problem 3: LLM confidence scores are uncalibrated.**

LLMs are poorly calibrated on numeric confidence. The 0.8/0.4 thresholds are arbitrary.

**Recommendation (Do Now):** Have the LLM return structured reasoning (`signals_for`, `signals_against`, `confidence_bucket`) rather than a single float. Log every decision for empirical tuning.

**Problem 4: No transitive closure.**

If Property A matches contribution X, and X also matches Property B, the system should consider merging A and B. No mechanism for this exists.

**Recommendation (Do Soon):** After every match, check for shared contributions/candidates across properties. Flag for potential merge.

---

## 2. "Property" as a First-Class Entity

Property-as-primary-entity is correct for this scale. But:

**Problem 1: External agents are invisible.** "Joe met a seller" -- the seller and external agent get flattened into `sellerNotes: string`. You cannot query "what has external agent Sarah told us across all properties?"

**Recommendation (Do Soon):** Add an `external_contacts` collection with name, aliases, role, and `mentionedInPropertyIds`. Lightweight graph edge without a graph database.

**Problem 2: Deal status has no transition log.** You cannot answer "when did this move from rumor to coming_soon?"

**Recommendation (Do Soon):** Add `statusHistory` array on the property.

**Problem 3: No conversation threading as a first-class concept.**

**Recommendation (Do Later):** The existing `slackThreadTs` on contributions is sufficient for reconstruction. Document this as the intended query pattern.

---

## 3. Schema Evolution -- THE FIXED SCHEMA WILL BREAK WITHIN WEEKS

The `current` object has fixed fields. But agents will say things like: "HOA is $2,400/month," "has long-term tenants," "needs gut renovation," "earthquake retrofit required," "estate is in probate," "seller wants 60-day rent-back." None fit the fixed schema. `additionalNotes` becomes a dumping ground.

**Recommendation (Do Now):** Adopt a hybrid fixed + open attribute model:

```typescript
current: {
  // ... fixed fields ...
  attributes: {
    [key: string]: {
      value: string | number | boolean;
      category: 'financial' | 'condition' | 'legal' | 'occupancy' | 'agent_intel' | 'other';
      contributionId: string;
      confidence: number;
    }
  }
}
```

Update the LLM extraction prompt to extract additional attributes beyond the fixed fields. Firestore handles maps natively. These attributes won't be indexable for Firestore queries but are available for LLM-powered queries.

---

## 4. Temporal Modeling

**Problem 1: No point-in-time reconstruction.** "What did we know about this as of January 15th?" requires replaying all contributions.

**Problem 2: "Latest wins" is wrong for some fields.** High-confidence "$6M" gets overwritten by low-confidence "I think $5M."

**Problem 3: No decay model.** A property "coming in April" still marked "coming_soon" in September.

**Recommendations:**
- **Do Now:** Add `fieldProvenance` map recording which contribution set each field and when.
- **Do Soon:** Implement staleness detection. Daily sweep flagging properties with no updates in N weeks.
- **Do Later:** Build `replayProjection(propertyId, asOfDate)` for time-travel queries.

---

## 5. Confidence and Provenance

**Problem 1: "Latest wins" vs. "higher confidence wins" contradiction.** The storage design says both in different places.

**Recommendation (Do Now):** Define confidence-weighted latest-wins:
```
If new_confidence >= existing_confidence * 0.7: accept new value
Else: keep existing, record new as alternative
```

**Problem 2: No aggregate confidence at the property level.**

**Recommendation (Do Soon):** Add `intelQuality` composite score:
```
score = min(contributionCount/5, 1) * 0.3 + min(uniqueAgents/3, 1) * 0.3
      + avgConfidence * 0.2 + max(0, 1-staleDays/90) * 0.2
```

**Problem 3: Provenance not surfaced in the query path.** The answer prompt receives the property projection, not contributions. The LLM cannot attribute to agents.

**Recommendation (Do Now):** Include contributions (or `fieldProvenance`) in the LLM answer context. Without this, attribution will be hallucinated.

---

## 6. Query Capabilities

### Queries Firestore cannot support

1. **Semantic similarity** ("find properties similar to X") -- needs embeddings
2. **Relationship traversal** ("what else has Joe heard from that seller?") -- needs `external_contacts`
3. **Full-text search** ("who mentioned earthquake retrofit?") -- needs Algolia/Typesense or brute-force LLM pass
4. **Aggregation** ("properties coming soon per neighborhood") -- needs denormalized counters

**Recommendations:**
- Do Now: Maintain `neighborhood_stats` collection for aggregation.
- Do Soon: Use embeddings for similarity. Full-text via brute-force LLM (viable at <1000 contributions).
- Do Later: Add Algolia/Typesense when volume justifies it.

---

## 7. The Unmatched Contributions Holding Pen

**Problem 1: The 24-hour auto-promote timer is dangerous.** Creates duplicates. Off-market intel is slow-moving.

**Recommendation (Do Now):** Extend to 1 week minimum. Configurable.

**Problem 2: No active re-resolution.** New properties don't trigger a sweep of the unmatched queue.

**Recommendation (Do Now):** After every new property creation or property enrichment, sweep `unmatched_contributions` for potential matches.

**Problem 3: No observability.** No way for humans to see or manage the queue.

**Recommendation (Phase 4 planning):** Build an "Unresolved Intel" portal page with manual link/dismiss actions.

**Problem 4: Unmatched contributions are not queryable.** Agent asks about Broadway; an unmatched contribution about Broadway exists but isn't found.

**Recommendation (Do Soon):** Query engine should also search `unmatched_contributions` and surface results with a qualifier.

---

## Summary of Recommendations

### Do Now (Before Phase 1)

| # | Recommendation |
|---|---|
| 1 | Switch to disjunctive (OR) blocking with multiple signature keys |
| 2 | Return structured match reasoning from LLM, not just a confidence float |
| 3 | Resolve "latest wins" vs. "higher confidence wins" contradiction |
| 4 | Add `fieldProvenance` map for per-field attribution |
| 5 | Include contributions in query answer context |
| 6 | Add `attributes` map for open-ended extracted fields |
| 7 | Extend unmatched auto-promote timer to 1 week |
| 8 | New properties trigger unmatched queue sweep |
| 9 | Log all LLM calls to audit collection |
| 10 | Validate LLM JSON output before Firestore writes |
| 11 | Cap LLM matching calls at 5 candidates per contribution |

### Do Soon (Before Phase 3)

| # | Recommendation |
|---|---|
| 12 | Add `external_contacts` collection |
| 13 | Add `statusHistory` for deal state transitions |
| 14 | Generate text embeddings for similarity-based recall |
| 15 | Implement staleness detection and alerts |
| 16 | Include unmatched contributions in query results |
| 17 | Add `intelQuality` composite score |
| 18 | Maintain `neighborhood_stats` for aggregation |

### Do Later (Phase 5+)

| # | Recommendation |
|---|---|
| 19 | Transitive closure / property merge detection |
| 20 | Vector database when property count exceeds ~5000 |
| 21 | Full-text search index (Algolia/Typesense) |
| 22 | Geocoding and geopoint queries |
| 23 | `replayProjection()` for time-travel queries |
| 24 | Portal UI for unmatched contribution triage |

---

## Final Assessment

This is a well-considered V1 design. The event-sourced model, LLM-native processing, and "schema-tolerant" philosophy are correct foundational choices. The primary risks are: (a) entity resolution is too brittle, (b) the fixed schema will bottleneck within weeks, and (c) the unmatched contribution lifecycle has gaps. All addressable without changing the fundamental architecture or leaving Firebase.
