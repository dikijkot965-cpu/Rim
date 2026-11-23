# Iteration 174 — design integration review

## Canonical HTML source
The Grok-edited `cloudflare-pages/index.html` was promoted to the repository-root `index.html`.
The Cloudflare build deletes and regenerates `cloudflare-pages/` from the root source, so editing only
the generated Pages artifact causes the redesign to disappear at the next build.

## Confirmed design additions
- New RIM header/avatar and global search overlay.
- Feed navigation, feed composer, comments sheet, and feed tabs.
- Telegram-like settings surface and attachment action sheet.
- Existing legacy IDs are retained where the modular controllers expect them.

## Important functional boundary
The feed implementation embedded in the redesigned HTML is still a local prototype:
posts/comments are stored in browser `localStorage`; it does not call Supabase `feed_posts`
or the Iteration 135 social-feed RPC/data model. Media preview also uses local browser data.
Therefore a post created on one device is not a server-backed publication and will not sync
to another account/device. Do not describe this UI as a production social feed until the
Supabase repository/controller integration, media Storage policies, pagination, and RLS
are connected and tested.

## Channel UI boundary
The redesigned shell hides the legacy `channelsSection` and relies on channels appearing
through the chat list / existing channel controllers. This is not yet a complete Telegram
channel profile/settings/feed redesign. The next pass should complete the channel header,
subscriber count, pinned post, reactions/comments entry, media tabs, subscriber/admin lists,
ban list, and channel settings against the existing channel repositories/RPCs.

## E2E boundary
No E2E source, migrations, SDK, relay, key handling, or diagnostics code was edited by this
design integration patch. Iteration 174 already contains its own E2E changes from Iteration 173;
those remain unchanged.
