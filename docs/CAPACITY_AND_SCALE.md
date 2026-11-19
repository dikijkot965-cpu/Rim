# Capacity and scale notes (honest)

**Product:** RIM messenger  
**Current stack (client):** browser SPA, Supabase JS client, Postgres + Realtime via Supabase, hybrid modular + legacy JS  
**Current claim in module map:** not certified for 10k concurrent active users without staging load test and backend capacity validation.

## Can this architecture reach 1 billion users?

**Short answer: not as-is.** A billion registered or MAU users is a different product class. The current design is a correct *product modernization* path, not a hyperscale messaging fabric.

### What works today (and scales to modest production)

- Single-tenant Supabase/Postgres for early production, tens of thousands of users if schema, indexes, and RLS are careful.
- Conversation-scoped realtime channels (not global bus) — good direction.
- Cursor pagination on message history (page size 50) — good direction.
- Modular application services with repositories — allows later swapping storage/adapters.

### Hard ceilings of the current shape

1. **Single primary database**  
   One Postgres (even Supabase) will not hold 1B users' message history, membership graphs, and fan-out at global latency. You need sharding by user/conversation, tiered storage (hot/warm/cold), and eventually region-local writes.

2. **Realtime fan-out model**  
   Browser clients subscribed via Supabase Realtime do not replace a dedicated pub/sub / connection layer (e.g. regional edge gateways, MQTT/WebSocket fleets, presence service). At large scale, each online user is a long-lived connection; connection tier is a separate product.

3. **Read/write amplification**  
   Naive "update conversation list preview for every member on every message" becomes deadly in large groups/channels. Need fan-out-on-write vs fan-out-on-read choices, async workers, and eventually CQRS-style projections.

4. **Client monolith history**  
   24 legacy scripts + growing modular layer is fine for migration. It is not an obstacle to *backend* scale, but ops/quality costs grow until legacy is retired.

5. **No multi-region story in-app**  
   1B users implies multi-region active-active or region-sticky users, GDPR/data residency, and conflict rules. Not present.

### What would a 1B-oriented architecture require (order-of-magnitude)

| Layer | Direction |
|-------|-----------|
| Identity | Dedicated identity service, session service, device registry |
| Messaging | Partitioned message log (conversation-keyed), immutable message store, separate edit/delete tombstones |
| Delivery | Regional realtime gateways; push (APNs/FCM) for offline; online fan-out via connection tier |
| Social graph | Membership and block lists in stores designed for high QPS; careful index strategy |
| Media | Object storage + CDN; never serve blobs through app servers |
| Search | Separate search cluster (not primary OLTP) |
| Channels / broadcast | Different path from 1:1 DMs (broadcast trees, not per-member insert fan-out) |
| Data | Shard by user or conversation id; cold storage for old history; retention policies |
| Ops | Multi-region, chaos testing, capacity models, SLO/error budgets |

### How current RIM work helps *or does not*

Helps:

- Clear application/repository boundaries → later replace Supabase adapters without rewriting UI.
- Conversation-scoped timeline + race handling → mental model closer to real systems.
- Ownership flags and dual-bind thinning → safer evolution of client without big-bang rewrite.

Does not by itself:

- Multiply database capacity.
- Create a connection tier.
- Solve multi-region or media CDN.
- Certify any concurrent user number.

### Practical scale ladder (realistic)

| Stage | Users (order) | Typical moves |
|-------|----------------|---------------|
| Now / early prod | 10³–10⁴ | Indexes, RLS audit, backups, basic monitoring |
| Growth | 10⁴–10⁵ | Read replicas, connection pooling, media CDN, queue for heavy writes |
| Large | 10⁵–10⁶ | Shard hot tables or move messages to specialized store; dedicated realtime tier |
| Very large | 10⁶–10⁷+ | Multi-region, custom messaging backbone; Supabase becomes one component or is replaced |
| Hyperscale | 10⁸–10⁹ | Full platform rebuild around partitioned logs + edge; multi-year, multi-team effort |

**Conclusion:** Continuing modularization is the right *client and domain* strategy. Preparing for a billion users is primarily a **backend and infrastructure** program that must be designed explicitly when (if) metrics demand it—not assumed as a free property of the current SPA + Supabase stack.


## Generation estimate (honest, 2026-11-16)

Two different finish lines:

### 1) Maintainable modular product core (easy features/fixes, low break risk day-to-day)
**Remaining:** about **12–18** focused iterations from iteration.60.  
Includes: open/send/timeline ownership solid, dual-bind dead, parity matrix filled, smoke on critical paths, legacy *bodies* no-op where safe.  
This is the “не боясь сломать к чертям при обычной разработке” bar for a **small/medium** deployment.

### 2) Architecture you can *point at a billion users* without architectural rewrite
**Not** the same as (1). Requires **backend** work outside this SPA zip:

- partitioned message store + workers
- regional realtime/connection tier
- fan-out strategy for large channels
- multi-region identity/sessions
- load tests at target order of magnitude

**Client modularization alone does not produce 1B scale.**  
Rough order if a full team builds the scale stack **after** (1): **months of calendar time**, not “N more Grok chat iterations” of the current hybrid SPA.  
From this repo alone: finishing (1) is ~12–18 gens; claiming (2) without a new server architecture would be a lie.
