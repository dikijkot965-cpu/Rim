# RIM 4.1.8 — Iteration 135

## Bots
- Removed the frontend's hard-coded 1 MB source upload rejection.
- Added Supabase-backed bot projects, files, explicit snapshots, runtime state and logs.
- Added file import, file switching, new-file creation, autosave, explicit save and runtime start/stop requests.
- Added a separate Node 22 + `isolated-vm` container runtime package with a limited `RIM` API.
- Runtime host is not deployed. Bot code is not yet executing in production until a persistent host is configured.

## E2E groundwork
- Added ECDH + ECDSA device identity, signed-prekey generation/verification, one-time prekeys, and IndexedDB private key storage.
- Added public device/prekey tables and authenticated atomic prekey-bundle claim RPC.
- Added envelope signatures and tamper tests.
- E2E is not integrated into direct messages and is not a production protocol; Double Ratchet and audit remain required.

## Social feed SQL
- Extended `feed_posts` for title, language, topics, publishing, edit version, pins, labels and soft delete.
- Added topics, media, saves, views, reactions, reposts, reports, drafts, schedule, hashtags, mentions, personalization preferences, interest weights, events, impressions, collections and mute tables.
- Added localization-key topic taxonomy and 14 initial topic records.
- RLS enabled; no anonymous SELECT grants on the new tables.

## Validation
- Unit tests, syntax, project map and Cloudflare build are recorded in `docs/ITERATION_135_ENGINEERING_REPORT.md`.
- Runtime container, real bot end-to-end, physical Android, browser E2E, two-device E2E and load tests remain unverified.
