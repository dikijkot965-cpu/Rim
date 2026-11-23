# Authenticated RIM E2E live test

The lab is an opt-in diagnostics surface for testing the deployed Signal SDK + Supabase Edge Function using ordinary signed-in RIM accounts.

## Open it

Append `?rim-e2e-lab=1` to the existing RIM URL. If the URL already has query parameters, append `&rim-e2e-lab=1`. The panel is not shown during normal app use.

## Two-account test

1. Open RIM as account A in one browser/device. Open an existing direct chat with account B before opening the lab; the lab attempts to prefill the conversation and peer IDs.
2. Open the lab and press **Проверить устройства**. This is read-only and uses the active Supabase session.
3. Press **Запустить SDK и подключить Relay** and accept the confirmation. This can register device 1 if no E2E device exists and will create the local Signal identity and upload public prekeys. Never clear browser site data after enrollment.
4. Open RIM as account B in a separate browser profile/device. Open the same direct chat and repeat steps 2–3.
5. On A, verify the peer UUID and direct conversation UUID, then press **Отправить E2E-тест**. On B, the panel should report that the synthetic test message was received and decrypted.
6. Reverse direction from B to A. This verifies both directions across independent authenticated sessions.
7. Press **Остановить локальную сессию** on each side when finished. This stops the SDK and Realtime subscription only; it does not revoke server device registrations.

## Important safety boundaries

- Do not use the test button with a conversation that is not a real direct chat containing exactly the two selected accounts.
- If the account already has a registered primary E2E device but this browser has no matching local identity, startup deliberately fails. Do not attempt to remove/re-register it; secure device linking/key transfer is a separate unfinished workflow.
- The test payload is sent through the encrypted SDK and relay, but it is not inserted into the ordinary RIM message timeline. This avoids confusing a transport test with production message integration.
- `protocolReady` remains false and E2E is not activated for normal conversations.
- Never paste a password, access token, refresh token, or private key into the lab or into ChatGPT.

## What the result proves

A successful round trip proves that the two browser clients authenticated, registered/loaded their local Signal state, exchanged prekeys through the deployed Edge Function, sent an SDK ciphertext envelope, received it through Realtime or mailbox recovery, and decrypted the payload on the peer device. It does not yet prove restart recovery, multi-device linking, full RIM timeline integration, attachments, calls, group sender-key operation, or a production-ready recovery flow.
