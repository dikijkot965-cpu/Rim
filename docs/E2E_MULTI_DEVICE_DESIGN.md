# RIM E2E multi-device design and implementation boundary

## Current verified state

- Supabase relay device records support numeric device slots 1–5. Relay operations authenticate the current user/device and revoked devices are guarded by the server.
- Device removal/revocation and delivery acknowledgement checks exist in the backend.
- The browser Signal runtime still sets `deviceId = 1`, uses an account-scoped local SDK database name, and deliberately refuses to register a fresh primary device if a server-side device exists but the local identity is absent.
- No secure QR linking, device-to-device private state transfer, encrypted history synchronization, or full all-device fan-out acceptance test exists.
- `protocolReady=false`; do not activate E2E-required chats.

## Target architecture

### 1. Each device is a distinct cryptographic endpoint

Every linked browser/phone receives its own device ID, Signal registration state, identity key material, signed prekeys, one-time prekeys, and local encrypted database. Never copy a raw database file through an ordinary upload or send private keys to Supabase. A device ID is not a user ID and must not be reused after revocation.

The local SDK database name must include a stable account hash and the assigned device ID. The runtime must stop hardcoding device 1 and must keep account/device switching isolated.

### 2. Pairing uses an authenticated ephemeral channel

1. The new device creates an ephemeral ECDH key pair and a short-lived pairing challenge.
2. It displays a QR payload containing only protocol version, account/device request metadata, the ephemeral public key, nonce, and expiry. No private key, recovery phrase, access token, or long-lived secret is encoded in the QR.
3. The already trusted device scans or imports the QR, displays the target device details, and requires explicit owner confirmation.
4. Both devices derive a one-time transfer key using ECDH + HKDF; the primary device encrypts a narrowly scoped device-authorization package to the new device with authenticated encryption.
5. Both devices display a short authentication string derived from the transcript. The user confirms it matches on both screens.
6. The server atomically allocates an unused slot 2–5, binds it to the authenticated account, and accepts only public identity/prekey material.
7. The new device generates and persists its own Signal identity and publishes public prekeys. It does not become trusted merely because a QR was displayed.

The exact cryptographic primitives and SDK store export/import contracts must be validated against the pinned SDK before implementation. Do not invent a custom Signal ratchet or copy undocumented SDK internals.

### 3. Message synchronization is encrypted fan-out

- Sender encrypts separately for every active recipient device and for the sender's other active devices, using the SDK's supported multi-device model.
- Relay stores only opaque ciphertext envelopes and minimal routing metadata.
- A device acknowledges only envelopes addressed to its own device ID.
- Realtime is a wake-up mechanism; each device must recover missed envelopes with cursor-based mailbox pulls after reconnect/restart.
- Delivery state is per device; a single device ACK must not mark a message delivered to every device.

### 4. History synchronization is a separate encrypted operation

A new device cannot decrypt old messages merely because it has a new Signal identity. History sync must use an explicitly approved encrypted archive/snapshot or device-to-device transfer protocol. The server must never receive plaintext message history or a reusable archive key. The user must be able to decline history import and start with new messages only.

### 5. Revocation and recovery

- Revocation creates a durable server tombstone; the relay rejects new sends, pulls, ACKs, and key requests from the revoked device.
- Online devices receive a revocation event and close local sessions; remote wipe cannot be guaranteed for an offline or compromised device.
- Account recovery must not silently restore old device trust. A recovered account must explicitly re-link or re-enroll devices.
- Device labels, last-seen, browser type, and fingerprint are metadata only, not proof of identity.

## Required implementation sequence

1. Add server-side atomic device-slot allocation and concurrency tests.
2. Add per-device local storage namespaces and migration tests while preserving existing device 1 data.
3. Validate SDK multi-device send/receive and own-device fan-out APIs using two real devices.
4. Implement QR pairing with ephemeral authenticated encryption and transcript confirmation.
5. Implement encrypted history transfer as an opt-in independent feature.
6. Implement per-device delivery state, offline mailbox recovery, revocation propagation, and device list UI.
7. Test browser restart, Android Chrome, Android WebView, account switching, lost-device revocation, and interrupted pairing.
8. Only then integrate encrypted messages into ordinary RIM timeline/send/search and consider changing `protocolReady`.

## Search implications

Server-side `ILIKE`/full-text search over `chat_messages.body` is incompatible with E2E-required scopes because the server must not see plaintext. Plaintext chats can use a server-side indexed search path; E2E chats need a device-local encrypted search index built from messages already decrypted on that device. Results must never silently omit encrypted content while claiming a complete search.
