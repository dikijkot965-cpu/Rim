# RIM E2E — current code status at Iteration 178

## Connected in code
- `RimSignalProtocolRuntime` uses `@open-e2ee/signal-protocol-sdk@14.7.0` and the RIM-owned `SupabaseSignalProtocolRelay`.
- `src/app.js` creates `E2EScopeRepository` with scope-specific `e2eSignalRuntime.isScopeVerified(scope)`.
- `MessageCommandService.sendText` routes E2E-required direct/group messages to `sendDirect`/`sendGroup`; required scopes do not use plaintext `chat_messages.body`.
- Secret direct chats are marked `e2e_mode='required'`; scope checks require `is_secret=true`.
- Protected scopes require encrypted challenge/ACK and active-device readiness. If readiness is missing, send is blocked; no plaintext fallback exists.
- Incoming ciphertext is decrypted by the SDK and persisted in the account-isolated local E2E store.

## Automated test boundaries
- Unit tests cover SDK adapter, relay contract, envelope flow, challenge/ACK state, scope authorization and fail-closed behavior.
- `npm run test:e2e:relay` uses a test in-memory relay. It does not set production `protocolReady=true`; it is not a live two-account acceptance test.
- CI verifies SDK/browser-store files and builds the Cloudflare bundle.

## Still required
- Two independent real RIM accounts in two real browsers/devices.
- Live primary-device registration, prekey exchange, challenge/ACK, send/receive, browser restart and local-history recovery.
- Offline recipient, duplicate delivery, account switching and Android Chrome/WebView OPFS/IndexedDB testing.
- Independent review of SDK and relay security.

Iteration 178 does not modify E2E protocol, relay, keys, SDK or message path.
