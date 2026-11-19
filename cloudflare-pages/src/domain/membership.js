/**
 * Pure conversation/channel membership rules.
 */

const ADMIN_ROLES = new Set(['owner', 'admin']);
const MOD_ROLES = new Set(['owner', 'admin', 'moderator']);

export function normalizeMemberRole(role) {
  const r = String(role ?? 'member').trim().toLowerCase();
  if (['owner', 'admin', 'moderator', 'editor', 'member', 'reader'].includes(r)) return r;
  return 'member';
}

export function canModerateMembers(role) {
  return MOD_ROLES.has(normalizeMemberRole(role));
}

export function canManageSettings(role) {
  return ADMIN_ROLES.has(normalizeMemberRole(role));
}

export function canRemoveMember({ actorRole, targetRole, actorId, targetId } = {}) {
  if (actorId && targetId && String(actorId) === String(targetId)) return false;
  const actor = normalizeMemberRole(actorRole);
  const target = normalizeMemberRole(targetRole);
  if (!canModerateMembers(actor)) return false;
  if (target === 'owner') return false;
  if (target === 'admin' && actor !== 'owner') return false;
  return true;
}
