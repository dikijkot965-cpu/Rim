import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const invitationMigration = await readFile(new URL('../supabase/migrations/20261128133411_rim_iteration_185_direct_e2e_invitation_and_peer_identity.sql', import.meta.url), 'utf8');
const hardeningMigration = await readFile(new URL('../supabase/migrations/20261128150000_rim_iteration_185_persistent_secret_chat_requests.sql', import.meta.url), 'utf8');

test('secret direct invitation acceptance is durable and recipient-controlled', () => {
  assert.match(invitationMigration, /create table if not exists public\.rim_e2e_direct_invitation_acceptances/i);
  assert.match(invitationMigration, /primary key \(conversation_id, user_id\)/i);
  assert.match(invitationMigration, /create or replace function public\.rim_e2e_get_direct_invitation_status/i);
  assert.match(invitationMigration, /create or replace function public\.rim_e2e_accept_direct_invitation/i);
  assert.match(invitationMigration, /c\.created_by <> v_actor/i);
  assert.match(invitationMigration, /insert into public\.rim_e2e_direct_invitation_acceptances/i);
  assert.match(invitationMigration, /'accepted', v_accepted_at is not null/i);
});

test('pending invitation can only be cancelled by its creator or declined by its recipient', () => {
  assert.match(hardeningMigration, /create or replace function public\.rim_e2e_cancel_direct_invitation/i);
  assert.match(hardeningMigration, /not_direct_e2e_invitation_creator/i);
  assert.match(hardeningMigration, /create or replace function public\.rim_e2e_decline_direct_invitation/i);
  assert.match(hardeningMigration, /invitation_creator_cannot_decline/i);
  assert.match(hardeningMigration, /direct_e2e_invitation_already_accepted/i);
  assert.match(hardeningMigration, /set is_secret = false, e2e_mode = 'off'/i);
});

test('E2E activation trigger requires a one-use private authorization capability', () => {
  assert.match(hardeningMigration, /create table if not exists private\.rim_e2e_activation_authorizations/i);
  assert.match(hardeningMigration, /authorized_user_id = auth\.uid\(\)/i);
  assert.match(hardeningMigration, /e2e_activation_requires_trusted_deployment/i);
  assert.match(hardeningMigration, /values \('group',p_scope_id,v_user\)/i);
  assert.match(hardeningMigration, /values \('private_channel',p_scope_id,v_user\)/i);
});

test('private group and channel managers can disable only their selected E2E scope', () => {
  assert.match(hardeningMigration, /create or replace function public\.rim_disable_e2e_scope\(p_scope_type text, p_scope_id uuid\)/i);
  assert.match(hardeningMigration, /e2e_disable_requires_private_group_manager/i);
  assert.match(hardeningMigration, /e2e_disable_requires_private_channel_manager/i);
  assert.match(hardeningMigration, /set e2e_mode = 'off', e2e_protocol = null/i);
  assert.match(hardeningMigration, /alter publication supabase_realtime add table public\.rim_e2e_direct_invitation_acceptances/i);
  assert.match(hardeningMigration, /alter publication supabase_realtime add table public\.conversation_members/i);
});
