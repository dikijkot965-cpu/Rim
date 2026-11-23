# RIM E2E — engineering status (iteration 140)

## Current truth

Direct-message E2E is **not enabled in the message send/read path**; E2E is still not active for direct messages, private groups, or private channels. The experimental engine is **not yet a production protocol**. Existing `chat_messages.body` and `channel_posts.body` remain the ordinary plaintext path. Do not show an E2E lock badge or claim that any production conversation is protected. The earlier P-256 experimental crypto engine is not a production protocol and has no proven forward secrecy for message sequences.

## SDK selected for integration work

The candidate is now pinned in `package.json` as `@open-e2ee/signal-protocol-sdk@14.7.0`, with `idb` for its browser IndexedDB adapter and `esbuild` for local browser bundling. Public repository/package metadata confirms MIT OR Apache-2.0 licensing and Node >=22.12 for package development. The package exposes `createSignalProtocolClient()`, `webSqliteStore()` for OPFS, and `indexedDbStore()` as a fallback. `idb@8.0.3` is pinned as the browser-store peer dependency.

The SDK documents PQXDH session establishment, Double Ratchet, post-quantum ratcheting, multi-device support, groups, encrypted attachments and safety-number verification. It is an independent implementation, not affiliated with Signal and not wire-compatible with Signal Messenger or libsignal. Its own assurance/security material says it has not received an independent security-firm audit. Its JavaScript/browser storage model cannot protect plaintext from compromised same-origin JavaScript.

Sources reviewed:
- Repository: https://github.com/open-e2ee/signal-protocol-js
- Package: https://www.npmjs.com/package/@open-e2ee/signal-protocol-sdk
- Adapter contract: https://docs.open-e2ee.dev/reference/adapters
- Browser IndexedDB store: https://github.com/open-e2ee/signal-protocol-js/tree/main/local/store/web
- Security model: https://github.com/open-e2ee/signal-protocol-js/blob/main/docs/SECURITY.md

## What Iteration 140 changes

- Exact package dependency pin `14.7.0`, `idb@8.0.3`, `esbuild@0.27.0`, and a complete npm `package-lock.json` with published package integrity metadata. The exact SDK tarball is preserved under `vendor/`.
- Lazy browser runtime wrapper `src/security/e2e/signal-protocol-runtime.js`.
- Browser OPFS SQLite store is now preferred (`webSqliteStore`, encrypted at rest); IndexedDB record-cipher store is a fallback only for explicit `OPFS_UNAVAILABLE`.
- Strict protocol policy (`postQuantum: required`, `braid: required`).
- Optional injected relay factory boundary; decrypted-message hook persists through an application callback.
- Fail-closed behavior: no relay means no incoming subscription and no send; `protocolReady` remains false even if the local client initializes.
- `esbuild` now builds the RIM app and the SDK SQLite module worker separately. The exact SDK `worker.js` is bundled to `assets/js/e2e/sqlite-worker.js`; the 1.04 MB SQLite3 Multiple Ciphers Wasm is copied to `assets/js/e2e/sqlite3.wasm`. Runtime passes both same-origin URLs explicitly to `webSqliteStore`, avoiding the missing dynamic-worker/Wasm asset problem that a main-app-only bundle would leave behind. Pages copies both assets, sets `application/wasm`, and applies a worker CSP that permits `wasm-unsafe-eval`. The first real SDK build exposed and fixed this asset-discovery gap.

## What is not complete

- Direct npm installation from the local execution container remains unavailable: DNS lookup returns `EAI_AGAIN` for `registry.npmjs.org`, HTTPS requests to npm/GitHub fail, direct-IP `curl --resolve` cannot connect, and the local HTTP proxy at `127.0.0.1:8082` is closed. This is an outbound network restriction, not an SDK/Node version conflict.
- The workaround succeeded: a read-only GitHub Actions workflow on a network-enabled runner installed SDK 14.7.0, idb 8.0.3 and esbuild 0.27.0; npm packed the exact scoped tarball; the workflow verified its SHA-512 against the published npm integrity; and the Actions artifact was downloaded into this build environment. The local `node_modules`, vendor tarball and full lockfile are now present in the working tree.
- A real SDK client smoke test passed using the SDK's in-memory store and strict `postQuantum: required` + `braid: required` policy. This validates installation and public API composition only; in-memory storage is explicitly not production storage. The actual web SQLite adapter correctly reports `OPFS_UNAVAILABLE` in Node because Node has no browser OPFS/Web Locks; browser OPFS and Android runtime still need testing.
- No Supabase `SignalProtocolRelayServer` adapter exists yet. The adapter is a large security boundary: authenticated device registration, server-owned device slots, identity-key ownership, atomic one-time-prekey consumption, envelope ID preservation, redelivery/ack semantics, groups and connection state must all be implemented.
- No RIM message outbox/inbox adapter maps SDK envelopes to RIM chat rows.
- No two-account or two-browser encrypted exchange has run.
- No message attachment encryption, safety-number UI, key-change warnings, device revocation, backup/recovery or multi-device UX is complete.
- No scope can be moved to `required`; `E2EScopeRepository` remains `protocolReady: false`.

## Required next steps

1. Test the installed SDK browser SQLite store on real Android Chrome/WebView, including OPFS success and the explicit IndexedDB fallback.
2. Implement the complete custom relay contract on Supabase Edge Functions + Postgres RPCs. Keep private keys and ratchet state only on the device.
3. Add direct-message message-envelope mapping and strict server-side write/read gates. No silent plaintext fallback or downgrade.
4. Run two independent accounts in two browsers and test offline delivery, duplicate/reordered envelopes, retries, restarts, multiple devices and key changes.
5. Add identity verification and recovery/revocation flows. Review CSP and third-party scripts.
6. Only after independent review and successful integration tests consider activating direct-message E2E. Private groups/channels come after direct messaging.

The browser store reference is `local/store/web-sqlite/README.md`; it describes SQLCipher-encrypted OPFS storage with a same-origin IndexedDB secret vault. The IndexedDB record-cipher store remains the fallback for browsers that explicitly lack OPFS.

## Browser threat model

The app server delivers the JavaScript that performs encryption. A compromised RIM deployment or same-origin XSS can read plaintext or invoke local key handles. IndexedDB persistence is not protection against malicious same-origin code. RIM must harden CSP, reduce third-party scripts, avoid plaintext analytics/error capture, and consider a signed native client if stronger code-delivery assurance is required.

## Zлыдя and E2E

Zлыдя server-side SQL triggers skip conversations marked `e2e_mode='required'`. This is deliberate: a normal server-side bot cannot read E2E plaintext. Bot access in encrypted scopes would require a separately designed and explicitly consented endpoint/device model.
