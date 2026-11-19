# RIM SQL artefacts

This folder holds **client-repo SQL notes and partial migrations**. The live schema primarily lives in the Supabase project and may be richer than the files checked in here.

## Engineering standard going forward

1. Every schema change is a numbered migration: `sql/migrations/YYYYMMDDHHMMSS_description.sql`.
2. Migrations are append-only; never rewrite applied files.
3. RLS policies and `SECURITY DEFINER` functions are reviewed before deploy.
4. Client code must not rely on service-role keys.

## Current files

See the `sql/` directory listing for the small set of checked-in statements (favorites, music library, etc.).

## Gaps (from engineering audit)

- Full schema dump not reproduced in-repo.
- Foreign-key covering indexes should be verified in Supabase.
- `SECURITY DEFINER` execute grants for `anon` / `authenticated` need periodic review.
