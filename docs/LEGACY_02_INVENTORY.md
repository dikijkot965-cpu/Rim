# Legacy 02 inventory (path to retirement)

## Role
Last script tag in `index.html`. Owns:
1. Supabase client (`db`) + publishable URL/key
2. Lexical app state: `currentUser`, `conversations`, `activeConversation`, `messagesCache`, …
3. Auth: `login`/`register`/`signOut`/`onAuthStateChange`/`getSession` boot
4. `initializeApp` first-paint orchestration
5. Baseline UI functions (open/send/render/…) **overwritten by modular** after `app.js` loads
6. Helpers: `toast`, `esc`, `tr`, viewport, service worker

## Why not deleted yet
`window.__RIM_LEGACY_CONTEXT` **closes over lexical bindings** declared in 02. Modular composition reads that context. Removing 02 without a replacement bootstrap breaks `db` + state + auth.

## Retirement plan
1. **Mirror** lexical state onto `window.*` (done iter.88) so bridge is less fragile.
2. Extract **bootstrap-only** script: client + state + auth + `initializeApp` shell + context freeze.
3. Delete baseline UI function bodies that modular already owns (or never assign them).
4. Point index at bootstrap-only; smoke auth + open + send on live/mock.
5. Optionally move Supabase config to env/build — not required for level 2.

## Functions modular already replaces (safe to stub later)
openConversation, loadMessages, sendMessage, renderMessages, edit/delete/react, newDirect/Group, forward, settings/profile nav, channels, etc.

## Must stay until bootstrap extract
db, state vars, auth handlers, initializeApp, toast/esc, session start IIFE.
