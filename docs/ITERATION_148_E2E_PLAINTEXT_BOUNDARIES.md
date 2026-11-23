# Iteration 148 — E2E plaintext boundary audit

## Findings

1. **Offline outbox:** `MessageOutboxService` v2 serializes message bodies into `localStorage`. A failed send in an E2E-required chat could therefore have persisted plaintext even though the send command itself failed closed. The composer now calls `MessageCommandService.canQueuePlaintextOutbox()` before enqueue. Required scopes, scope lookup failures, missing E2E repository and unknown group privacy all prevent queueing.
2. **Private groups:** E2E eligibility already included private groups, but composer text and attachment guards were limited to direct chats. The command service now checks both direct and group scopes; required group text is blocked because the current SDK route is direct-only. Stickers and images are also blocked before their legacy writes.
3. **Forward target:** rejecting a local-only E2E source was insufficient; forwarding a legacy message into an E2E-required destination could still write plaintext there. The forward service now loads target scope metadata and checks E2E before any file copy or insert.
4. **Voice uploads:** voice messages bypassed `MessageCommandService` and uploaded audio before inserting metadata. The voice controller now verifies scope before upload and rejects required scopes until encrypted attachments are implemented.
5. **Account switch:** an SDK send can be accepted just as the authenticated account changes. The runtime now avoids writing that accepted old-account plaintext into the newly active local message cache; the command service also avoids reading/rendering local history for a different active account.
6. **Voice concurrency:** E2E scope verification is asynchronous, so the send lock now starts before that check to prevent two simultaneous recording sends from passing the initial guard.

## Deliberate limitations

- E2E group transport is not implemented; required private groups are blocked, not partially supported.
- Voice/media attachments are not encrypted; they are blocked in required scopes before upload.
- Outbox is still a plaintext legacy queue for non-E2E scopes. It is not an encrypted E2E outbox.
- `protocolReady=false`; no E2E scope can be activated.
- Live Supabase delivery, SQL runtime, Android/OPFS and browser automation remain outstanding.

7. **Local-store account binding:** IndexedDB account namespacing alone did not fully cover an auth change during an asynchronous crypto operation. The store now accepts an expected account ID, checks it before and after key/encryption work, and opens only that account's database. SDK incoming callbacks carry their owning user ID. Mid-encryption changes abort before a cache write; a change during local-history decryption aborts rather than returning old-account plaintext.
