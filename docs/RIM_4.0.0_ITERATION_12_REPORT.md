# Iteration 12 — critical message load fix

## Bug

Deployed build showed: `Не удалось загрузить сообщения: this.setMessages is not a function`.

## Cause

`src/compatibility/legacy-bridge.js` validated that `setMessages` exists on the context, then returned a frozen object **without** `getMessages` / `setMessages`. Timeline controller called `this.setMessages(rows)` on `undefined`.

## Fix

Bridge now passes through:
- getMessages, setMessages (required)
- getReplyTarget, getConversations, notify (with safe defaults)

## Tests

`tests/legacy-bridge.test.js` — exposes setters; fails closed when missing.

`npm run verify`: 128 passed.
