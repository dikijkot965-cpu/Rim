# RIM 4.0.0 — iteration 3 report

Date: 2026-11-13

## Scope

A larger, end-to-end application-layer migration of message mutations while preserving the existing composer markup, visual design, and legacy renderer. No production database changes were made.

## Implemented

### Application service

Added `src/application/message-command-service.js` and registered it in the composition root/container.

The service now owns:
- text-message creation;
- sticker-message creation;
- image upload plus message creation;
- own-message editing;
- own-message deletion.

### Validation and concurrency

- Text and edited message bodies are trimmed, reject empty content, and enforce the database's 4,000-character limit using Unicode code-point counting.
- Image uploads accept JPEG, PNG, WebP, and GIF up to 5 MiB.
- The storage extension is derived from the validated MIME type, not the user-supplied filename.
- Send commands share an in-flight lock; edit/delete operations for the same message share a mutation lock.
- Edit/delete are restricted to messages present in the active conversation projection and repository filters also include the active conversation ID and authenticated sender ID.
- Context (conversation, reply, topic) is captured before asynchronous preflight so navigation while a request is pending cannot attach the new conversation's reply/topic to the old request.
- A completed database mutation remains a success even if the follow-up UI refresh fails; the user receives a separate refresh warning rather than being prompted to resend an already committed message.

### Image storage lifecycle

- Image uploads use `upsert: false` and a generated UUID path.
- If the message insert fails, the service attempts to remove only the just-uploaded object.
- If cleanup also fails, the returned error reports that the object may remain in storage and includes its path for later maintenance.

### Compatibility

- Existing HTML composer and buttons were not redesigned.
- Existing global entry points remain available (`sendMessage`, `sendSticker`, `sendImage`, `editMessage`, `deleteMessage`), but route through the application service.
- Existing message rendering and Realtime timeline remain responsible for presentation and synchronization.
- Topic IDs are carried into text, sticker, and image messages when a topic is active.

## Supabase inspection

Read-only inspection of the connected Imperial Messenger project confirmed:
- `chat_messages.body` has a 4,000-character database constraint;
- INSERT policy requires `sender_id = auth.uid()` and conversation membership;
- UPDATE policy restricts author ownership and checks conversation membership;
- DELETE policy restricts author ownership;
- `user_blocks` has `blocker_id`, `blocked_id`, `created_at` and a SELECT policy exposing only the current user's own block rows;
- `chat-files` has upload/delete policies and conversation-aware image read policies matching the existing `{user_id}/{conversation_id}/{generated_name}` path layout.

Direct-chat preflight therefore checks whether the current user has blocked the peer. It does not attempt to inspect whether the peer has blocked the current user, because the existing `user_blocks` RLS policy intentionally does not expose other users' block rows. This remains a server-side product-policy question; no broader visibility was introduced.

## Verification

`npm run verify` passed after the final changes:
- project integrity check passed; 35 JavaScript files discovered by the project checker;
- syntax check passed; 61 JavaScript files checked;
- Node test suite: 48 passed, 0 failed.

Coverage includes validation, reply/topic payloads, concurrent duplicate submissions, fail-closed preflight, MIME/size checks, image cleanup, mutation ownership/conversation scoping, refresh failure after commit, and navigation during pending work.

## Not done / not claimed

- No production Supabase SQL, RLS, Storage policy, Auth, or schema changes were applied.
- In-flight locks prevent duplicate concurrent taps in one page instance; they do not provide durable exactly-once delivery after a client/network timeout. Durable idempotency requires a client command ID and a database-side uniqueness/transaction design, which is not present in the current schema.
- No optimistic message rendering was added; the existing Realtime/history path remains the synchronization mechanism.
- No real two-account browser test, Android device test, or production load test was run.
- This is not a certification for 10,000 concurrent active users.

## Next work

1. Add integration/browser smoke coverage around the actual legacy inline handlers and module boot order.
2. Audit read-state/last-message projection so a successful send updates chat ordering and unread counters without redundant full refreshes.
3. Design durable send idempotency without breaking the current schema or legacy clients.
4. Continue migration of forwards, attachment metadata, reactions, and read receipts as separate use cases.
