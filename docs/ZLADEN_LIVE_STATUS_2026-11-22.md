# Злыдя — production status, 2026-11-22

## What is already present

- The repository contains the client-side `ZladenBotService` and settings integration.
- The repository contains Zladen SQL migrations 136–141: system identity/install, group moderation, profiles/ranks/ledger/reputation/awards/notes/reports/polls/reminders/clans/anti-spam, onboarding, command permissions/aliases, and safe games/economy/triggers.
- The repository contains `supabase/functions/rim-zladen/index.ts`. Iteration 163 changes owner resolution: explicit `RIM_OWNER_USER_ID` wins; otherwise the function accepts exactly one `superadmin` from `app_user_roles` and fails closed when the result is missing or ambiguous.

## What the live project does NOT have yet

- Live migration history includes Iteration 135 bot foundations, but not the Zladen migrations 136–141.
- The deployed Edge Function list does not contain `rim-zladen`.
- No Zladen Auth user has been provisioned by this work.

Therefore Zladen is implemented in the source tree, but is **not activated in production**. The RIM UI may attempt to invoke `rim-zladen`, but the live function is currently absent.

## Required production sequence

1. Review and apply the six SQL files in `docs/ITERATION_136_DEPLOYMENT.md`, in timestamp order. Do not reapply the separate E2E migration `20261122052958_rim_iteration_136_e2e_scope_foundation`; it is already live.
2. Deploy `supabase/functions/rim-zladen/index.ts` as `rim-zladen`, `verify_jwt=true`. Standard Supabase URL/service-role secrets are provided by the Edge Functions environment. `RIM_OWNER_USER_ID` is optional with the Iteration 163 fallback, but can be set explicitly in the Supabase secret manager if desired.
3. Verify the registry row, then install the bot from an authenticated RIM session. Confirm one dedicated Auth user is created and one default direct chat per account is installed.
4. Test direct commands, private-group onboarding/moderation, permission gates, and that E2E-required conversations are skipped.

No production Zladen migration or function deployment was performed in Iteration 163.
