# OffMarket Bot Architecture Review

**Reviewer:** Staff Engineer -- System Design & Production Readiness
**Documents reviewed:**
- `OffMarketBot-PRD.md`
- `OffMarketBot-Architecture-Plan.md`
- `OffMarketBot-Storage-Design.md`

**Existing codebase:** React/TS SPA on Firebase Hosting with Google OAuth. No Cloud Functions, no Firestore, no router. Minimal -- five source files total.

---

## 1. System Design: Component Decomposition and Cloud Functions Fit

**Verdict: The overall decomposition is sound for this scale. A few structural issues need attention.**

### What is good

The separation into Slack Event Receiver, LLM Processor, Property Merge Engine, and Data Store is clean and matches the domain well. The decision to make Slack the primary interface and the portal read-only is exactly right -- it meets agents where they already work. The "Firebase-native" principle is appropriate: this is a small team (~10 agents, ~50 messages/day). Do not over-engineer the infrastructure.

### What needs fixing

**1.1. The Cloud Function is doing too much in a single invocation.**

The `slackEvents` function as described handles: signature verification, event routing, LLM extraction, property matching (which itself involves a Firestore query + another LLM call), and a Firestore write. That is 2 LLM round-trips and multiple Firestore operations in a single synchronous request handler.

Slack expects a 200 response within 3 seconds. If Gemini takes 2-4 seconds for extraction and another 2-4 for matching, you will routinely miss the window. Slack will retry, and your deduplication check will race against the first invocation still in progress.

**Recommendation:** Acknowledge the Slack event immediately (return 200 within 200ms), then do the actual processing asynchronously. Two options:
- **Option A (simpler):** Use Cloud Tasks to enqueue the processing work after acknowledging.
- **Option B (lighter):** Write the raw event to a `raw_events` Firestore collection, return 200, and use a Firestore `onCreate` trigger to kick off the processing pipeline.

Option B is more natural given the Firebase-native principle. Option A gives better retry semantics and backpressure.

**1.2. Cold start latency is a real concern for the query path.**

The architecture doc specifies 2nd Gen Cloud Functions (good). But the query path requires low latency (the doc says "within 3 seconds"). A cold Cloud Function can take 3-8 seconds to initialize before it even starts processing.

**Recommendation:** Set `minInstances: 1` on the `slackEvents` function. At ~50 messages/day, the cost of keeping one warm instance is negligible (a few dollars/month).

**1.3. No explicit error boundary between extraction and merge.**

If extraction succeeds but merge fails, you lose the extraction work. If merge succeeds but the Firestore write fails, you have an orphaned contribution.

**Recommendation:** Make the pipeline two discrete steps with an intermediate state. The `raw_events` / `onCreate` pattern from 1.1 solves this naturally.

---

## 2. Data Flow Integrity

### Write Path Trace

**2.1. Race condition in deduplication.**

The deduplication code is a classic check-then-act race. Two concurrent invocations can both pass the `snap.exists` check.

**Recommendation:** Use `create()` which fails if the document already exists:

```typescript
try {
  await eventRef.create({ processedAt: FieldValue.serverTimestamp() });
} catch (e) {
  if (e.code === 'already-exists') return;
  throw e;
}
```

**2.2. The merge step is a data loss risk point.**

If the LLM match call fails, the contribution is lost. There is no mention of what happens when the LLM returns invalid JSON or a 429/500.

**Recommendation:** Every contribution should be persisted *before* merge is attempted. Write to `unmatched_contributions` first, unconditionally. Then attempt matching. If matching succeeds, move to the property sub-collection. If it fails, the contribution survives in the holding pen.

**2.3. The Firestore transaction for property update is under-specified.**

The merge logic involves LLM calls which cannot be re-run inside a transaction retry.

**Recommendation:** Separate the LLM work from the transaction. Compute the merge result outside the transaction, then use a transaction only for the Firestore read-modify-write. Standard optimistic concurrency pattern.

### Read Path Trace

**2.4. The read path has a single-threaded bottleneck.**

2 sequential LLM calls (interpretation + answer generation) means ~5 seconds minimum. This exceeds the 3-second target.

**Recommendation:** Target 5-8 seconds and set that expectation. Consider caching common query patterns. Also consider whether query interpretation needs an LLM at all -- regex patterns might handle 80% of queries faster.

**2.5. Thread handling has an identity problem.**

No mapping from `slackMessageTs` to `propertyId` is specified.

**Recommendation:** Add a `slack_message_property_map` collection that maps `slackMessageTs` -> `propertyId`.

---

## 3. Firestore as the Data Store

**Verdict: Right for storage and writes. Wrong for several critical read patterns.**

### Where Firestore works well

The write pattern, event-sourced design, real-time listeners, volume (~50 writes/day), and security rules all map perfectly.

### Where Firestore will hurt

**3.1.** `signature.priceRange` array cannot be queried for range overlap. **Fix:** Denormalize to `priceLow` and `priceHigh` as separate fields.

**3.2.** No fuzzy text matching. **Acceptable for now** because the LLM resolves to canonical values before querying. Document this limitation explicitly.

**3.3.** No cross-sub-collection queries without Collection Group indexes. **Fix:** Add a Collection Group index on `contributions` with `source.agentRef`.

**3.4.** The `unmatched_contributions` auto-resolution has no trigger mechanism. **Fix:** Add a Firestore `onWrite` trigger on `properties` that sweeps `unmatched_contributions` for matches. Add a daily scheduled function to promote stale unmatched items.

---

## 4. LLM Integration Patterns

**Verdict: Appropriate for extraction and matching. Over-relied upon for query interpretation. Zero defensive coding against failure.**

**4.1. Query interpretation does not need an LLM.** Build a simple structured parser first. Fall back to Gemini only when the parser fails. Cuts latency in half for common queries.

**4.2. There is no validation of LLM output, anywhere.** Every LLM output must pass through a schema validator (Zod). Use Gemini's JSON mode (`responseMimeType: "application/json"` + `responseSchema`).

**4.3. No fallback when the LLM is down.** For writes: store raw message in `unmatched_contributions` with `extractionStatus: "pending"`. For reads: return a "temporarily unavailable" message.

**4.4. Cost and rate limiting are under-estimated.** Each message can trigger 1 extraction + N matching calls. Cap candidates to top 3-5. Re-estimate costs with actual fan-out.

---

## 5. The Event-Sourced Property Model

**Verdict: This is the right design. Do not simplify to mutable records.**

Attribution is a business requirement. Conflict visibility is valuable. Data volume is trivial. Progressive enrichment maps naturally to append-only contributions.

**Minor fixes:**
- **5.1.** "Latest wins" is too simplistic for genuinely conflicting data. Use weighted resolution based on confidence and source reliability.
- **5.2.** The `conflicts` field should be in the Property interface from day one.

---

## 6. Operational Readiness -- THE BIGGEST GAP

**6.1. No logging strategy.** Add structured JSON logging with correlation IDs (Slack event ID).

**6.2. No monitoring or alerting.** Track: extraction failure rate, LLM latency, merge confidence distribution, unmatched contribution count, Gemini error rate. Critical alert: "unmatched_contributions count > 20".

**6.3. No dead letter queue.** Use the `raw_events` collection as a DLQ with `status` field.

**6.4. No backpressure.** Use Cloud Tasks with rate-limited queue to smooth bursty Slack traffic.

**6.5. No testing strategy.** Build a golden test set of 20-30 real messages with expected extraction results. Run on every deploy.

**6.6. No processing feedback.** Add Slack emoji reactions: checkmark = processed, question mark = unmatched, X = failed. Builds agent trust.

---

## Priority-Ordered Action Items

| Priority | Item | Effort |
|----------|------|--------|
| **P0** | Async processing (ack Slack immediately, process async) | Medium |
| **P0** | Fix deduplication race condition (use `create()`) | Small |
| **P0** | Validate all LLM outputs with schema validation | Medium |
| **P0** | Persist contributions before merge (write-ahead) | Medium |
| **P1** | Separate LLM work from Firestore transactions | Medium |
| **P1** | Add `slack_message_property_map` for thread handling | Small |
| **P1** | Fix `priceRange` query issue (denormalize) | Small |
| **P1** | Add Collection Group index on contributions | Small |
| **P1** | Set `minInstances: 1` | Trivial |
| **P1** | Add Slack emoji reactions for feedback | Small |
| **P1** | Use Gemini JSON mode | Small |
| **P2** | Structured logging with correlation IDs | Medium |
| **P2** | Monitoring and alerting | Medium |
| **P2** | Dead letter handling | Medium |
| **P2** | Rate limiting on LLM calls | Medium |
| **P2** | Golden test set for prompt regression | Medium |
| **P2** | Build unmatched auto-resolution trigger | Medium |
| **P3** | Simple query parser before LLM fallback | Medium |
| **P3** | Weighted conflict resolution | Small |
| **P3** | Add `conflicts` to Property interface | Trivial |

---

## Final Assessment

This is a well-thought-out architecture. The event-sourced model is the right call, Firestore is appropriate for this scale, and the LLM-native approach is correct.

The three biggest risks: (1) **Silent data loss** without write-ahead and LLM validation, (2) **Slack timeout** from synchronous processing, (3) **Zero operational visibility**. Fix the P0 items before writing code and this will be a solid system.
