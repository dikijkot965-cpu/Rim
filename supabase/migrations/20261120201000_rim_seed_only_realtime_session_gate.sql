drop policy if exists rim_seed_only_session_gate on realtime.messages;
create policy rim_seed_only_session_gate on realtime.messages
  as restrictive for all to authenticated
  using (private.rim_seed_session_authorized())
  with check (private.rim_seed_session_authorized());
