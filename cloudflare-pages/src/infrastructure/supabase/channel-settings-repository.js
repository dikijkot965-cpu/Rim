import { Err, Ok } from '../../core/result.js';

const MEMBER_LIMIT = 300;
const GROUP_LIMIT = 100;

/**
 * Read-only channel settings projection.
 * Save, moderation, avatar and role mutations remain on legacy commands / RPCs.
 */
export class ChannelSettingsRepository {
  constructor(client, { memberLimit = MEMBER_LIMIT, groupLimit = GROUP_LIMIT } = {}) {
    this.client = client;
    this.memberLimit = clamp(memberLimit, 1, 500, MEMBER_LIMIT);
    this.groupLimit = clamp(groupLimit, 1, 200, GROUP_LIMIT);
  }

  async canManage(channel, userId) {
    if (!channel?.id || !userId) return Ok(false);
    if (String(channel.owner_id) === String(userId)) return Ok(true);

    const { data, error } = await this.client
      .from('channel_members')
      .select('role')
      .eq('channel_id', channel.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return Err(error);
    return Ok(['admin', 'moderator'].includes(data?.role));
  }

  async getAncillary(channelId) {
    if (!channelId) return Err(new Error('Channel settings require a channel id.'));

    const [groupsResult, membersResult, moderationResult] = await Promise.all([
      this.client
        .from('conversations')
        .select('id,title')
        .eq('type', 'group')
        .order('created_at', { ascending: false })
        .limit(this.groupLimit),
      this.client
        .from('channel_members')
        .select('user_id,role')
        .eq('channel_id', channelId)
        .limit(this.memberLimit),
      this.client.rpc('rim_channel_moderation_status', { p_channel_id: channelId })
    ]);

    if (membersResult.error) return Err(membersResult.error);

    const members = Array.isArray(membersResult.data) ? membersResult.data : [];
    const memberIds = [...new Set(members.map(row => row.user_id).filter(Boolean).map(String))];

    let profiles = [];
    if (memberIds.length) {
      const profilesResult = await this.client
        .from('profiles')
        .select('id,username,display_name')
        .in('id', memberIds);
      if (profilesResult.error) return Err(profilesResult.error);
      profiles = Array.isArray(profilesResult.data) ? profilesResult.data : [];
    }

    const profileById = Object.fromEntries(profiles.map(profile => [String(profile.id), profile]));
    const memberRows = members.map(member => ({
      user_id: member.user_id,
      role: member.role,
      profile: profileById[String(member.user_id)] || {}
    }));

    return Ok({
      groups: groupsResult.error ? [] : (Array.isArray(groupsResult.data) ? groupsResult.data : []),
      groupsError: groupsResult.error || null,
      members: memberRows,
      moderation: moderationResult.error ? [] : (Array.isArray(moderationResult.data) ? moderationResult.data : []),
      moderationError: moderationResult.error || null
    });
  }
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
