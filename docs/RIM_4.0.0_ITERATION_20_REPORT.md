# Iteration 20

Consolidated message post-render decorations that were stacked as successive `renderMessages` wrappers in legacy modules 06, 18 and 24 into `MessageDecorationsController`.

Ownership flag `__RIM_MESSAGE_DECORATIONS_OWNED` prevents double decoration. App wrap order: legacy base render → modular decorations → read receipts.

Verification: 169 Node tests passed. UI/CSS unchanged. No production Supabase changes.
