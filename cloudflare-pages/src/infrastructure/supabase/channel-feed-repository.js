import { Err, Ok } from '../../core/result.js';

const DEFAULT_POST_LIMIT = 30;
const DEFAULT_POLL_LIMIT = 20;
const DEFAULT_COMMENT_LIMIT = 100;

/**
 * Channel feed read model plus explicit server-authorized pin mutation.
 * Other legacy mutations remain on their existing RPC / command paths.
 */
export class ChannelFeedRepository {
  constructor(client, {
    postLimit = DEFAULT_POST_LIMIT,
    pollLimit = DEFAULT_POLL_LIMIT,
    commentLimit = DEFAULT_COMMENT_LIMIT
  } = {}) {
    this.client = client;
    this.postLimit = clamp(postLimit, 1, 100, DEFAULT_POST_LIMIT);
    this.pollLimit = clamp(pollLimit, 1, 50, DEFAULT_POLL_LIMIT);
    this.commentLimit = clamp(commentLimit, 1, 200, DEFAULT_COMMENT_LIMIT);
  }

  async getShell(channelId, userId) {
    if (!channelId) return Err(new Error('Channel feed requires a channel id.'));
    if (!userId) return Err(new Error('Channel feed requires an authenticated user.'));

    const channelResult = await this.client
      .from('channels')
      .select('id,title,description,username,is_public,owner_id,avatar_path,created_at,discussion_conversation_id')
      .eq('id', channelId)
      .maybeSingle();

    if (channelResult.error) return Err(channelResult.error);
    if (!channelResult.data) return Err(new Error('Канал не найден.'));

    const channel = channelResult.data;

    const [membershipResult, postsResult, pollsResult, pinnedResult, avatarResult, membersCountResult, managersCountResult] = await Promise.all([
      this.client
        .from('channel_members')
        .select('role')
        .eq('channel_id', channelId)
        .eq('user_id', userId)
        .maybeSingle(),
      this.client
        .from('channel_posts')
        .select('id,channel_id,author_id,body,created_at,is_pinned,pinned_at,pinned_by')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(this.postLimit),
      this.client
        .from('channel_polls')
        .select('id,channel_id,question,options,is_closed,created_at')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(this.pollLimit),
      this.client
        .from('channel_posts')
        .select('id,channel_id,author_id,body,created_at,is_pinned,pinned_at,pinned_by')
        .eq('channel_id', channelId)
        .eq('is_pinned', true)
        .order('pinned_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(5),
      channel.avatar_path
        ? this.client.storage.from('avatars').createSignedUrl(channel.avatar_path, 1800)
        : Promise.resolve({ data: null, error: null }),
      this.client.from('channel_members').select('user_id', { count: 'exact', head: true }).eq('channel_id', channelId),
      this.client.from('channel_members').select('user_id', { count: 'exact', head: true }).eq('channel_id', channelId).in('role', ['admin', 'moderator'])
    ]);

    if (membershipResult.error) return Err(membershipResult.error);
    if (postsResult.error) return Err(postsResult.error);
    if (pollsResult.error) return Err(pollsResult.error);
    if (pinnedResult.error) return Err(pinnedResult.error);
    if (membersCountResult.error) return Err(membersCountResult.error);
    if (managersCountResult.error) return Err(managersCountResult.error);
    // Avatar failure is non-fatal for the shell.
    const avatarUrl = avatarResult?.data?.signedUrl || '';

    const membership = membershipResult.data || null;
    const posts = Array.isArray(postsResult.data) ? postsResult.data : [];
    const polls = Array.isArray(pollsResult.data) ? pollsResult.data : [];

    return Ok({
      channel,
      membership,
      posts,
      hasMorePosts: posts.length === this.postLimit,
      polls,
      pinnedPosts: Array.isArray(pinnedResult.data) ? pinnedResult.data : [],
      memberCount: membersCountResult.count || 0,
      managerCount: managersCountResult.count || 0,
      avatarUrl,
      joined: !!membership,
      role: membership?.role || ''
    });
  }

  async pinPost(postId, pinned = true) {
    if (!postId) return Err(new Error('postId is required'));
    const response = await this.client.rpc('rim_channel_pin_post', {
      p_post_id: postId,
      p_pinned: pinned === true
    });
    return response.error ? Err(response.error) : Ok(response.data === true);
  }

  async getOlderPosts(channelId, cursor, { limit = this.postLimit } = {}) {
    if (!channelId || !cursor?.created_at || !cursor?.id) return Err(new Error('A valid channel and post cursor are required.'));
    const stamp = new Date(cursor.created_at);
    const safeId = String(cursor.id);
    if (!Number.isFinite(stamp.getTime()) || !/^[0-9a-f-]{36}$/i.test(safeId)) return Err(new Error('Invalid channel post cursor.'));
    const response = await this.client.from('channel_posts')
      .select('id,channel_id,author_id,body,created_at,is_pinned,pinned_at,pinned_by')
      .eq('channel_id', channelId)
      .or(`created_at.lt.${stamp.toISOString()},and(created_at.eq.${stamp.toISOString()},id.lt.${safeId})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(clamp(limit, 1, 100, this.postLimit));
    if (response.error) return Err(response.error);
    return Ok(Array.isArray(response.data) ? response.data : []);
  }

  async getEnrichment({ postIds = [], pollIds = [], authorIds = [] } = {}) {
    const uniquePostIds = unique(postIds);
    const uniquePollIds = unique(pollIds);
    const uniqueAuthorIds = unique(authorIds);

    const [reactionsResult, votesResult, profilesResult] = await Promise.all([
      uniquePostIds.length
        ? this.client.from('channel_reactions').select('post_id,user_id,emoji').in('post_id', uniquePostIds)
        : Promise.resolve({ data: [], error: null }),
      uniquePollIds.length
        ? this.client.from('channel_poll_votes').select('poll_id,user_id,option_index').in('poll_id', uniquePollIds)
        : Promise.resolve({ data: [], error: null }),
      uniqueAuthorIds.length
        ? this.client.from('profiles').select('id,username,display_name,avatar_url').in('id', uniqueAuthorIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (reactionsResult.error) return Err(reactionsResult.error);
    if (votesResult.error) return Err(votesResult.error);
    if (profilesResult.error) return Err(profilesResult.error);

    const profileById = Object.fromEntries(
      (profilesResult.data || []).map(profile => [String(profile.id), profile])
    );

    return Ok({
      reactions: Array.isArray(reactionsResult.data) ? reactionsResult.data : [],
      votes: Array.isArray(votesResult.data) ? votesResult.data : [],
      profileById
    });
  }

  async getComments(postId) {
    if (!postId) return Err(new Error('Comments require a post id.'));

    const commentsResult = await this.client
      .from('channel_post_comments')
      .select('id,post_id,author_id,body,created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(this.commentLimit);

    if (commentsResult.error) return Err(commentsResult.error);
    const comments = Array.isArray(commentsResult.data) ? commentsResult.data : [];
    const authorIds = comments.map(row => row.author_id);

    const profilesResult = authorIds.length
      ? await this.client.from('profiles').select('id,username,display_name,avatar_url').in('id', unique(authorIds))
      : { data: [], error: null };

    if (profilesResult.error) return Err(profilesResult.error);

    const profileById = Object.fromEntries(
      (profilesResult.data || []).map(profile => [String(profile.id), profile])
    );

    return Ok({ comments, profileById });
  }
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function unique(values) {
  return [...new Set((values || []).filter(id => id != null && id !== '').map(String))];
}
