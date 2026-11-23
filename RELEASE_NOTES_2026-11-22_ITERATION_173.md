# RIM 4.1.8 — Iteration 173

## Direct E2E peer-verification correction

- Before acknowledging a peer challenge, the receiving client now checks current Supabase membership for the exact conversation ID and verifies the sender is an actual participant. Relay-level shared-scope membership alone is not treated as proof for the named chat.
- When a direct-chat participant receives and successfully decrypts an authorized Signal challenge, then successfully sends the encrypted ACK through the production relay, that responder now marks the exact direct conversation as verified locally.
- The initiator still marks its scope only after receiving and validating the matching ACK.
- This removes an unnecessary second challenge round-trip when the responder sends its first reply.
- The change is intentionally limited to `direct` scopes. A single peer challenge must never mark a multi-member group or private channel fully verified; those still require `verifyScopeExchange()` to confirm every participant.
- Added a two-runtime test asserting that both participants reach the same direct-scope verification state, a negative test that rejects a challenge from a user who is not a member of the named scope, and retained the group test proving one challenge does not certify the whole group.

## Validation boundary

The full Node suite passes 659/659, syntax and project checks pass, the two-account in-memory relay test passes 2/2, and the Cloudflare build passes (167 Worker assets / 168 Pages assets).

This is a source/runtime correctness improvement. It does not constitute a live production Supabase test and does not finish QR pairing, multi-device history transfer, per-device ACK recovery, or encrypted attachments/media.
