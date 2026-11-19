import { normalizeChannelPostBody } from '../domain/channel.js';
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return '—';
  }
}

const REACTION_EMOJI = ['👍', '❤️', '🔥', '👏', '🎉'];

/**
 * Owns the channel full-page feed read model: shell, deferred enrichment and
 * lazy comments. Mutations remain on legacy window entrypoints.
 */
export class ChannelFeedController {
  constructor({
    repository,
    getUser,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null,
    notify = null,
    isImperator = null
  } = {}) {
    this.repository = repository;
    this.getUser = getUser;
    this.document = documentRef;
    this.window = windowRef;
    this.logger = logger;
    this.notify = notify || ((message) => {
      const fn = this.window?.toast || this.window?.notify || this.window?.notifyMsg;
      if (typeof fn === 'function') fn(String(message ?? 'Неизвестная ошибка'));
      else console.info(String(message ?? 'Неизвестная ошибка'));
    });
    this.isImperator = isImperator || (() => this.window?.isImperator?.() === true);
    this.requestEpoch = 0;
    this.activeChannelId = null;
    this.clickHandler = this.#onClick.bind(this);
    this.submitHandler = this.#onSubmit.bind(this);
    this.boundRoot = null;
  }

  #say(message) {
    this.notify(message);
  }

  #bindRoot(root) {
    if (this.boundRoot === root) return;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot?.removeEventListener?.('submit', this.submitHandler);
    this.boundRoot = root;
    this.boundRoot?.addEventListener?.('click', this.clickHandler);
    this.boundRoot?.addEventListener?.('submit', this.submitHandler);
  }

  #onClick(event) {
    const actionEl = event.target?.closest?.('[data-rim-cf-action]');
    if (!actionEl || !this.boundRoot?.contains?.(actionEl)) return;

    const action = actionEl.dataset.rimCfAction;
    const channelId = actionEl.dataset.channelId;
    const postId = actionEl.dataset.postId;
    const pollId = actionEl.dataset.pollId;
    const optionIndex = actionEl.dataset.optionIndex;
    const emoji = actionEl.dataset.emoji;

    switch (action) {
      case 'close':
        this.close();
        break;
      case 'join':
        this.window?.rimJoinChannel?.(channelId);
        break;
      case 'leave':
        this.window?.rimLeaveChannel?.(channelId);
        break;
      case 'settings':
        this.window?.rimOpenChannelSettings?.();
        break;
      case 'create-poll':
        this.window?.rimCreateChannelPoll?.();
        break;
      case 'publish':
        this.window?.rimPublishPost?.();
        break;
      case 'react':
        this.window?.rimReactChannelPost?.(postId, emoji);
        break;
      case 'vote':
        this.window?.rimVoteChannelPoll?.(pollId, Number(optionIndex));
        break;
      case 'comments':
        void this.loadComments(actionEl, postId);
        break;
      default:
        break;
    }
  }

  #onSubmit(event) {
    const form = event.target?.closest?.('.rim-cf-comment-form');
    if (!form || !this.boundRoot?.contains?.(form)) return;
    event.preventDefault();
    const postId = form.dataset.postId;
    if (postId) this.window?.rimAddChannelComment?.(postId);
  }

  #computeFlags(channel, membership, userId) {
    const role = membership?.role || '';
    const isOwner = String(channel.owner_id) === String(userId);
    const manager = isOwner || ['admin', 'moderator'].includes(role) || this.isImperator();
    const canPost = isOwner || role === 'admin' || this.isImperator();
    const joined = !!membership;
    return { role, manager, canPost, joined };
  }

  #renderShell({ channel, posts, avatarUrl, joined, manager, canPost }) {
    const id = escapeHtml(channel.id);
    const joinHtml = joined
      ? `<button class="action-btn" type="button" data-rim-cf-action="leave" data-channel-id="${id}">Отписаться</button>`
      : channel.is_public
        ? `<button class="primary-btn" type="button" data-rim-cf-action="join" data-channel-id="${id}">Подписаться</button>`
        : '<span class="rim-update-muted">Закрытый канал</span>';

    const avatar = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">`
      : '⚜';

    const postsHtml = (posts || []).map(post => `
      <article class="rim-cf-post" data-rim-post-id="${escapeHtml(post.id)}">
        <div class="rim-cf-post-body">${escapeHtml(post.body || '')}</div>
        <div class="rim-update-muted" style="margin-top:9px">${formatWhen(post.created_at)}</div>
      </article>
    `).join('') || '<div class="empty-state">Публикаций пока нет.</div>';

    return `<header class="rim-cf-head">
      <button class="icon-btn" type="button" data-rim-cf-action="close" aria-label="Назад">‹</button>
      <div class="rim-channel-avatar" style="width:46px;height:46px;flex:0 0 46px;overflow:hidden">${avatar}</div>
      <div class="rim-cf-head-copy">
        <h2>${escapeHtml(channel.title)}</h2>
        <p>${escapeHtml(channel.description || '')}${channel.username ? ' · @' + escapeHtml(channel.username) : ''}</p>
      </div>
      ${manager ? '<button class="icon-btn" type="button" data-rim-cf-action="settings" title="Настройки">⚙</button>' : ''}
      <button class="icon-btn" type="button" data-rim-cf-action="close" title="Закрыть">×</button>
    </header>
    <main class="rim-cf-scroll">
      <div class="rim-cf-toolbar">
        ${joinHtml}
        ${manager ? '<button class="action-btn" type="button" data-rim-cf-action="settings">⚙ Настройки канала</button>' : ''}
        ${canPost ? '<button class="action-btn" type="button" data-rim-cf-action="create-poll">📊 Создать опрос</button>' : ''}
      </div>
      ${canPost ? `<section class="rim-update-card">
        <textarea id="rimChannelPostBody" class="field" rows="3" maxlength="10000" placeholder="Новая публикация"></textarea>
        <button class="primary-btn" type="button" style="margin-top:8px" data-rim-cf-action="publish">Опубликовать</button>
      </section>` : ''}
      <section class="rim-cf-feed-state rim-update-muted" role="status">Загружаем дополнительные данные канала…</section>
      <h3>Публикации</h3>
      ${postsHtml}
    </main>`;
  }

  #renderEnrichedFeed({ channel, posts, polls, reactions, votes, profileById, userId, joined, manager, canPost }) {
    const id = escapeHtml(channel.id);

    const joinHtml = joined
      ? `<button class="action-btn" type="button" data-rim-cf-action="leave" data-channel-id="${id}">Отписаться</button>`
      : channel.is_public
        ? `<button class="primary-btn" type="button" data-rim-cf-action="join" data-channel-id="${id}">Подписаться</button>`
        : '<span class="rim-update-muted">Закрытый канал</span>';

    const pollHtml = (polls || []).map(poll => {
      const pollVotes = (votes || []).filter(vote => String(vote.poll_id) === String(poll.id));
      const own = pollVotes.find(vote => String(vote.user_id) === String(userId));
      const total = pollVotes.length;
      const options = (poll.options || []).map((opt, index) => {
        const count = pollVotes.filter(vote => Number(vote.option_index) === index).length;
        const pct = total ? Math.round((count * 100) / total) : 0;
        const selected = own && Number(own.option_index) === index ? 'selected' : '';
        const disabled = poll.is_closed || own ? 'disabled' : '';
        return `<button class="rim-cf-poll-option ${selected}" type="button" ${disabled}
          data-rim-cf-action="vote" data-poll-id="${escapeHtml(poll.id)}" data-option-index="${index}">
          <span class="grow">${escapeHtml(opt)}</span><b>${count}</b><span class="rim-update-muted">${pct}%</span>
        </button>`;
      }).join('');

      return `<section class="rim-cf-poll">
        <div class="rim-update-muted">ОПРОС · ${total} голосов ${poll.is_closed ? '· закрыт' : ''}</div>
        <h3 style="margin:6px 0 9px">${escapeHtml(poll.question)}</h3>
        ${options}
        <div class="rim-update-muted">${own ? 'Ваш голос учтён' : poll.is_closed ? 'Голосование закрыто' : 'Выберите вариант'}</div>
      </section>`;
    }).join('');

    const postsHtml = (posts || []).map(post => {
      const rx = (reactions || []).filter(row => String(row.post_id) === String(post.id));
      const author = profileById[String(post.author_id)] || {};
      const authorLabel = escapeHtml(author.display_name || author.username || 'Автор');
      const reactionButtons = REACTION_EMOJI.map(emoji => {
        const count = rx.filter(row => row.emoji === emoji).length;
        return `<button class="action-btn" type="button" data-rim-cf-action="react" data-post-id="${escapeHtml(post.id)}" data-emoji="${escapeHtml(emoji)}">${emoji} ${count || ''}</button>`;
      }).join('');

      const commentForm = joined || channel.is_public
        ? `<form class="rim-cf-comment-form" data-post-id="${escapeHtml(post.id)}">
            <input id="rimChannelComment-${escapeHtml(post.id)}" class="field" maxlength="2000" placeholder="Написать комментарий…">
            <button class="primary-btn" type="submit">Отправить</button>
          </form>`
        : '<div class="rim-update-muted">Подпишитесь на канал, чтобы комментировать.</div>';

      return `<article class="rim-cf-post" data-rim-post-id="${escapeHtml(post.id)}">
        <div class="rim-cf-post-body">${escapeHtml(post.body || '')}</div>
        <div class="rim-update-muted" style="margin-top:9px">${authorLabel} · ${formatWhen(post.created_at)}</div>
        <div class="rim-cf-toolbar">${reactionButtons}</div>
        <button type="button" class="rim-cf-comment-toggle" aria-expanded="false" data-rim-cf-action="comments" data-post-id="${escapeHtml(post.id)}">Комментарии</button>
        <div class="rim-cf-comments">
          <div class="rim-update-muted">Откройте комментарии, чтобы загрузить их.</div>
          ${commentForm}
        </div>
      </article>`;
    }).join('') || '<div class="empty-state">Публикаций пока нет.</div>';

    return `<div class="rim-cf-toolbar">
        ${joinHtml}
        ${manager ? '<button class="action-btn" type="button" data-rim-cf-action="settings">⚙ Настройки канала</button>' : ''}
        ${canPost ? '<button class="action-btn" type="button" data-rim-cf-action="create-poll">📊 Создать опрос</button>' : ''}
      </div>
      ${canPost ? `<section class="rim-update-card">
        <textarea id="rimChannelPostBody" class="field" rows="3" maxlength="10000" placeholder="Новая публикация"></textarea>
        <button class="primary-btn" type="button" style="margin-top:8px" data-rim-cf-action="publish">Опубликовать</button>
      </section>` : ''}
      ${pollHtml}
      <h3>Публикации</h3>
      ${postsHtml}`;
  }

  async open(channelId) {
    const user = this.getUser?.();
    if (!user?.id) {
      this.#say('Требуется вход в РИМ.');
      return null;
    }

    const epoch = ++this.requestEpoch;
    this.activeChannelId = channelId;

    try {
      const shellResult = await this.repository.getShell(channelId, user.id);
      if (epoch !== this.requestEpoch || this.activeChannelId !== channelId) return null;
      if (shellResult?.ok && shellResult.value?.channel) {
        this.channel = shellResult.value.channel;
        try { this.window.currentChannel = this.channel; } catch {}
      }
      if (!shellResult.ok) throw shellResult.error;

      const { channel, membership, posts, polls, avatarUrl } = shellResult.value;
      const flags = this.#computeFlags(channel, membership, user.id);

      this.window.currentChannel = channel;

      const existing = this.document?.getElementById?.('rimChannelFull');
      existing?.remove?.();

      const full = this.document.createElement('section');
      full.id = 'rimChannelFull';
      try {
        if (full.dataset) full.dataset.channelId = String(channel.id);
        else full.setAttribute?.('data-channel-id', String(channel.id));
      } catch {
        try { full.setAttribute?.('data-channel-id', String(channel.id)); } catch { /* ignore */ }
      }
      try { this.window.__rimCurrentChannelId = channel.id; } catch { /* ignore */ }
      full.innerHTML = this.#renderShell({
        channel,
        posts,
        avatarUrl,
        joined: flags.joined,
        manager: flags.manager,
        canPost: flags.canPost
      });
      const host = this.document.querySelector?.('.main') || this.document.body;
      host.appendChild(full);
      // Ensure overlay is visible above the channel list
      try {
        full.style.position = full.style.position || 'absolute';
        full.style.inset = full.style.inset || '0';
        full.style.zIndex = full.style.zIndex || '10050';
        full.style.background = full.style.background || 'var(--bg, #17130e)';
      } catch { /* ignore */ }
      this.#bindRoot(full);

      // Deferred enrichment — same staging contract as legacy.
      try {
        const enrichmentResult = await this.repository.getEnrichment({
          postIds: posts.map(post => post.id),
          pollIds: polls.map(poll => poll.id),
          authorIds: posts.map(post => post.author_id)
        });
        if (epoch !== this.requestEpoch || this.activeChannelId !== channelId || !full.isConnected) return shellResult.value;
        if (!enrichmentResult.ok) throw enrichmentResult.error;

        const { reactions, votes, profileById } = enrichmentResult.value;
        const main = full.querySelector('.rim-cf-scroll');
        if (main) {
          main.innerHTML = this.#renderEnrichedFeed({
            channel,
            posts,
            polls,
            reactions,
            votes,
            profileById,
            userId: user.id,
            joined: flags.joined,
            manager: flags.manager,
            canPost: flags.canPost
          });
        }

        // View tracking + non-critical advertising stay on legacy helpers when present.
        try {
          if (!this.window.__rimChannelViewTracked) this.window.__rimChannelViewTracked = {};
          const stamp = `${channelId}:${user.id}`;
          if (!this.window.__rimChannelViewTracked[stamp]) {
            this.window.__rimChannelViewTracked[stamp] = true;
            // Best-effort; ignore failures.
            void this.repository.client?.from?.('channel_views')?.insert?.({
              channel_id: channelId,
              user_id: user.id
            });
          }
        } catch {
          /* non-critical */
        }

        // Advertising is non-critical to the feed and remains deferred.
        if (typeof this.window.channelAd === 'function') {
          // legacy helper if still exposed
        }
      } catch (enrichError) {
        if (epoch === this.requestEpoch && this.activeChannelId === channelId && full.isConnected) {
          const state = full.querySelector('.rim-cf-feed-state');
          if (state) state.textContent = 'Дополнительные данные не загрузились. Основные публикации доступны.';
        }
        this.logger?.warn?.('channels.feed.enrichment.failed', { message: enrichError?.message });
      }

      return shellResult.value;
    } catch (error) {
      if (epoch !== this.requestEpoch) return null;
      this.logger?.warn?.('channels.feed.open.failed', { message: error?.message, channelId });
      this.#say('Не удалось открыть канал: ' + (error?.message || error?.error_description || error));
      return null;
    }
  }

  close() {
    this.requestEpoch += 1;
    this.activeChannelId = null;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot?.removeEventListener?.('submit', this.submitHandler);
    this.boundRoot = null;
    this.document?.getElementById?.('rimChannelFull')?.remove?.();
  }

  async loadComments(button, postId) {
    const panel = button?.nextElementSibling;
    if (!panel?.classList?.contains?.('rim-cf-comments')) return;

    const open = panel.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    if (!open || button.dataset.loaded === '1' || button.dataset.loading === '1') return;

    const channelId = this.activeChannelId;
    const epoch = this.requestEpoch;
    button.dataset.loading = '1';
    const previous = panel.querySelector('.rim-update-muted');
    if (previous) previous.textContent = 'Загружаем комментарии…';

    try {
      const result = await this.repository.getComments(postId);
      if (epoch !== this.requestEpoch || channelId !== this.activeChannelId || !panel.isConnected) return;
      if (!result.ok) throw result.error;

      const { comments, profileById } = result.value;
      const form = panel.querySelector('.rim-cf-comment-form');
      const html = comments.length
        ? comments.map(row => {
          const profile = profileById[String(row.author_id)] || {};
          const name = escapeHtml(profile.display_name || profile.username || 'Участник');
          return `<div class="rim-cf-comment"><div class="rim-cf-comment-body"><b>${name}</b><div>${escapeHtml(row.body)}</div><small class="rim-update-muted">${formatWhen(row.created_at)}</small></div></div>`;
        }).join('')
        : '<div class="rim-update-muted">Комментариев пока нет.</div>';

      panel.innerHTML = html;
      if (form) panel.append(form);
      button.textContent = 'Комментарии · ' + comments.length;
      button.dataset.loaded = '1';
    } catch (error) {
      if (epoch === this.requestEpoch && panel.isConnected) {
        if (previous) previous.textContent = 'Не удалось загрузить комментарии. Закройте и откройте раздел повторно.';
        button.dataset.loaded = '0';
      }
      this.logger?.warn?.('channels.comments.load.failed', { message: error?.message });
    } finally {
      delete button.dataset.loading;
    }
  }

  invalidate() {
    this.requestEpoch += 1;
  }


  async publishFromComposer() {
    const user = this.getUser?.();
    const channel = this.channel || this.window?.currentChannel;
    if (!user?.id) {
      this.notify?.('Нужен вход в аккаунт.');
      return;
    }
    if (!channel?.id) {
      this.notify?.('Канал не открыт.');
      return;
    }
    const input = this.document?.getElementById?.('rimChannelPostBody')
      || this.document?.getElementById?.('channelPostText');
    const body = String(input?.value || '').trim();
    const normalized = normalizeChannelPostBody(body);
    if (!normalized.ok) {
      this.notify?.(normalized.error);
      return;
    }
    const postBody = normalized.value;
    const client = this.repository?.client || this.window?.db || this.window?.__RIM_LEGACY_CONTEXT?.db;
    if (!client) { this.notify?.('Нет подключения к базе.'); return; }
    const { error } = await client.from('channel_posts').insert({
      channel_id: channel.id,
      author_id: user.id,
      body: postBody
    });
    if (error) {
      this.notify?.(error.message || 'Ошибка публикации');
      return;
    }
    if (input) input.value = '';
    this.notify?.('Публикация добавлена.');
    await this.open(channel.id);
  }

  async reactToPost(postId, emoji) {
    const user = this.getUser?.();
    if (!user?.id || !postId) return;
    const client = this.repository?.client || this.window?.db || this.window?.__RIM_LEGACY_CONTEXT?.db;
    if (!client) { this.notify?.('Нет подключения к базе.'); return; }
    const { error } = await client.from('channel_reactions').upsert({
      post_id: postId,
      user_id: user.id,
      emoji: emoji || '👍'
    });
    if (error) this.notify?.(error.message);
    else {
      this.notify?.('Реакция добавлена.');
      const channel = this.channel || this.window?.currentChannel;
      if (channel?.id) await this.open(channel.id);
    }
  }

  dispose() {
    this.close();
  }
}
