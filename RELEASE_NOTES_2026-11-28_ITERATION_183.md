# RIM 4.1.8 — Iteration 183

## Search navigation reliability
- Replaced per-query microtask binding with one delegated click listener attached to the results container after HTML insertion.
- User, channel, message and public-group actions now bind against the rendered result tree; asynchronous search completion no longer races event-handler registration.
- User and channel result rows are semantic buttons, supporting keyboard activation.
- Public-group join remains a distinct action and delegates to the existing server-authorized join flow, which opens the group after successful membership.
- Channel creation now fails closed if owner membership cannot be written; it attempts to roll back the channel and uploaded avatar instead of reporting a partial creation as successful.
- Unsupported avatar MIME types are rejected before upload.
- Removed the decorative RIM wordmark pill from the main application header; the authentication branding remains intact.

## Scope
- No database schema changes.
- No changes to Signal Protocol, key material, ciphertext storage, or E2E policy.
- Existing search query and visibility rules are retained.

## Verification
- Added regression coverage for post-render event delegation, all four navigation actions, and keyboard-accessible result controls.
- Full repository CI is required before merging. Manual authenticated Android acceptance remains necessary.
