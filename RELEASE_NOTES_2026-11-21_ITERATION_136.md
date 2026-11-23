# RIM 4.1.8 — Iteration 136

## E2E scope foundation

- Added `e2e_mode`, `e2e_epoch`, and `e2e_protocol` metadata to conversations and channels. Existing data remains `off`.
- Added opaque encrypted-payload columns to chat messages and channel posts; no existing message bodies were rewritten.
- Public channels are constrained to E2E `off`. Only direct chats, private groups, and private channels are eligible.
- Added per-device encrypted group-key package storage with member-scoped RLS.
- Added a pending-only E2E enable request RPC. It does not activate E2E.
- Added client scope eligibility/readiness policy and Supabase repository. The production protocol readiness flag is intentionally false.
- Identified `@open-e2ee/signal-protocol-sdk` as a candidate for further investigation. It has not been installed or integrated; exact version, API, license, audit status and interoperability are not yet verified.

## Zladen system-bot foundation

- Added a system-bot registry and per-user installation state (`active`, `blocked`, `unsubscribed`).
- Added an Edge Function that provisions a dedicated Auth identity through Supabase Auth Admin, creates one default direct chat per user, supports user state changes, and exposes owner-only profile updates (name, username/link, avatar path).
- Added a client service and sign-in installation hook. The default chat includes a welcome message; `/start`, `/help`, `/commands`, `/ping`, and `/id` are handled by a database trigger.
- Added an owner-only Tools screen to edit display name, username/link, and avatar; avatar uploads use the existing avatars bucket.
- Requires Supabase secret `RIM_OWNER_USER_ID` to identify the system owner before the bot can be provisioned.
- **Not an Iris feature clone yet:** only `/start`, `/help`, `/commands`, `/ping`, and `/id` are implemented. Moderation, economy, games, levels, automations, richer group commands, and dedicated in-chat block/unsubscribe controls remain unimplemented. The owner profile screen is implemented in Tools.

## Verification

- Project architecture check: PASS.
- JavaScript syntax check: PASS.
- Node tests: see final verification count in `RIM_MODULE_MAP.json`.
- Supabase migrations were created locally only; they were not applied to the live project.
- Edge Function was created locally only; it was not deployed.
- Browser E2E, live two-account verification, physical Android verification, and load testing were not run.
- E2E is not active in production. Do not show an encryption lock or claim private messages are encrypted until the protocol and send/read path are integrated.
