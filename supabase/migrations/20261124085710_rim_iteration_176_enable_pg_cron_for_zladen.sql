-- Enable Supabase Cron for durable Zladen reminders.
-- pg_cron is available in this Supabase project and is installed in pg_catalog.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
