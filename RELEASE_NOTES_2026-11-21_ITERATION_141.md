# RIM 4.1.8 — Iteration 141

## Zlydya: games, economy, marketplace and triggers

- Added a non-cash item catalogue and per-user inventory.
- Added `/shop`, `/buy`, `/inventory` and `/inv`.
- Added player marketplace: `/market`, `/market_sell`, `/market_buy`, `/market_cancel`.
- Marketplace purchases lock the listing row, debit the buyer, credit the seller, transfer inventory and write ledger entries in one database transaction.
- Added `/daily` with an idempotent UTC-day reward.
- Added daily trivia: `/quiz` and `/answer N`, with one attempt per day and a fixed reward for a correct answer.
- Added `/economy_top`.
- Activated the previously schema-only join event for group triggers. Administrators can add a welcome rule with `/trigger join_add name | reply:text`; `{user_id}` and `{conversation_id}` placeholders are supported.
- Implemented safe message triggers with `/trigger list`, `/trigger add name | contains:text | reply:text`, `/trigger add name | starts_with:text | grant:amount`, and `/trigger del ID_PREFIX`.
- Added a per-trigger, per-user, per-UTC-day reward claim fence and capped message-trigger processing at three matches per message to reduce farming and reply floods.
- Trigger conditions are limited to `contains`, `starts_with`, and `equals`; actions are limited to a bot reply or a bounded fixed point reward. No arbitrary SQL, JavaScript, shell or user-provided code is executed.
- Trigger matches and outcomes are written to an audit log.
- New tables are RLS-enabled and inaccessible to direct anon/authenticated table writes.
- Bot features skip E2E-required conversations.

## E2E integration hardening

- Added a strict SDK relay-contract inspector. A partial/mock adapter is rejected before SDK client composition if any mandatory delivery, subscription, device registry, identity or prekey method is absent.
- This is an integration guard, not a production relay. No Supabase relay server has been deployed and `protocolReady` remains false.

## Validation status

- Automated JavaScript tests and static project checks are run for this iteration.
- PostgreSQL execution of the new migration is not yet validated in a live/staging database. Do not apply to production until that validation is complete.
- Browser OPFS, two-account E2E exchange, device recovery and real-time delivery remain unverified.
