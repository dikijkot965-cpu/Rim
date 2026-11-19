# Iteration 50 — Settings surface composition + dual-bind regression

**Date:** 2026-11-16  
**Version:** 4.0.0-iteration.50

## Delivered
1. **Composition extract:** `bindSettingsSurface` owns:
   - AppearancePreferencesService + theme/language window routes
   - SettingsShellController + `openSettings`
   - BlockListService + block window routes
   - ProfileController + open/save profile
   - PrivacySettingsService + `rimSavePrivacy`
2. **app.js:** constructors removed from bootstrap; single composition call; line count down ~78 lines.
3. **Dual-bind:** legacy `06-legacy-06.js` skips `rimApplyGroupAvatars` after open when shell ownership is set (shell already applies group avatar).
4. **Tests:** integration tests for appearance/blocks/privacy/profile/settings now validate composition module; new `dual-bind-guards.test.js`; suite **276 PASS**.

## Non-goals
- No UI/CSS/HTML contract changes.
