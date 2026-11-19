import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelFeedRepository } from '../src/infrastructure/supabase/channel-feed-repository.js';

function createClient({
  channel = null,
  membership = null,
  posts = [],
  polls = [],
  reactions = [],
  votes = [],
  profiles = [],
  comments = [],
  failTable = null,
  signedUrl = null
} = {}) {
  const calls = [];
  return {
    calls,
    storage: {
      from() {
        return {
          createSignedUrl() {
            return Promise.resolve({ data: signedUrl ? { signedUrl } : null, error: null });
          }
        };
      }
    },
    from(table) {
      const state = { table, filters: [], orders: [], inFilters: [] };
      const query = {
        select(columns) { state.columns = columns; return this; },
        eq(column, value) { state.filters.push([column, value]); return this; },
        in(column, values) { state.inFilters.push([column, values]); return this; },
        order(column, options) { state.orders.push([column, options]); return this; },
        limit(value) { state.limit = value; return this; },
        maybeSingle() { state.maybeSingle = true; return this; },
        then(resolve, reject) {
          calls.push(state);
          if (table === failTable) {
            return Promise.resolve({ data: null, error: new Error(`${table} failed`) }).then(resolve, reject);
          }
          const map = {
            channels: channel,
            channel_members: membership,
            channel_posts: posts,
            channel_polls: polls,
            channel_reactions: reactions,
            channel_poll_votes: votes,
            profiles,
            channel_post_comments: comments
          };
          const data = map[table];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
}

test('channel shell loads narrow columns and bounded posts/polls', async () => {
  const client = createClient({
    channel: {
      id: 'ch1',
      title: 'Новости',
      description: 'd',
      username: 'news',
      is_public: true,
      owner_id: 'o1',
      avatar_path: 'a/b.jpg'
    },
    membership: { role: 'member' },
    posts: [{ id: 'p1', author_id: 'o1', body: 'hello', created_at: '2026-01-01' }],
    polls: [{ id: 'poll1', question: 'Q?', options: ['a', 'b'], is_closed: false }],
    signedUrl: 'https://example.com/avatar'
  });

  const result = await new ChannelFeedRepository(client).getShell('ch1', 'u1');
  assert.equal(result.ok, true);
  assert.equal(result.value.channel.id, 'ch1');
  assert.equal(result.value.joined, true);
  assert.equal(result.value.posts.length, 1);
  assert.equal(result.value.avatarUrl, 'https://example.com/avatar');

  const channelCall = client.calls.find(call => call.table === 'channels');
  const postsCall = client.calls.find(call => call.table === 'channel_posts');
  const pollsCall = client.calls.find(call => call.table === 'channel_polls');
  assert.match(channelCall.columns, /id,title,description/);
  assert.equal(postsCall.limit, 30);
  assert.equal(pollsCall.limit, 20);
  assert.deepEqual(postsCall.orders, [['created_at', { ascending: false }]]);
});

test('channel enrichment loads reactions, votes and author profiles', async () => {
  const client = createClient({
    reactions: [{ post_id: 'p1', user_id: 'u1', emoji: '👍' }],
    votes: [{ poll_id: 'poll1', user_id: 'u1', option_index: 0 }],
    profiles: [{ id: 'o1', username: 'owner', display_name: 'Owner' }]
  });

  const result = await new ChannelFeedRepository(client).getEnrichment({
    postIds: ['p1'],
    pollIds: ['poll1'],
    authorIds: ['o1']
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.reactions.length, 1);
  assert.equal(result.value.profileById.o1.username, 'owner');
});

test('channel comments are bounded and include author profiles', async () => {
  const client = createClient({
    comments: [{ id: 'c1', post_id: 'p1', author_id: 'u2', body: 'hi', created_at: '2026-01-02' }],
    profiles: [{ id: 'u2', username: 'reader', display_name: 'Reader' }]
  });
  const result = await new ChannelFeedRepository(client).getComments('p1');
  assert.equal(result.ok, true);
  assert.equal(result.value.comments.length, 1);
  assert.equal(result.value.profileById.u2.username, 'reader');
  const commentsCall = client.calls.find(call => call.table === 'channel_post_comments');
  assert.equal(commentsCall.limit, 100);
});

test('channel shell fails closed without ids', async () => {
  const client = createClient();
  const a = await new ChannelFeedRepository(client).getShell('', 'u1');
  const b = await new ChannelFeedRepository(client).getShell('ch1', null);
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  assert.equal(client.calls.length, 0);
});

test('channel shell propagates missing channel', async () => {
  const client = createClient({ channel: null });
  const result = await new ChannelFeedRepository(client).getShell('missing', 'u1');
  assert.equal(result.ok, false);
  assert.match(String(result.error.message), /Канал не найден/);
});
