# Status from .89

## Level 2 (legacy tags = 0) — DONE for `assets/js/legacy/`

No `<script src="assets/js/legacy/...">` in index.html.

## Remaining shim (documented)
`assets/js/rim-runtime-bootstrap.js` — classic script with Supabase client, lexical state, auth, initializeApp. Not under legacy/.

## Next (level 2 polish / level 3)
1. Thin bootstrap: delete UI bodies modular already owns.
2. Live Supabase QA.
3. Optional: move bootstrap state into ES module entry.
