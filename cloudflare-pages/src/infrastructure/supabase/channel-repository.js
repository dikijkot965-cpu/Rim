import { Err, Ok } from '../../core/result.js';

const DEFAULT_CHANNEL_LIMIT = 300;

/** Read-only channel directory adapter. Membership mutations remain owned by the
 * existing RPC-backed legacy commands until their authorization contract is migrated. */
export class ChannelRepository {
  constructor(client, { limit = DEFAULT_CHANNEL_LIMIT } = {}) {
    this.client = client;
    const parsed = Number(limit);
    this.limit = Number.isFinite(parsed) ? Math.min(500, Math.max(1, Math.trunc(parsed))) : DEFAULT_CHANNEL_LIMIT;
  }

  async getDirectory(userId) {
    if (!userId) return Err(new Error('Channel directory requires an authenticated user.'));

    const [channels, memberships] = await Promise.all([
      this.client.from('channels').select('id,title,description,is_public,username').order('created_at', { ascending: false }).limit(this.limit),
      this.client.from('channel_members').select('channel_id').eq('user_id', userId)
    ]);

    if (channels.error) return Err(channels.error);
    if (memberships.error) return Err(memberships.error);

    return Ok({
      channels: Array.isArray(channels.data) ? channels.data : [],
      subscribedChannelIds: [...new Set((memberships.data || [])
        .map(row => row?.channel_id)
        .filter(id => id != null && id !== '')
        .map(String))]
    });
  }
}
