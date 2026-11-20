alter table public.notification_preferences
  add column if not exists show_message_preview boolean not null default true;
comment on column public.notification_preferences.show_message_preview is
  'Whether push notifications may include sender/channel names and message preview text.';
