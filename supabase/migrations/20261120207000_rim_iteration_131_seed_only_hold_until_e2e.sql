-- Do not expose strict seed-only activation until the real account E2E matrix passes.
select public.rim_seed_only_mark_hook_ready(false);
