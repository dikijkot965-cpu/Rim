# RIM 4.1.7 — Iteration 134 engineering report

**Date:** 2026-11-21  
**Base:** RIM 4.1.6 / iteration 133  
**Scope:** device lock, chat loading resilience, Telegram OIDC diagnostics, radio preferences, bot workspace, experimental E2E foundation, handoff/localization documentation.

## 1. Device lock

### Implemented

- New PIN setup accepts exactly four digits.
- Existing legacy PINs of 8–16 digits remain valid until the user changes them; this prevents locking out existing installations after update.
- Auto-lock choices are disabled, 1, 5, 10 or 30 minutes.
- `pagehide` and `visibilitychange` timestamps are persisted so a short app switch/reload does not immediately demand a PIN.
- Changing the PIN or pattern requires the current secret.
- Disabling the lock requires the current secret.
- Progressive local retry delay begins after the fourth failure: 30 seconds, then doubles to a 15-minute cap.
- PIN verifier remains PBKDF2-HMAC-SHA-256 with 310,000 iterations and random 128-bit salt. Plaintext PIN is not stored.

### Limitations

This is an application privacy barrier, not server authentication or device hardware security. A user with physical access who clears browser data can reset local attempt state and may remove the lock. This is documented in the settings UI and continuation handoff.

## 2. Chat loading without VPN

### Investigation evidence

The Supabase project logs sampled during the investigation showed:

- `chat_messages` PostgREST reads returning HTTP 200;
- `conversation_members` reads returning HTTP 200;
- Realtime WebSocket upgrade returning HTTP 101;
- sampled `chat_messages` response origin times generally in the tens of milliseconds.

This does not prove all providers/networks can reach Supabase. It does show that the captured session's message REST requests and WebSocket handshake were not failing.

### Code change

The old `MessageListRenderer.render()` waited for profile fetch and all signed media URLs before painting the conversation. A slow or blocked Storage URL could therefore hide otherwise successfully fetched text messages.

Now:

1. Profile lookup is bounded to 4.5 seconds; generic names are used if it fails.
2. Message text is painted before media URLs are signed.
3. Media hydration is asynchronous.
4. At most three media URL requests run concurrently.
5. Each image URL request has a five-second timeout and a local failure label.
6. Message history requests have a 12-second timeout and use AbortSignal where supported.

### Required real-device test

The user must still test a text-only DM and an image DM on Android with VPN disabled. If the chat still hangs, capture the failing request status and console output. This iteration has not been tested on a physical device.

## 3. Telegram OIDC

- Authorization request now includes `prompt=login`.
- Canonical URL metadata is explicitly present in `index.html`:
  `https://dikijkot965-cpu.github.io/Rim/`.
- `AuthFormController` now displays an explicit error if Telegram has established a Supabase user but `initializeApp()` fails.
- Telegram provider error description is surfaced in a bounded form.
- OIDC flow still requires `code` and `state` callback, PKCE verifier, nonce, Edge Function code exchange, ID token verification and Supabase OTP verification.

### Production investigation

`telegram-auth` is ACTIVE v6. A sampled seven-day log query returned no invocation entries for `telegram-auth` during the investigated window. Therefore, the reported Telegram Widgets security message does not prove RIM received an OIDC callback. The redirect URI must be checked in Telegram's OIDC application and the Supabase Edge Function secret `TELEGRAM_REDIRECT_URI`, exactly including `/Rim/` and trailing slash.

No Edge Function was redeployed in iteration 134.

## 4. Radio and music

- `LocalMusicLibrary.render()` now appends the radio player after the music library.
- Radio station order begins with Маруся FM, Детское радио, Дорожное радио.
- Compact display defaults to those three stations.
- Added expand/collapse control.
- Added a station preferences panel: choose featured stations and compact list size (3, 5, 10).
- Preferences persist in localStorage.
- Детское радио stream changed to an HTTPS HLS URL listed in public station catalogs. Current public information confirms the station's online stream exists, but the specific HLS URL and Android browser playback were not verified from this environment. See sources in the project search history and retest on device.

## 5. Bot workspace

- Removed `tabBots` and `botsSection` from the primary navigation.
- Added a Tools tile: «Боты и Царь-бот».
- Bot workspace mounts inside Tools and can return to Tools.
- Added a local editor for bot source drafts:
  - paste source;
  - import `.js`, `.mjs`, `.ts`, `.json`, `.txt` up to 1 MB;
  - local autosave;
  - copy source;
  - download `index.js`.
- Existing management and API Edge Functions remain active: `rim-bot-manage` v3, `rim-bot-api` v2.

### Not done

- The editor does not execute arbitrary code.
- Drafts are local to the browser and are not server-side project files.
- The `Царь-бот` / `@Imperator_bot` system chat is not implemented.
- A safe per-bot isolated runtime is not implemented.
- Webhooks, inline keyboards, callbacks, file methods and Mini Apps remain future work.

Reason: executing untrusted code inside the RIM app would expose the user's session and application data. Supabase Edge Functions are request handlers, not a persistent arbitrary-code hosting service. A dedicated isolated runtime with strict quotas and no service-role secret exposure is required.

## 6. E2E crypto foundation

### Implemented locally

- `RimE2ECryptoEngine` using WebCrypto:
  - P-256 ECDH;
  - HKDF-SHA-256;
  - AES-256-GCM;
  - per-envelope ephemeral ECDH keypair;
  - random salt and 96-bit IV;
  - AAD bound to conversation/sender/recipient/message IDs;
  - separate sender and recipient envelopes.
- `RimE2EIdentityVault` stores a non-extractable private CryptoKey in IndexedDB.
- Tests cover sender/recipient round trip, ciphertext tampering and context mismatch.

### Not production E2E

The engine is not integrated with the message send/render pipeline. `chat_messages.body` remains plaintext. No authenticated key registry, signed prekeys, one-time prekeys, safety-number verification, Double Ratchet, forward secrecy, post-compromise security, multi-device support, attachment encryption, key backup/recovery or independent audit exists.

Do not enable or advertise E2E. See `docs/E2E_IMPLEMENTATION_DECISION.md`.

## 7. Localization/theme architecture

Added `docs/LOCALIZATION_ARCHITECTURE.md` for future modular locale dictionaries, BCP 47 identifiers, fallback chains, plural/date/number formatting, RTL-safe CSS logical properties and semantic theme tokens. No new locale or theme was added, as requested.

## 8. Production Supabase state checked

No migration or Edge Function deploy was made in iteration 134.

Read-only checks returned:

- `public.rim_seed_only_readiness()` = `false`;
- `rim_bots` count = 0;
- `rim_bot_updates` count = 0;
- Edge Functions: `rim-account-security` v15 ACTIVE, `rim-bot-manage` v3 ACTIVE, `rim-bot-api` v2 ACTIVE, `rim-push` v7 ACTIVE, `telegram-auth` v6 ACTIVE.

Strict seed-only authentication is not enabled. The Auth Hook being selected does not itself complete the seed-only rollout; two-account/session testing and readiness checks are still required.

## 9. Verification

| Check | Result |
|---|---|
| `npm run check` | PASS — 111 mapped source modules |
| `npm run check:syntax` | PASS — 293 JS files |
| `npm test` | PASS — 455/455 |
| `npm run test:e2e` | SKIPPED — Playwright package unavailable |
| `npm run build:cloudflare` | PASS — 151 Worker assets, 152 Pages-only files |
| `npm run audit:html` | 91 innerHTML sites; 13 REVIEW, 24 OK, 54 static |
| Physical Android | Not run |
| Two-account Telegram/seed-only | Not run |
| Bot live execution | Not run |
| Load test | Not run |

## 10. Code quality assessment

Iteration 134 improves local lock behavior, removes a known blocking path in chat rendering, improves bot authoring access and adds an isolated experimental crypto core. However, the major product gaps remain: production E2E, isolated bot runtime, Telegram OIDC real-device callback confirmation, Android no-VPN test and full browser E2E.

This is an engineering progress release, not a claim that all requested systems are production complete. The code quality score should be reported separately from feature completeness; see final summary for the scoped assessment.
