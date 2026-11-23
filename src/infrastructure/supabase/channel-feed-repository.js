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
      .select('id,title,description,username,is_public,owner_id,avatar_path,created_at,discussion_conversation_id,e2e_mode,e2e_epoch,e2e_protocol')
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
        .select('id,channel_id,author_id,body,image_path,created_at,edited_at,is_pinned,pinned_at,pinned_by')
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
        .select('id,channel_id,author_id,body,image_path,created_at,edited_at,is_pinned,pinned_at,pinned_by')
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
    const mediaPaths = [...new Set(posts.map(post => post.image_path).filter(Boolean))];
    if (mediaPaths.length) {
      try {
        const signedMedia = await this.client.storage.from('chat-files').createSignedUrls(mediaPaths, 1800);
        const mediaMap = new Map((signedMedia.data || []).filter(item => item.path && item.signedUrl).map(item => [item.path, item.signedUrl]));
        for (const post of posts) post.image_url = mediaMap.get(post.image_path) || '';
      } catch { /* feed text remains available when media signing fails */ }
    }

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


  async getProfileDetails(channelId) {
    if (!channelId) return Err(new Error('Channel profile requires a channel id.'));
    const safeCount = async query => {
      try { const result = await query; return result?.error ? null : Number(result?.count || 0); }
      catch { return null; }
    };
    const [dailyResult, scheduledCount, pendingCount, inviteCount, restrictedCount] = await Promise.all([
      this.client.from('channel_daily_stats').select('stat_date,views_count,subscribers_count,posts_count,reactions_count')
        .eq('channel_id', channelId).order('stat_date', { ascending: false }).limit(30),
      safeCount(this.client.from('channel_scheduled_posts').select('id', { count: 'exact', head: true }).eq('channel_id', channelId).eq('status', 'scheduled')),
      safeCount(this.client.from('channel_join_requests').select('id', { count: 'exact', head: true }).eq('channel_id', channelId).eq('status', 'pending')),
      safeCount(this.client.from('channel_invite_links').select('id', { count: 'exact', head: true }).eq('channel_id', channelId).eq('revoked', false)),
      safeCount(this.client.from('channel_member_moderation').select('user_id', { count: 'exact', head: true }).eq('channel_id', channelId).eq('action', 'ban'))
    ]);
    return Ok({
      dailyStats: Array.isArray(dailyResult?.data) ? dailyResult.data : [],
      scheduledCount, pendingCount, inviteCount, restrictedCount
    });
  }


  async getJoinRequests(channelId, { limit = 100 } = {}) {
    if (!channelId) return Err(new Error('Channel id is required.'));
    const result = await this.client.from('channel_join_requests')
      .select('id,channel_id,user_id,status,message,created_at')
      .eq('channel_id', channelId).eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(clamp(limit, 1, 200, 100));
    if (result.error) return Err(result.error);
    const rows = Array.isArray(result.data) ? result.data : [];
    const ids = unique(rows.map(row => row.user_id));
    const profiles = ids.length
      ? await this.client.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
      : { data: [], error: null };
    if (profiles.error) return Err(profiles.error);
    const byId = new Map((profiles.data || []).map(row => [String(row.id), row]));
    return Ok(rows.map(row => ({ ...row, profile: byId.get(String(row.user_id)) || {} })));
  }

  async reviewJoinRequest(requestId, decision) {
    if (!requestId || !['approved', 'rejected'].includes(decision)) return Err(new Error('Invalid join request decision.'));
    const result = await this.client.rpc('rim_channel_review_join_request', {
      p_request_id: requestId, p_decision: decision
    });
    return result.error ? Err(result.error) : Ok(result.data === true);
  }

  async getScheduledPosts(channelId, { limit = 100 } = {}) {
    if (!channelId) return Err(new Error('Channel id is required.'));
    const result = await this.client.from('channel_scheduled_posts')
      .select('id,channel_id,author_id,body,media_paths,scheduled_at,status,created_at')
      .eq('channel_id', channelId).eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true }).limit(clamp(limit, 1, 200, 100));
    return result.error ? Err(result.error) : Ok(Array.isArray(result.data) ? result.data : []);
  }

  async schedulePost(channelId, authorId, body, scheduledAt) {
    const text = String(body || '').trim();
    const date = new Date(scheduledAt);
    if (!channelId || !authorId || !text) return Err(new Error('Добавьте текст публикации.'));
    if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() + 60_000) return Err(new Error('Выберите время минимум через минуту.'));
    const result = await this.client.from('channel_scheduled_posts').insert({
      channel_id: channelId, author_id: authorId, body: text, media_paths: [], scheduled_at: date.toISOString(), status: 'scheduled'
    }).select().single();
    return result.error ? Err(result.error) : Ok(result.data);
  }

  async cancelScheduledPost(id) {
    if (!id) return Err(new Error('Scheduled post id is required.'));
    const result = await this.client.from('channel_scheduled_posts').delete().eq('id', id).eq('status', 'scheduled').select('id').maybeSingle();
    if (result.error) return Err(result.error);
    return result.data ? Ok(true) : Err(new Error('Публикация уже обработана или недоступна.'));
  }

  async publishScheduledPost(id) {
    if (!id) return Err(new Error('Scheduled post id is required.'));
    const result = await this.client.rpc('rim_channel_publish_scheduled', { p_scheduled_id: id });
    if (result.error) return Err(result.error);
    return result.data ? Ok({ id: result.data }) : Err(new Error('Отложенная публикация не найдена или уже обработана.'));
  }

  async getAdminRoster(channelId, { limit = 100 } = {}) {
    if (!channelId) return Err(new Error('Channel roster requires a channel id.'));
    const membersResult = await this.client.from('channel_members')
      .select('user_id,role,joined_at')
      .eq('channel_id', channelId)
      .order('joined_at', { ascending: false })
      .limit(clamp(limit, 1, 200, 100));
    if (membersResult.error) return Err(membersResult.error);
    const members = Array.isArray(membersResult.data) ? membersResult.data : [];
    const ids = unique(members.map(row => row.user_id));
    const profilesResult = ids.length
      ? await this.client.from('profiles').select('id,username,display_name,avatar_url').in('id', ids)
      : { data: [], error: null };
    if (profilesResult.error) return Err(profilesResult.error);
    const profiles = new Map((profilesResult.data || []).map(row => [String(row.id), row]));
    return Ok(members.map(row => ({ ...row, profile: profiles.get(String(row.user_id)) || {} })));
  }

  async getChannelAssets(channelId, { limit = 60 } = {}) {
    if (!channelId) return Err(new Error('Channel assets require a channel id.'));
    const result = await this.client.from('channel_posts')
      .select('id,body,image_path,created_at')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(clamp(limit, 1, 100, 60));
    if (result.error) return Err(result.error);
    const rows = Array.isArray(result.data) ? result.data : [];
    const paths = [...new Set(rows.map(row => row.image_path).filter(Boolean))];
    let urls = new Map();
    if (paths.length) {
      try {
        const signed = await this.client.storage.from('chat-files').createSignedUrls(paths, 1800);
        urls = new Map((signed.data || []).filter(item => item.path && item.signedUrl).map(item => [item.path, item.signedUrl]));
      } catch { /* media gallery remains usable with text links */ }
    }
    const links = [];
    for (const row of rows) {
      const matches = String(row.body || '').match(/https?:\/\/[^\s<>"']+/g) || [];
      for (const url of matches) links.push({ url, postId: row.id, created_at: row.created_at });
    }
    return Ok({
      media: rows.filter(row => row.image_path).map(row => ({ ...row, media_url: urls.get(row.image_path) || '' })),
      links: links.slice(0, 100)
    });
  }

  async updatePost(postId, body) {
    const text=String(body||'').trim();
    if(!postId||!text||text.length>8000)return Err(new Error('Публикация должна содержать от 1 до 8000 символов.'));
    const result=await this.client.from('channel_posts').update({body:text,edited_at:new Date().toISOString()}).eq('id',postId).select('id,body,edited_at').maybeSingle();
    if(result.error)return Err(result.error);return result.data?Ok(result.data):Err(new Error('Публикация недоступна для редактирования.'));
  }

  async deletePost(postId) {
    if(!postId)return Err(new Error('Post id is required.'));
    const result=await this.client.from('channel_posts').delete().eq('id',postId).select('id').maybeSingle();
    if(result.error)return Err(result.error);return result.data?Ok(true):Err(new Error('Публикация недоступна для удаления.'));
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
      .select('id,channel_id,author_id,body,image_path,created_at,edited_at,is_pinned,pinned_at,pinned_by')
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
