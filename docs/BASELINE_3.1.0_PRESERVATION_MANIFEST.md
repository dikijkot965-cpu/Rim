# RIM 3.1.0 — baseline inventory and preservation manifest

Generated from the user-provided archive before internal migration work. SHA-256 values below are the preservation reference. In iteration 3.2.0, `index.html` and `assets/css/rim-architecture.css` received narrowly scoped additive integration changes: a setter in the compatibility bridge and a history-button style. The rest of the original interface markup/styles and image assets remain intact.

- Archive entries: 84
- Legacy scripts: 25
- HTML IDs: 40
- Baseline tests: 27 passed / 27 total
- Iteration 3.2.0 tests: 32 passed / 32 total
- Iteration 3.2.0 tests: 32 passed / 32 total
- Baseline `npm run verify`: passed

## Original 3.1.0 reference hashes (pre-iteration)

| File | SHA-256 |
|---|---|
| `index.html` | `a7b93fff47de820c8144c528b7a746d82588e828f1898c3d90818da07d4edb20` |
| `assets/css/rim.css` | `ffa016addcab99f6c4f25956294a59d1d9fc2ec120b13bcdbea20526580dffd3` |
| `assets/css/rim-architecture.css` | `50cf65d523b444b7ea020011f29cbea327690dc094ec9cc0768fcc72a9b7b662` |
| `assets/images/image-99781d28546b3135.webp` | `99781d28546b3135066ddc2e9a1adaf9fee0e884ca874d87d2ce47c97b2d1e07` |
| `assets/images/image-18f99e7f725387ec.webp` | `18f99e7f725387ec9105a69c15400c48b4cacbd326e4e31439b2561e54001bfa` |
| `assets/images/image-32f490785c4e5509.webp` | `32f490785c4e550914143f531cf6aff72326f90bb68aa9e952755f01ff75ef4e` |
| `assets/images/image-be52a22bc9c8be60.webp` | `be52a22bc9c8be60e7d8dbf36719283f4a11470b1eab26fd2fc563124514651d` |
| `assets/images/image-ae420690cc37899d.webp` | `ae420690cc37899d22ad72de2ebe08a64bfb3eb6e7d22740a02fd6f9d4b32563` |
| `assets/images/image-8de2eb8016a774f6.webp` | `8de2eb8016a774f690e68b8a0114fa5bfb0a099fbf337fb6ca6f71c769cc6e3b` |
| `icons/icon-192.png` | `092262fc48c28ca5c1daf5bfaf6a0ce0885700a0f870c970564c9c7e73aaa54b` |
| `icons/icon-512.png` | `296590e4c0ab89007dde0de0d88fd3bf1ae3babfcc38ea9a675c7ba17e3648ea` |

## Runtime entrypoint inventory

- 25 ordered legacy scripts are loaded from `index.html`.
- Supabase JS is loaded from jsDelivr using a floating `@2` major-version URL.
- `assets/js/core/rim-core-release.js` is loaded as a classic script.
- `src/app.js` is loaded as an ES module.
- CSS: Google Fonts, `assets/css/rim.css`, `assets/css/rim-architecture.css`.

## Baseline limitations

The baseline check does not establish browser E2E correctness, live database schema compatibility, RLS correctness, two-account isolation, Android behavior or capacity. See `RIM_4.0.0_EXECUTION_SPEC.md`.

## Iteration delta

- `index.html`: one additive `setMessages` bridge method; no screen structure or existing element IDs were redesigned.
- `assets/css/rim-architecture.css`: one scoped `.rim-history-button` rule.
- Original `assets/css/rim.css`, image assets, and icon files are unchanged.

## Iteration delta

- `index.html`: one additive `setMessages` bridge method; no screen structure or existing element IDs were redesigned.
- `assets/css/rim-architecture.css`: one scoped `.rim-history-button` rule.
- Original `assets/css/rim.css`, image assets, and icon files are unchanged.
