import { Err, Ok } from '../../core/result.js';

/**
 * Read-only group settings projection.
 * Membership mutations, role changes, invites and ownership transfer remain
 * owned by the existing RPC-backed legacy commands until their authorization
 * contracts are reviewed and migrated.
 */
export class GroupRepository {
  constructor(client) {
    this.client = client;
  }

  /**
   * Loads the data required to render group settings for a manager.
   * @param {string} conversationId
   * @param {string} userId
   * @returns {Promise<import('../../core/result.js').Ok|import('../../core/result.js').Err>}
   */
  async getSettingsProjection(conversationId, userId) {
    if (!conversationId) return Err(new Error('Group settings require a conversation id.'));
    if (!userId) return Err(new Error('Group settings require an authenticated user.'));

    const [groupResult, membersResult] = await Promise.all([
      this.client
        .from('conversations')
        .select('id,title,description,is_private,created_by,invite_code,avatar_path,type')
        .eq('id', conversationId)
        .single(),
      this.client
        .from('conversation_members')
        .select('user_id,role,joined_at')
        .eq('conversation_id', conversationId)
        .order('joined_at', { ascending: true })
    ]);

    if (groupResult.error) return Err(groupResult.error);
    if (membersResult.error) return Err(membersResult.error);

    const group = groupResult.data;
    if (!group || group.type !== 'group') {
      return Err(new Error('Группа не найдена.'));
    }

    const members = Array.isArray(membersResult.data) ? membersResult.data : [];
    const memberIds = [...new Set(
      members
        .map(row => row?.user_id)
        .filter(id => id != null && id !== '')
        .map(String)
    )];

    let profiles = [];
    if (memberIds.length) {
      const profilesResult = await this.client
        .from('profiles')
        .select('id,username,display_name')
        .in('id', memberIds);
      if (profilesResult.error) return Err(profilesResult.error);
      profiles = Array.isArray(profilesResult.data) ? profilesResult.data : [];
    }

    const profileById = Object.fromEntries(
      profiles.map(profile => [String(profile.id), profile])
    );

    const ownMembership = members.find(row => String(row.user_id) === String(userId)) || null;
    const isCreator = String(group.created_by) === String(userId);
    const isManager = isCreator || ['owner', 'admin'].includes(ownMembership?.role);

    return Ok({
      group,
      members,
      profileById,
      ownMembership,
      isCreator,
      isManager
    });
  }
}
