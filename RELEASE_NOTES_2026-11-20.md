# RIM 4.1.7 — Iteration 134

## Device lock
- New app PIN is four digits; legacy longer PIN remains usable until changed.
- Auto-lock choices: disabled / 1 / 5 / 10 / 30 minutes.
- Returning to RIM within the grace period does not immediately require the PIN.
- Changing or disabling the lock requires the current secret. Progressive local retry delay is added.

## Chat reliability
- Message text is painted before Storage media URLs are signed.
- Media hydration is asynchronous, concurrency-bounded and timed out.
- Message history requests now have a timeout/abort boundary.

## Music and radio
- Music library appears before radio.
- Radio compact list defaults to Маруся FM, Детское радио and Дорожное радио.
- Expand/collapse and user-configurable featured stations/count are available.

## Bots
- Bot workspace moved out of the primary tabbar and into Tools.
- Local code editor supports paste, file import, autosave, copy and export. It does not execute arbitrary code.
- A real isolated bot runtime and Царь-бот system chat remain future work.

## E2E
- Added experimental WebCrypto core and IndexedDB identity vault. Direct messages are still plaintext because the engine is not integrated, key exchange is unauthenticated, there is no ratchet/forward secrecy/multi-device support, and no independent audit. Do not advertise E2E yet.

## Verification
- 455/455 unit tests passed at the last full test run.
- Project check, syntax check and Cloudflare build passed.
- Browser E2E and physical Android tests remain pending.
- No production Supabase migration or Edge Function deployment was performed in this iteration.
