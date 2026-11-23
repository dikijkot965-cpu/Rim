# RIM localization and theme architecture — future requirement

This iteration does not add a new language or redesign the theme system. Future features must avoid embedding user-visible strings throughout application logic.

## Localization rules

- UI text belongs in locale dictionaries, not in repositories, controllers or business rules.
- Use stable semantic keys such as `chat.send`, `settings.deviceLock.timeout`, `bots.create.title`.
- Keep dictionaries split by feature (`common`, `auth`, `chat`, `channels`, `radio`, `bots`, `settings`) so a language pack does not become one enormous file.
- Use a fallback chain: exact locale → base language → `ru` → visible key-safe fallback.
- Use `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat` and `Intl.PluralRules`; never concatenate plural endings manually.
- Keep locale identifiers standard BCP 47 (`ru`, `en`, `tt-RU`, etc.).
- Preserve Unicode and UTF-8 in source, database, JSON and ZIP assets.
- Do not assume all text is left-to-right. Layout should use CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`) and `dir` attributes.
- Do not build language-specific branches into domain rules. Domain data should be locale-neutral; only presentation is localized.
- Theme values belong in CSS custom properties/tokens. Feature components should consume tokens rather than hardcode palette values.

## Suggested structure when implementation begins

```text
src/i18n/
  index.js
  locale-registry.js
  formatters.js
  locales/
    ru/
      common.json
      chat.json
      channels.json
      bots.json
    en/
      common.json
      chat.json
      channels.json
      bots.json
    tt-RU/
      common.json
      chat.json
      channels.json
      bots.json
```

## Adding a language

1. Register the BCP 47 locale and fallback.
2. Copy the feature dictionaries from the base locale.
3. Translate values without changing keys or interpolation tokens.
4. Run dictionary completeness and interpolation tests.
5. Verify long strings, plurals, date/number formats and mobile layouts.
6. Verify RTL independently if the new locale requires it.

## Adding a theme

- Add a named token set in a separate theme stylesheet/module.
- Keep semantic tokens (`--surface`, `--text`, `--muted`, `--accent`, `--border`, `--danger`) stable across themes.
- Never make application behavior depend on a theme name.
- Test contrast, focus, disabled and error states for each theme.
