# Direct-message loading — iteration 134 investigation

## Evidence from the live Supabase project

The observed project logs contain successful PostgREST requests for `chat_messages` (HTTP 200, roughly tens of milliseconds for the sampled requests), successful `conversation_members` reads and a Realtime WebSocket upgrade (HTTP 101). In that captured session, the message REST API itself was responding; this does not prove that every user's ISP/network can reach every Supabase service.

The modular message renderer previously awaited both profile lookup and all signed Storage image URLs before painting the conversation. If Storage or one media URL was slow or blocked, the message text could remain invisible even after the message query had succeeded. That is a credible cause of an endless loading state on networks where Storage access differs from REST access.

## Changes in iteration 134

- Paint message text after a bounded profile lookup; profile timeout falls back to generic author labels.
- Load image URLs after the text timeline is visible.
- Limit concurrent image URL requests to three.
- Each image URL request has a five-second timeout and degrades to an inline unavailable state.
- Message history requests have a 12-second timeout and abort signal where supported by the PostgREST builder.

## What this does not prove

- It does not prove the user's VPN is no longer needed for all networks.
- It does not alter DNS, ISP routing or regional restrictions.
- It does not proxy Supabase traffic through another provider.
- It has not been tested on the user's physical Android device without VPN.

## Required manual test

1. Sign in with VPN disabled.
2. Open a direct conversation containing only text.
3. Open one containing several images.
4. Disable network briefly and restore it.
5. Confirm text remains visible if media signing fails and the UI reports a recoverable media error rather than spinning forever.
6. Capture the browser console and network request status for any remaining failure.
