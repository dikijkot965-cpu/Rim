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
function sum(rows, key) { return (rows || []).reduce((total, row) => total + Number(row?.[key] || 0), 0); }

/**
 * Owns the channel full-page feed read model: shell, deferred enrichment and
 * lazy comments. Mutations remain on legacy window entrypoints.
 */
export class ChannelFeedController {
  constructor({
    repository,
    getUser,
    e2eScopeRepository = null,
    e2eRuntime = null,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    logger = null,
    notify = null,
    isImperator = null
  } = {}) {
    this.repository = repository;
    this.getUser = getUser;
    this.e2eScopeRepository = e2eScopeRepository;
    this.e2eRuntime = e2eRuntime;
    this.document = documentRef;
    this.window = windowRef;
    this.e2eMessageHandler = event => this.#onE2EMessage(event);
    this.window?.addEventListener?.('rim:e2e-message', this.e2eMessageHandler);
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
    this.changeHandler = this.#onChange.bind(this);
    this.boundRoot = null;
  }

  #say(message) {
    this.notify(message);
  }

  #bindRoot(root) {
    if (this.boundRoot === root) return;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot?.removeEventListener?.('submit', this.submitHandler);
    this.boundRoot?.removeEventListener?.('change', this.changeHandler);
    this.boundRoot = root;
    this.boundRoot?.addEventListener?.('click', this.clickHandler);
    this.boundRoot?.addEventListener?.('submit', this.submitHandler);
    this.boundRoot?.addEventListener?.('change', this.changeHandler);
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
      case 'e2e-setup':
        void this.enableE2E();
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
      case 'load-older':
        void this.loadOlderPosts(actionEl);
        break;
      case 'tab': {
        if (!this.feedState) break;
        this.feedState.activeTab = actionEl.dataset.tab || 'posts';
        const main = this.boundRoot?.querySelector?.('.rim-cf-scroll');
        if (main) main.innerHTML = this.#renderEnrichedFeed(this.feedState);
        if (this.feedState.activeTab === 'media' || this.feedState.activeTab === 'links') void this.#ensureAssets();
        if (['members','admins'].includes(this.feedState.activeTab)) void this.#ensureRoster();
        if (this.feedState.activeTab === 'requests') void this.#ensureJoinRequests();
        if (this.feedState.activeTab === 'scheduled') void this.#ensureScheduledPosts();
        break;
      }
      case 'review-request':
        void this.reviewJoinRequest(actionEl.dataset.requestId, actionEl.dataset.decision);
        break;
      case 'cancel-scheduled':
        void this.cancelScheduledPost(actionEl.dataset.scheduledId);
        break;
      case 'publish-scheduled':
        void this.publishScheduledPost(actionEl.dataset.scheduledId);
        break;
      case 'moderate-member':
        void this.window?.rimModerateChannel?.(channelId, actionEl.dataset.userId, actionEl.dataset.moderation || 'kick');
        break;
      case 'copy-link': {
        const url = actionEl.dataset.url || '';
        if (url && this.window?.navigator?.clipboard?.writeText) void this.window.navigator.clipboard.writeText(url).then(() => this.#say('Ссылка скопирована.')).catch(() => this.#say(url));
        break;
      }
      case 'pin':
        void this.togglePinnedPost(actionEl, postId);
        break;
      case 'edit-post':
        void this.editPost(postId);
        break;
      case 'delete-post':
        void this.deletePost(postId);
        break;
      case 'share-post':
        void this.sharePost(postId);
        break;
      case 'to-feed':
        void this.publishPostToHomeFeed(postId);
        break;
      case 'choose-media':
        this.document?.getElementById?.('rimChannelPostMedia')?.click?.();
        break;
      case 'invite':
        void this.window?.rimChannelCreateInvite?.();
        break;
      case 'discussion': {
        const conversationId = this.channel?.discussion_conversation_id;
        if (conversationId) void this.window?.openConversation?.(conversationId);
        break;
      }
      case 'new-post': {
        const composer = this.document?.getElementById?.('rimChannelPostBody');
        composer?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        composer?.focus?.();
        break;
      }
      case 'goto-post': {
        const target = [...(this.document?.querySelectorAll?.('[data-rim-post-id]') || [])]
          .find(node => String(node.dataset.rimPostId) === String(postId));
        target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        target?.focus?.({ preventScroll: true });
        break;
      }
      default:
        break;
    }
  }

  #onChange(event) {
    const mirror=event.target?.closest?.('#rimChannelAlsoToFeed');if(mirror){this.window?.rimSetChannelFeedPref?.(mirror.checked===true);return;}
    const input=event.target?.closest?.('#rimChannelPostMedia');if(!input)return;const label=this.document?.getElementById?.('rimChannelPostMediaName');if(label)label.textContent=input.files?.[0]?input.files[0].name+' · '+(input.files[0].size/1024/1024).toFixed(1)+' МБ':'Можно прикрепить одно изображение до 10 МБ.';
  }

  #onSubmit(event) {
    const form = event.target?.closest?.('.rim-cf-comment-form, .rim-cf-schedule-form');
    if (!form || !this.boundRoot?.contains?.(form)) return;
    event.preventDefault();
    if (form.matches('.rim-cf-schedule-form')) { void this.scheduleFromForm(form); return; }
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

  #renderShell({ channel, posts, avatarUrl, joined, manager, canPost, memberCount = 0, managerCount = 0 }) {
    const id = escapeHtml(channel.id);
    const e2eActive = channel.e2e_mode === 'required';
    const avatar = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="eager">`
      : '<span>⚜</span>';
    const e2eButton = channel.is_public === false && manager
      ? `<button class="rim-cf-hero-secondary" type="button" data-rim-cf-action="e2e-setup">🔒 ${channel.e2e_mode === 'required' ? 'Проверить E2E' : 'Включить E2E'}</button>`
      : '';
    const joinHtml = joined
      ? `<button class="rim-cf-follow-btn is-following" type="button" data-rim-cf-action="leave" data-channel-id="${id}">Вы подписаны</button>`
      : channel.is_public
        ? `<button class="rim-cf-follow-btn" type="button" data-rim-cf-action="join" data-channel-id="${id}">Подписаться</button>`
        : '<span class="rim-update-muted">Закрытый канал</span>';
    const postsHtml = (posts || []).map(post => `
      <article class="rim-cf-post" data-rim-post-id="${escapeHtml(post.id)}">
        <div class="rim-cf-post-body">${escapeHtml(post.body || '')}</div>
        <div class="rim-update-muted" style="margin-top:9px">${formatWhen(post.created_at)}</div>
      </article>`).join('') || '<div class="rim-cf-empty"><b>Пока здесь тихо</b><span>Когда появятся публикации, они будут отображаться здесь.</span></div>';
    return `<header class="rim-cf-head">
      <button class="rim-cf-back" type="button" data-rim-cf-action="close" aria-label="Назад">‹</button>
      <div class="rim-cf-head-avatar">${avatar}</div>
      <div class="rim-cf-head-copy"><h2>${escapeHtml(channel.title)}</h2><p>${memberCount.toLocaleString('ru-RU')} подписчиков${channel.username ? ' · @' + escapeHtml(channel.username) : ''}</p></div>
      ${manager ? '<button class="rim-cf-head-action" type="button" data-rim-cf-action="settings" aria-label="Настройки">⚙</button>' : '<button class="rim-cf-head-action" type="button" data-rim-cf-action="tab" data-tab="about" aria-label="Информация">ⓘ</button>'}
    </header>
    <main class="rim-cf-scroll">
      <section class="rim-cf-loading-hero"><div class="rim-cf-hero-avatar">${avatar}</div><h1>${escapeHtml(channel.title)}</h1><p>${escapeHtml(channel.description || 'Публичный канал РИМ')}</p><div class="rim-cf-hero-count">${memberCount.toLocaleString('ru-RU')} подписчиков${manager ? ` · ${managerCount.toLocaleString('ru-RU')} администраторов` : ''}</div><div class="rim-cf-profile-actions">${joinHtml}${e2eButton}${manager ? '<button type="button" class="rim-cf-hero-secondary" data-rim-cf-action="invite">Пригласить</button><button type="button" class="rim-cf-hero-secondary" data-rim-cf-action="new-post">Новая публикация</button>' : ''}${channel.discussion_conversation_id ? '<button type="button" class="rim-cf-hero-secondary" data-rim-cf-action="discussion">Обсуждение</button>' : ''}</div></section>
      ${manager ? `<section class="rim-cf-admin-panel"><div class="rim-cf-admin-title"><div><span>УПРАВЛЕНИЕ КАНАЛОМ</span><h3>Панель администратора</h3></div></div><div class="rim-cf-admin-grid"><button type="button" data-rim-cf-action="tab" data-tab="about"><b>${memberCount.toLocaleString('ru-RU')}</b><span>Подписчики</span></button><button type="button" data-rim-cf-action="tab" data-tab="admins"><b>${managerCount.toLocaleString('ru-RU')}</b><span>Администраторы</span></button></div><div class="rim-cf-admin-actions"><button type="button" data-rim-cf-action="new-post">＋ Новая публикация</button><button type="button" data-rim-cf-action="invite">↗ Пригласить</button>${e2eActive?'':'<button type="button" data-rim-cf-action="create-poll">▤ Создать опрос</button>'}<button type="button" data-rim-cf-action="settings">Настройки канала</button></div></section>` : ''}
      <div class="rim-cf-feed-state rim-update-muted" role="status">Загружаем публикации и информацию…</div>
      <h3>Публикации</h3>${postsHtml}
    </main>`;
  }

  #renderEnrichedFeed(state) {
    const { channel, posts = [], polls = [], reactions = [], votes = [], profileById = {}, userId, joined, manager, canPost, hasMorePosts = false, pinnedPosts = [], memberCount = 0, managerCount = 0, avatarUrl = '', profileDetails = {}, assets = { media: [], links: [] } } = state;
    const id = escapeHtml(channel.id);
    const e2eActive = channel.e2e_mode === 'required';
    const avatar = avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="eager">` : '<span>⚜</span>';
    const e2eButton = channel.is_public === false && manager
      ? `<button class="rim-cf-hero-secondary" type="button" data-rim-cf-action="e2e-setup">🔒 ${channel.e2e_mode === 'required' ? 'Проверить E2E' : 'Включить E2E'}</button>`
      : '';
    const joinHtml = joined
      ? `<button class="rim-cf-follow-btn is-following" type="button" data-rim-cf-action="leave" data-channel-id="${id}">Вы подписаны</button>`
      : channel.is_public
        ? `<button class="rim-cf-follow-btn" type="button" data-rim-cf-action="join" data-channel-id="${id}">Подписаться</button>`
        : '<span class="rim-update-muted">Закрытый канал</span>';
    const active = state.activeTab || 'posts';
    const tabs = [['posts','Публикации'],['media','Медиа'],['links','Ссылки'],['about','О канале'],...(manager?[['members','Подписчики'],['admins','Администраторы'],['requests','Заявки'],['scheduled','Отложенные']]:[])];
    const tabHtml = `<nav class="rim-cf-tabs" aria-label="Разделы канала">${tabs.map(([key,label]) => `<button type="button" class="rim-cf-tab ${active===key?'active':''}" data-rim-cf-action="tab" data-tab="${key}" aria-current="${active===key?'page':'false'}">${label}</button>`).join('')}</nav>`;
    const pinnedHtml = pinnedPosts.length ? `<section class="rim-cf-pinned-list"><div class="rim-cf-pinned-title">📌 Закреплённые публикации</div>${pinnedPosts.map(post => `<div class="rim-cf-pinned-item"><button class="rim-cf-pinned-jump" type="button" data-rim-cf-action="goto-post" data-post-id="${escapeHtml(post.id)}">${escapeHtml(post.body || 'Медиа-публикация')}</button>${manager ? `<button class="action-btn" type="button" data-rim-cf-action="pin" data-post-id="${escapeHtml(post.id)}">Открепить</button>` : ''}</div>`).join('')}</section>` : '';
    const votesByPoll = new Map();
    for (const vote of votes) { const key=String(vote.poll_id); if(!votesByPoll.has(key)) votesByPoll.set(key,[]); votesByPoll.get(key).push(vote); }
    const pollHtml = polls.map(poll => {
      const pv=votesByPoll.get(String(poll.id))||[]; const own=pv.find(v=>String(v.user_id)===String(userId)); const total=pv.length;
      const options=(poll.options||[]).map((opt,index)=>{const count=pv.filter(v=>Number(v.option_index)===index).length;const pct=total?Math.round(count*100/total):0;return `<button class="rim-cf-poll-option ${own&&Number(own.option_index)===index?'selected':''}" type="button" ${poll.is_closed||own||e2eActive?'disabled':''} data-rim-cf-action="vote" data-poll-id="${escapeHtml(poll.id)}" data-option-index="${index}"><span class="grow">${escapeHtml(opt)}</span><b>${count}</b><span class="rim-update-muted">${pct}%</span></button>`}).join('');
      return `<section class="rim-cf-poll"><div class="rim-update-muted">ОПРОС · ${total} голосов ${poll.is_closed?'· закрыт':''}</div><h3>${escapeHtml(poll.question)}</h3>${options}<div class="rim-update-muted">${own?'Ваш голос учтён':poll.is_closed?'Голосование закрыто':'Выберите вариант'}</div></section>`;
    }).join('');
    const reactionsByPost=new Map(); for(const row of reactions){const key=String(row.post_id);if(!reactionsByPost.has(key))reactionsByPost.set(key,[]);reactionsByPost.get(key).push(row)}
    const postsHtml=posts.map(post=>{
      const rx=reactionsByPost.get(String(post.id))||[];const author=profileById[String(post.author_id)]||{};const authorLabel=escapeHtml(author.display_name||author.username||channel.title);
      const e2ePost = channel.e2e_mode === 'required' || post._rimE2E === true;
      const reactionButtons=e2ePost ? '' : REACTION_EMOJI.map(emoji=>{const count=rx.filter(row=>row.emoji===emoji).length;const mine=rx.some(row=>row.emoji===emoji&&String(row.user_id)===String(userId));return `<button class="rim-cf-reaction ${mine?'active':''}" type="button" data-rim-cf-action="react" data-post-id="${escapeHtml(post.id)}" data-emoji="${emoji}">${emoji}<span>${count||''}</span></button>`}).join('');
      const commentForm=e2ePost?'<div class="rim-update-muted">Комментарии для E2E-публикаций недоступны.</div>':joined||channel.is_public?`<form class="rim-cf-comment-form" data-post-id="${escapeHtml(post.id)}"><input id="rimChannelComment-${escapeHtml(post.id)}" class="field" maxlength="2000" placeholder="Написать комментарий…"><button class="primary-btn" type="submit">Отправить</button></form>`:'<div class="rim-update-muted">Подпишитесь на канал, чтобы комментировать.</div>';
      return `<article class="rim-cf-post ${post.is_pinned?'is-pinned':''}" data-rim-post-id="${escapeHtml(post.id)}">${post.is_pinned?'<div class="rim-cf-pinned-label">📌 Закреплённая публикация</div>':''}<div class="rim-cf-post-author"><div class="rim-cf-post-channel-avatar">${avatar}</div><div><b>${escapeHtml(channel.title)}</b><small>${authorLabel!==escapeHtml(channel.title)?' · '+authorLabel:''} · ${formatWhen(post.created_at)}</small></div>${e2ePost?'':'<button class="rim-cf-post-menu" type="button" data-rim-cf-action="share-post" data-post-id="'+escapeHtml(post.id)+'" aria-label="Поделиться публикацией">↗</button>'}</div>${post.image_url?`<img class="rim-cf-post-image" src="${escapeHtml(post.image_url)}" alt="Медиа публикации" loading="lazy">`:''}<div class="rim-cf-post-body">${escapeHtml(post.body||'')}</div><div class="rim-cf-post-footer"><div class="rim-cf-reactions">${reactionButtons}</div>${manager&&!e2ePost?`<span class="rim-cf-post-admin-actions"><button class="rim-cf-pin-action" type="button" data-rim-cf-action="pin" data-post-id="${escapeHtml(post.id)}">${post.is_pinned?'Открепить':'📌'}</button><button class="rim-cf-pin-action" type="button" data-rim-cf-action="edit-post" data-post-id="${escapeHtml(post.id)}">Изменить</button><button class="rim-cf-pin-action" type="button" data-rim-cf-action="delete-post" data-post-id="${escapeHtml(post.id)}">Удалить</button>${channel.is_public===true?`<button class="rim-cf-pin-action" type="button" data-rim-cf-action="to-feed" data-post-id="${escapeHtml(post.id)}">В Ленту</button>`:''}</span>`:''}</div>${e2ePost?'':'<button type="button" class="rim-cf-comment-toggle" aria-expanded="false" data-rim-cf-action="comments" data-post-id="'+escapeHtml(post.id)+'">Комментарии</button>'}<div class="rim-cf-comments"><div class="rim-update-muted">Откройте комментарии, чтобы загрузить их.</div>${commentForm}</div></article>`;
    }).join('')||'<div class="rim-cf-empty"><b>Публикаций пока нет</b><span>Здесь появятся новые записи канала.</span></div>';
    const profileDetailsHtml = `<section class="rim-cf-info-card"><h3>Информация</h3><p>${escapeHtml(channel.description||'Описание канала пока не добавлено.')}</p>${channel.username?`<div class="rim-cf-link-row"><span>Публичная ссылка</span><b>@${escapeHtml(channel.username)}</b><button type="button" data-rim-cf-action="copy-link" data-url="${escapeHtml('@'+channel.username)}">Копировать</button></div>`:''}<div class="rim-cf-info-stats"><div><b>${Number(memberCount).toLocaleString('ru-RU')}</b><span>Подписчики</span></div><div><b>${Number(managerCount).toLocaleString('ru-RU')}</b><span>Администраторы</span></div><div><b>${Number(posts.length).toLocaleString('ru-RU')}</b><span>В ленте</span></div></div>${channel.discussion_conversation_id?'<button class="rim-cf-wide-action" type="button" data-rim-cf-action="discussion">Открыть обсуждение</button>':''}</section>`;
    const managerPanel = manager ? `<section class="rim-cf-admin-panel"><div class="rim-cf-admin-title"><div><span>УПРАВЛЕНИЕ КАНАЛОМ</span><h3>Панель администратора</h3></div><button type="button" class="rim-cf-settings-round" data-rim-cf-action="settings">⚙</button></div><div class="rim-cf-admin-grid"><button type="button" data-rim-cf-action="tab" data-tab="about"><b>${Number(memberCount).toLocaleString('ru-RU')}</b><span>Подписчики</span></button><button type="button" data-rim-cf-action="tab" data-tab="admins"><b>${Number(managerCount).toLocaleString('ru-RU')}</b><span>Администраторы</span></button><button type="button" data-rim-cf-action="tab" data-tab="requests"><b>${profileDetails.pendingCount==null?'—':Number(profileDetails.pendingCount).toLocaleString('ru-RU')}</b><span>Заявки</span></button><button type="button" data-rim-cf-action="tab" data-tab="scheduled"><b>${profileDetails.scheduledCount==null?'—':Number(profileDetails.scheduledCount).toLocaleString('ru-RU')}</b><span>Отложенные</span></button></div><div class="rim-cf-admin-actions"><button type="button" data-rim-cf-action="new-post">＋ Новая публикация</button><button type="button" data-rim-cf-action="invite">↗ Пригласить</button>${e2eActive?'':'<button type="button" data-rim-cf-action="create-poll">▤ Создать опрос</button>'}<button type="button" data-rim-cf-action="settings">Настройки канала</button></div></section>` : '';
    let content = '';
    const mirrorChecked=this.window?.rimGetChannelFeedPref?.()===true?'checked':'';
    const mirrorHtml=channel.is_public===true&&!e2eActive?'<label class="rim-cf-feed-mirror"><input id="rimChannelAlsoToFeed" type="checkbox" '+mirrorChecked+'> Также опубликовать в общей Ленте</label>':'';
    const composerHtml = canPost ? `<section class="rim-cf-composer"><div class="rim-cf-composer-title"><b>Новая публикация</b><span>От имени канала</span></div><textarea id="rimChannelPostBody" class="field" rows="3" maxlength="8000" placeholder="Что нового у канала?"></textarea>${mirrorHtml}<div class="rim-cf-composer-actions">${e2eActive?'':'<button type="button" class="rim-cf-composer-tool" data-rim-cf-action="choose-media">▧ Фото</button>'}${e2eActive?'':'<button type="button" class="rim-cf-composer-tool" data-rim-cf-action="create-poll">▤ Опрос</button>'}<button type="button" class="primary-btn" data-rim-cf-action="publish">Опубликовать</button></div><input id="rimChannelPostMedia" class="rim-cf-media-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><div class="rim-cf-media-hint" id="rimChannelPostMediaName">Можно прикрепить одно изображение до 10 МБ.</div></section>` : '';
    if (active === 'posts') content = `${composerHtml}${pinnedHtml}${pollHtml}<div class="rim-cf-section-heading"><h3>Публикации</h3><span>${posts.length} загружено</span></div>${postsHtml}${hasMorePosts?'<button class="action-btn rim-cf-load-older" type="button" data-rim-cf-action="load-older">Показать более ранние публикации</button>':'<div class="rim-update-muted rim-cf-end">Вы просмотрели все загруженные публикации</div>'}`;
    else if (active === 'media') content = `<div class="rim-cf-section-heading"><h3>Медиа</h3><span>${assets.media?.length||0}</span></div>${assets.loading?'<div class="rim-cf-empty">Загружаем медиа…</div>':assets.media?.length?`<div class="rim-cf-media-grid">${assets.media.map(item=>`<button type="button" class="rim-cf-media-tile" data-rim-cf-action="goto-post" data-post-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.media_url||'')}" alt="Медиа канала" loading="lazy"><span>${formatWhen(item.created_at)}</span></button>`).join('')}</div>`:'<div class="rim-cf-empty"><b>Медиа пока нет</b><span>Фотографии и видео из публикаций будут собираться здесь.</span></div>'}`;
    else if (active === 'links') content = `<div class="rim-cf-section-heading"><h3>Ссылки</h3><span>${assets.links?.length||0}</span></div>${assets.links?.length?assets.links.map(link=>`<div class="rim-cf-link-card"><div><b>${escapeHtml(link.url)}</b><small>${formatWhen(link.created_at)}</small></div><button type="button" data-rim-cf-action="copy-link" data-url="${escapeHtml(link.url)}">Копировать</button><button type="button" data-rim-cf-action="goto-post" data-post-id="${escapeHtml(link.postId)}">Пост</button></div>`).join(''):'<div class="rim-cf-empty"><b>Ссылок пока нет</b><span>Ссылки из публикаций появятся в этом разделе автоматически.</span></div>'}`;
    else if (active === 'about') content = `${profileDetailsHtml}${manager?`<section class="rim-cf-admin-metrics"><h3>Статистика за 30 дней</h3><div class="rim-cf-metric-grid">${this.#metric('Просмотры',sum(profileDetails.dailyStats,'views_count'))}${this.#metric('Новые подписки',sum(profileDetails.dailyStats,'subscribers_count'))}${this.#metric('Публикации',sum(profileDetails.dailyStats,'posts_count'))}${this.#metric('Реакции',sum(profileDetails.dailyStats,'reactions_count'))}</div><p>Показатели основаны на сохранённых дневных агрегатах. Если статистика ещё не собиралась, значения будут нулевыми.</p></section>`:''}`;
    else if (active === 'members' || active === 'admins') { const rows=(state.roster||[]).filter(row=>active==='members'||['owner','admin','moderator'].includes(String(row.role||'').toLowerCase())); content=manager?`<section class="rim-cf-info-card"><h3>${active==='admins'?'Администраторы канала':'Подписчики канала'}</h3><p>${state.rosterLoading?'Загружаем список…':state.rosterError?'Не удалось загрузить список участников. Проверьте права доступа.':`${rows.length} записей загружено`}</p>${rows.map(row=>{const profile=row.profile||{};const name=escapeHtml(profile.display_name||profile.username||'Участник');const role=escapeHtml(row.role||'subscriber');const avatar=profile.avatar_url?`<img src="${escapeHtml(profile.avatar_url)}" alt="">`:'<span>◉</span>';return `<div class="rim-cf-member-row"><div class="rim-cf-member-avatar">${avatar}</div><div class="rim-cf-member-copy"><b>${name}</b><small>${role} · ${formatWhen(row.joined_at)}</small></div>${String(row.user_id)!==String(channel.owner_id)&&String(row.user_id)!==String(userId)?`<button type="button" data-rim-cf-action="moderate-member" data-channel-id="${id}" data-user-id="${escapeHtml(row.user_id)}" data-moderation="kick">Удалить</button>`:''}</div>`}).join('')||'<div class="rim-cf-empty">Список пуст или недоступен.</div>'}</section>`:profileDetailsHtml; }
    else if (active === 'requests') { const rows=state.joinRequests||[]; content=manager?`<section class="rim-cf-info-card"><div class="rim-cf-section-heading"><h3>Заявки на вступление</h3><span>${state.requestsLoading?'Загрузка…':rows.length}</span></div>${state.requestsError?'<div class="rim-cf-empty">Не удалось загрузить заявки. Проверьте права доступа.</div>':rows.map(row=>{const profile=row.profile||{};return `<div class="rim-cf-member-row"><div class="rim-cf-member-avatar">${profile.avatar_url?`<img src="${escapeHtml(profile.avatar_url)}" alt="">`:'<span>◉</span>'}</div><div class="rim-cf-member-copy"><b>${escapeHtml(profile.display_name||profile.username||'Участник')}</b><small>${escapeHtml(row.message||'Без комментария')} · ${formatWhen(row.created_at)}</small></div><button type="button" data-rim-cf-action="review-request" data-request-id="${escapeHtml(row.id)}" data-decision="approved">Принять</button><button type="button" data-rim-cf-action="review-request" data-request-id="${escapeHtml(row.id)}" data-decision="rejected">Отклонить</button></div>`}).join('')||'<div class="rim-cf-empty"><b>Новых заявок нет</b></div>'}</section>`:profileDetailsHtml; }
    else if (active === 'scheduled') { const rows=state.scheduledPosts||[]; content=manager?`<section class="rim-cf-info-card"><div class="rim-cf-section-heading"><h3>Отложенные публикации</h3><span>${rows.length}</span></div><form class="rim-cf-schedule-form"><textarea class="field" name="body" maxlength="10000" rows="3" placeholder="Текст публикации" required></textarea><label class="field-label">Дата и время публикации</label><input class="field" type="datetime-local" name="scheduled_at" required><button class="primary-btn rim-cf-wide-action" type="submit">Запланировать публикацию</button></form>${state.scheduledError?'<div class="rim-cf-empty">Не удалось загрузить расписание.</div>':''}${rows.map(row=>`<div class="rim-cf-scheduled-row"><div><b>${escapeHtml(row.body||'Медиа-публикация')}</b><small>${formatWhen(row.scheduled_at)}</small></div><button type="button" data-rim-cf-action="publish-scheduled" data-scheduled-id="${escapeHtml(row.id)}">Опубликовать сейчас</button><button type="button" data-rim-cf-action="cancel-scheduled" data-scheduled-id="${escapeHtml(row.id)}">Отменить</button></div>`).join('')||'<div class="rim-cf-empty">Отложенных публикаций пока нет.</div>'}</section>`:profileDetailsHtml; }
    return `<section class="rim-cf-hero"><div class="rim-cf-hero-cover"></div><div class="rim-cf-hero-main"><div class="rim-cf-hero-avatar">${avatar}</div><div class="rim-cf-hero-title"><h1>${escapeHtml(channel.title)}</h1><span>${channel.is_public?'Публичный канал':'Частный канал'}${channel.username?' · @'+escapeHtml(channel.username):''}</span></div><div class="rim-cf-hero-count"><b>${Number(memberCount).toLocaleString('ru-RU')}</b><span>подписчиков</span></div></div>${channel.description?`<p class="rim-cf-hero-description">${escapeHtml(channel.description)}</p>`:''}<div class="rim-cf-hero-actions">${joinHtml}${e2eButton}${manager?'<button type="button" class="rim-cf-hero-secondary" data-rim-cf-action="invite">Пригласить</button>':''}${channel.discussion_conversation_id?'<button type="button" class="rim-cf-hero-secondary" data-rim-cf-action="discussion">Обсуждение</button>':''}</div></section>${managerPanel}${tabHtml}<section class="rim-cf-tab-content">${content}</section>`;
  }

  #onE2EMessage(event) {
    const message = event?.detail?.message || {};
    const state = this.feedState;
    if (!state || state.channel?.e2e_mode !== 'required' || String(message.conversationId || '') !== String(state.channel.id)) return;
    const id = String(message.messageId || '');
    if (!id || state.posts.some(post => String(post.id) === id)) return;
    state.posts.push({ id, channel_id: state.channel.id, author_id: message.senderId, body: String(message.body || ''), created_at: new Date(Number(message.timestamp || Date.now())).toISOString(), _rimE2E: true });
    state.posts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const main = this.boundRoot?.querySelector?.('.rim-cf-scroll');
    if (main) main.innerHTML = this.#renderEnrichedFeed(state);
  }

  async enableE2E() {
    const state = this.feedState;
    const user = this.getUser?.();
    const channel = state?.channel;
    if (!state || !user?.id || !channel?.id || channel.is_public !== false) { this.#say('E2E доступно только участникам закрытого канала.'); return null; }
    if (!this.e2eRuntime?.startIncoming || !this.e2eRuntime?.verifyScopeExchange || !this.e2eScopeRepository?.requestEnable) { this.#say('Защищённый E2E-модуль недоступен.'); return null; }
    try {
      const scopeInput = { type: 'private_channel', id: channel.id, is_public: false };
      const currentScope = await this.e2eScopeRepository.getScope(scopeInput, user.id);
      if (!currentScope.ok) throw currentScope.error;
      if (channel.e2e_mode !== 'required' && channel.e2e_mode !== 'pending') {
        const pending = await this.e2eScopeRepository.requestPending(scopeInput);
        if (!pending.ok) throw pending.error;
      }
      await this.e2eRuntime.startIncoming();
      const members = await this.repository.client.from('channel_members').select('user_id').eq('channel_id', channel.id);
      if (members.error) throw members.error;
      const memberIds = [...new Set((members.data || []).map(row => String(row.user_id || '')).filter(Boolean))];
      if (!memberIds.includes(String(user.id)) || memberIds.length < 2) throw new Error('Не удалось подтвердить полный состав подписчиков.');
      await this.e2eRuntime.verifyScopeExchange({ type: 'private_channel', id: channel.id }, memberIds);
      if (channel.e2e_mode !== 'required') {
        const result = await this.e2eScopeRepository.activateScope(scopeInput);
        if (!result.ok) throw result.error;
      }
      this.#say('E2E проверено для участников канала. Закрытый канал использует только зашифрованные публикации.');
      await this.open(channel.id);
      return true;
    } catch (error) {
      this.logger?.warn?.('channels.e2e.enable.failed', { channelId: String(channel.id), message: error?.message || String(error) });
      this.#say(error?.message || 'Не удалось включить E2E. Открытая публикация не выполнялась.');
      return null;
    }
  }

  #metric(label, value) { return `<div><b>${Number(value||0).toLocaleString('ru-RU')}</b><span>${label}</span></div>`; }

  async #ensureRoster() {
    const state=this.feedState; if(!state||state.rosterLoaded||state.rosterLoading||!state.manager||!this.repository.getAdminRoster)return;
    state.rosterLoading=true; const main=this.boundRoot?.querySelector?.('.rim-cf-scroll'); if(main)main.innerHTML=this.#renderEnrichedFeed(state);
    try { const result=await this.repository.getAdminRoster(state.channel.id); if(!result.ok)throw result.error; if(this.feedState!==state)return; state.roster=result.value||[];state.rosterLoaded=true; }
    catch(error){this.logger?.warn?.('channels.roster.failed',{message:error?.message||String(error)});state.roster=[];state.rosterError=true;state.rosterLoaded=true;}
    finally{state.rosterLoading=false;const current=this.boundRoot?.querySelector?.('.rim-cf-scroll');if(current)current.innerHTML=this.#renderEnrichedFeed(state);}
  }

  async #ensureAssets() {
    const state=this.feedState; if(!state||state.assetsLoaded||state.assetsLoading)return;
    state.assetsLoading=true; state.assets={...(state.assets||{}),loading:true};
    const main=this.boundRoot?.querySelector?.('.rim-cf-scroll'); if(main) main.innerHTML=this.#renderEnrichedFeed(state);
    try { const result=await this.repository.getChannelAssets(state.channel.id); if(!result.ok) throw result.error; if(this.feedState!==state)return; state.assets=result.value; state.assetsLoaded=true; }
    catch(error){this.logger?.warn?.('channels.assets.failed',{message:error?.message||String(error)});state.assets={media:[],links:[],error:true};state.assetsLoaded=true;}
    finally{state.assetsLoading=false;const current=this.boundRoot?.querySelector?.('.rim-cf-scroll');if(current)current.innerHTML=this.#renderEnrichedFeed(state);}
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

      let { channel, membership, posts, polls, pinnedPosts = [], avatarUrl, hasMorePosts = false, memberCount = 0, managerCount = 0 } = shellResult.value;
      if ((channel.e2e_mode === 'pending' || channel.e2e_mode === 'required') && this.e2eRuntime?.startIncoming) {
        try { await this.e2eRuntime.startIncoming(); } catch (error) { this.logger?.warn?.('channels.e2e.runtime_start.failed', { message: String(error?.message || error) }); }
      }
      if (channel.e2e_mode === 'required' && this.e2eRuntime?.getLocalConversation) {
        try {
          const localRows = await this.e2eRuntime.getLocalConversation(channelId, { limit: 500 });
          const merged = new Map((posts || []).map(post => [String(post.id), post]));
          for (const row of localRows || []) merged.set(String(row.messageId), { id: String(row.messageId), channel_id: channelId, author_id: row.senderId, body: row.body, created_at: new Date(Number(row.timestamp || Date.now())).toISOString(), _rimE2E: true });
          posts = [...merged.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        } catch (error) { this.logger?.warn?.('channels.e2e.local_history.failed', { message: String(error?.message || error) }); }
      }
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
        canPost: flags.canPost,
        memberCount,
        managerCount
      });
      const host = this.document.querySelector?.('.main') || this.document.body;
      host.appendChild(full);
      this.document?.getElementById?.('app')?.classList.add('rim-channel-focus');
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
        let profileDetails = {};
        if (flags.manager && this.repository.getProfileDetails) {
          try { const details = await this.repository.getProfileDetails(channel.id); if (details?.ok) profileDetails = details.value || {}; }
          catch (detailsError) { this.logger?.warn?.('channels.profile.details.failed', { message: detailsError?.message }); }
        }
        this.feedState = {
          channel, posts: [...posts], polls, reactions, votes, profileById,
          userId: user.id, joined: flags.joined, manager: flags.manager,
          canPost: flags.canPost, hasMorePosts, pinnedPosts: [...pinnedPosts], memberCount, managerCount,
          avatarUrl, profileDetails, activeTab: 'posts', assets: { media: [], links: [] }, assetsLoaded: false, assetsLoading: false
        };
        const main = full.querySelector('.rim-cf-scroll');
        if (main) main.innerHTML = this.#renderEnrichedFeed(this.feedState);

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
    this.feedState = null;
    this.loadingOlderPosts = false;
    this.boundRoot?.removeEventListener?.('click', this.clickHandler);
    this.boundRoot?.removeEventListener?.('submit', this.submitHandler);
    this.boundRoot?.removeEventListener?.('change', this.changeHandler);
    this.boundRoot = null;
    this.document?.getElementById?.('rimChannelFull')?.remove?.();
    this.document?.getElementById?.('app')?.classList.remove('rim-channel-focus');
  }

  async togglePinnedPost(button, postId) {
    const state = this.feedState;
    const post = state?.posts?.find(item => String(item.id) === String(postId))
      || state?.pinnedPosts?.find(item => String(item.id) === String(postId));
    if (!state || !post || !this.repository.pinPost) return;
    const nextPinned = !post.is_pinned;
    if (button) { button.disabled = true; button.textContent = 'Сохраняем…'; }
    try {
      const result = await this.repository.pinPost(postId, nextPinned);
      if (!result.ok) throw result.error;
      post.is_pinned = nextPinned;
      post.pinned_at = nextPinned ? new Date().toISOString() : null;
      if (nextPinned) {
        state.pinnedPosts = [post, ...(state.pinnedPosts || []).filter(item => String(item.id) !== String(postId))].slice(0, 5);
      } else {
        state.pinnedPosts = (state.pinnedPosts || []).filter(item => String(item.id) !== String(postId));
      }
      const main = this.boundRoot?.querySelector?.('.rim-cf-scroll');
      if (main) main.innerHTML = this.#renderEnrichedFeed(state);
      this.#say(nextPinned ? 'Публикация закреплена.' : 'Публикация откреплена.');
    } catch (error) {
      this.logger?.warn?.('channels.feed.pin.failed', { message: error?.message || String(error) });
      if (button) { button.disabled = false; button.textContent = post.is_pinned ? 'Открепить' : '📌 Закрепить'; }
      this.#say('Не удалось изменить закрепление публикации.');
    }
  }

  async loadOlderPosts(button) {
    const state = this.feedState;
    if (!state || this.loadingOlderPosts || !state.hasMorePosts) return;
    const cursor = state.posts[state.posts.length - 1];
    if (!cursor) return;
    this.loadingOlderPosts = true;
    if (button) { button.disabled = true; button.textContent = 'Загружаем…'; }
    const main = this.boundRoot?.querySelector?.('.rim-cf-scroll');
    const previousScrollTop = main?.scrollTop || 0;
    try {
      const result = await this.repository.getOlderPosts(state.channel.id, cursor);
      if (!result.ok) throw result.error;
      const older = result.value || [];
      if (!older.length) {
        state.hasMorePosts = false;
      } else {
        const enrichment = await this.repository.getEnrichment({
          postIds: older.map(post => post.id),
          authorIds: older.map(post => post.author_id)
        });
        if (!enrichment.ok) throw enrichment.error;
        const ids = new Set(state.posts.map(post => String(post.id)));
        state.posts.push(...older.filter(post => !ids.has(String(post.id))));
        state.reactions.push(...enrichment.value.reactions);
        state.votes.push(...enrichment.value.votes);
        Object.assign(state.profileById, enrichment.value.profileById);
        state.hasMorePosts = older.length >= (this.repository.postLimit || 30);
      }
      if (main && this.boundRoot?.isConnected !== false) {
        main.innerHTML = this.#renderEnrichedFeed(state);
        main.scrollTop = previousScrollTop;
      }
    } catch (error) {
      this.logger?.warn?.('channels.feed.pagination.failed', { message: error?.message || String(error) });
      if (button) { button.disabled = false; button.textContent = 'Повторить загрузку'; }
      this.#say('Не удалось загрузить более ранние публикации. Попробуйте ещё раз.');
    } finally {
      this.loadingOlderPosts = false;
    }
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

  async #ensureJoinRequests() {
    const state=this.feedState; if(!state||state.requestsLoaded||state.requestsLoading||!state.manager)return;
    state.requestsLoading=true; const result=await this.repository.getJoinRequests(state.channel.id);
    if(this.feedState!==state)return; state.requestsLoading=false; state.requestsLoaded=true;
    if(result.ok)state.joinRequests=result.value;else{state.requestsError=true;this.logger?.warn?.('channels.requests.load.failed',{message:result.error?.message});}
    const main=this.boundRoot?.querySelector?.('.rim-cf-scroll');if(main)main.innerHTML=this.#renderEnrichedFeed(state);
  }

  async #ensureScheduledPosts() {
    const state=this.feedState; if(!state||state.scheduledLoaded||state.scheduledLoading||!state.manager)return;
    state.scheduledLoading=true; const result=await this.repository.getScheduledPosts(state.channel.id);
    if(this.feedState!==state)return; state.scheduledLoading=false; state.scheduledLoaded=true;
    if(result.ok)state.scheduledPosts=result.value;else{state.scheduledError=true;this.logger?.warn?.('channels.scheduled.load.failed',{message:result.error?.message});}
    const main=this.boundRoot?.querySelector?.('.rim-cf-scroll');if(main)main.innerHTML=this.#renderEnrichedFeed(state);
  }

  async reviewJoinRequest(requestId, decision) {
    const state=this.feedState;if(!state?.manager)return;
    const result=await this.repository.reviewJoinRequest(requestId,decision);
    if(!result.ok){this.#say('Не удалось обработать заявку: '+(result.error?.message||''));return;}
    state.requestsLoaded=false;state.profileDetails.pendingCount=Math.max(0,Number(state.profileDetails.pendingCount||0)-1);
    await this.#ensureJoinRequests();this.#say(decision==='approved'?'Заявка принята.':'Заявка отклонена.');
  }

  async #allowPlaintextChannelOperation(channel, userId, operationLabel) {
    if (channel?.is_public === true) return true;
    if (channel?.is_public !== false) {
      this.#say('Не удалось подтвердить тип канала. Операция остановлена.');
      return false;
    }
    if (typeof this.e2eScopeRepository?.getScope !== 'function') {
      this.#say('Не удалось проверить режим защиты канала. Операция остановлена.');
      return false;
    }
    const result = await this.e2eScopeRepository.getScope({ type: 'private_channel', id: channel.id, is_public: false }, userId);
    if (!result?.ok) {
      this.logger?.warn?.('channels.e2e_scope_lookup_failed', { channelId: String(channel.id), operation: operationLabel, message: String(result?.error?.message || 'unknown') });
      this.#say('Не удалось проверить режим защиты канала. Операция остановлена.');
      return false;
    }
    if (result.value?.enabled) {
      this.#say('В этом канале требуется E2E. Операция с открытым текстом недоступна.');
      return false;
    }
    return true;
  }

  async scheduleFromForm(form) {
    const state=this.feedState,user=this.getUser?.();if(!state?.manager||!user?.id)return;
    if (!(await this.#allowPlaintextChannelOperation(state.channel, user.id, 'schedule'))) return;
    if (this.feedState !== state || String(this.getUser?.()?.id || '') !== String(user.id)) {
      this.#say('Планирование отменено: аккаунт или канал изменился.');
      return;
    }
    const data=new FormData(form);const result=await this.repository.schedulePost(state.channel.id,user.id,data.get('body'),data.get('scheduled_at'));
    if(!result.ok){this.#say(result.error?.message||'Не удалось запланировать публикацию.');return;}
    if (this.feedState !== state || String(this.getUser?.()?.id || '') !== String(user.id)) {
      if (result.value?.id) {
        try { await this.repository.cancelScheduledPost(result.value.id); } catch (error) {
          this.logger?.warn?.('channels.schedule.stale_rollback_failed', { message: String(error?.message || error) });
        }
      }
      this.#say('Планирование отменено: аккаунт или канал изменился.');
      return;
    }
    form.reset();state.scheduledLoaded=false;await this.#ensureScheduledPosts();this.#say('Публикация добавлена в расписание.');
  }

  async cancelScheduledPost(id) {
    const state=this.feedState;if(!state?.manager)return;const result=await this.repository.cancelScheduledPost(id);
    if(!result.ok){this.#say(result.error?.message||'Не удалось отменить публикацию.');return;}
    state.scheduledLoaded=false;await this.#ensureScheduledPosts();this.#say('Публикация отменена.');
  }

  async publishScheduledPost(id) {
    const state=this.feedState,user=this.getUser?.();if(!state?.manager||!user?.id)return;
    if (!(await this.#allowPlaintextChannelOperation(state.channel, user.id, 'publish-scheduled'))) return;
    if (this.feedState !== state || String(this.getUser?.()?.id || '') !== String(user.id)) {
      this.#say('Публикация отменена: аккаунт или канал изменился.');
      return;
    }
    const result=await this.repository.publishScheduledPost(id);
    if(!result.ok){this.#say(result.error?.message||'Не удалось опубликовать запись.');return;}
    state.scheduledLoaded=false;await this.#ensureScheduledPosts();this.#say('Публикация опубликована.');
  }

  async editPost(postId) {
    const state=this.feedState;if(!state?.manager)return;const post=state.posts.find(x=>String(x.id)===String(postId));if(!post)return;
    const next=this.window?.prompt?.('Изменить текст публикации:',post.body||'');if(next===null||next===undefined)return;
    const result=await this.repository.updatePost(postId,next);if(!result.ok){this.#say(result.error?.message||'Не удалось изменить публикацию.');return;}
    post.body=result.value.body;post.edited_at=result.value.edited_at;const main=this.boundRoot?.querySelector?.('.rim-cf-scroll');if(main)main.innerHTML=this.#renderEnrichedFeed(state);this.#say('Публикация изменена.');
  }

  async deletePost(postId) {
    const state=this.feedState;if(!state?.manager)return;if(!this.window?.confirm?.('Удалить публикацию?'))return;
    const result=await this.repository.deletePost(postId);if(!result.ok){this.#say(result.error?.message||'Не удалось удалить публикацию.');return;}
    state.posts=state.posts.filter(x=>String(x.id)!==String(postId));state.pinnedPosts=state.pinnedPosts.filter(x=>String(x.id)!==String(postId));const main=this.boundRoot?.querySelector?.('.rim-cf-scroll');if(main)main.innerHTML=this.#renderEnrichedFeed(state);this.#say('Публикация удалена.');
  }

  async publishPostToHomeFeed(postId){
    const state=this.feedState,channel=state?.channel;
    if(!state?.manager||!channel||channel.is_public!==true||channel.e2e_mode==='required'){this.#say('Перенос в общую Ленту разрешён только для публичного канала без E2E.');return false;}
    const post=(state.posts||[]).find(row=>String(row.id)===String(postId));if(!post){this.#say('Публикация канала не найдена.');return false;}
    if(typeof this.window?.rimPublishChannelPostToFeed!=='function'){this.#say('Модуль публикации в общую Ленту недоступен.');return false;}
    const profile=state.profileById?.[String(post.author_id)]||{};const result=await this.window.rimPublishChannelPostToFeed(channel,{...post,sourceAuthor:profile.display_name||profile.username||'автор канала'});
    if(result?.ok)this.#say(result.duplicate?'Эта публикация уже есть в общей Ленте.':'Публикация канала добавлена в общую Ленту.');else this.#say(result?.error||'Не удалось добавить публикацию в общую Ленту.');return result?.ok===true;
  }

  async sharePost(postId) {
    const state=this.feedState;const channel=state?.channel;if(!channel)return;
    const url=`${this.window?.location?.origin||''}/?channel=${encodeURIComponent(channel.id)}&post=${encodeURIComponent(postId)}`;
    try{await this.window?.navigator?.clipboard?.writeText?.(url);this.#say('Ссылка на публикацию скопирована.');}catch{this.#say(url);}
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
    const isCurrentContext = () => {
      const activeUser = this.getUser?.();
      const activeChannel = this.channel || this.window?.currentChannel;
      return String(activeUser?.id || '') === String(user.id)
        && String(activeChannel?.id || '') === String(channel.id);
    };
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
    const mediaInput = this.document?.getElementById?.('rimChannelPostMedia');
    const mediaFile = mediaInput?.files?.[0] || null;
    const mirrorToFeed=this.document?.getElementById?.('rimChannelAlsoToFeed')?.checked===true;
    if (mediaFile && (mediaFile.size > 10 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(mediaFile.type))) {
      this.notify?.('Изображение должно быть JPG, PNG, WebP или GIF и не больше 10 МБ.');
      return;
    }

    // A private channel can be marked E2E-required. This legacy publisher writes
    // plaintext into channel_posts, so it must stop before any media upload or
    // database write when the channel requires encryption.
    if (channel.is_public === false) {
      if (typeof this.e2eScopeRepository?.getScope !== 'function') {
        this.notify?.('Не удалось проверить режим защиты канала. Публикация остановлена.');
        return;
      }
      const scopeResult = await this.e2eScopeRepository.getScope({ type: 'private_channel', id: channel.id, is_public: false }, user.id);
      if (!isCurrentContext()) { this.notify?.('Публикация отменена: аккаунт или канал изменился.'); return; }
      if (!scopeResult?.ok) {
        this.logger?.warn?.('channels.publish.e2e_scope_lookup_failed', { channelId: String(channel.id), message: String(scopeResult?.error?.message || 'unknown') });
        this.notify?.('Не удалось проверить режим защиты канала. Публикация остановлена.');
        return;
      }
      if (scopeResult.value?.enabled) {
        if (mediaFile) { this.notify?.('Для E2E-канала пока поддерживается только текстовая публикация. Медиа не загружено.'); return; }
        let protectedScope = scopeResult.value;
        if (!protectedScope.readiness?.ready && Array.isArray(protectedScope.readiness?.missingUserIds) && protectedScope.readiness.missingUserIds.length === 0 && this.e2eRuntime?.verifyScopeExchange && Array.isArray(protectedScope.memberUserIds)) {
          try {
            await this.e2eRuntime.startIncoming();
            await this.e2eRuntime.verifyScopeExchange({ type: 'private_channel', id: channel.id }, protectedScope.memberUserIds);
            const refreshed = await this.e2eScopeRepository.getScope({ type: 'private_channel', id: channel.id, is_public: false }, user.id);
            if (!refreshed.ok) throw refreshed.error;
            protectedScope = refreshed.value;
          } catch (error) { this.notify?.(`E2E-проверка не завершена: ${error?.message || error}. Открытый текст не отправлен.`); return; }
        }
        if (!protectedScope.readiness?.ready || !Array.isArray(protectedScope.memberUserIds) || !this.e2eRuntime?.sendGroup) { this.notify?.(protectedScope.readiness?.reason || 'Защищённый маршрут доставки не готов. Открытый текст не отправлен.'); return; }
        const memberIds = protectedScope.memberUserIds;
        if (!memberIds.includes(String(user.id)) || memberIds.length < 2) { this.notify?.('Не удалось подтвердить состав участников канала.'); return; }
        if (!isCurrentContext()) { this.notify?.('Публикация отменена: аккаунт или канал изменился.'); return; }
        try {
          const sent = await this.e2eRuntime.sendGroup(memberIds, postBody, { conversationId: channel.id, scopeType: 'private_channel', clientMessageId: crypto.randomUUID() });
          if (input) input.value = '';
          if (mediaInput) mediaInput.value = '';
          if (sent.failedRecipientCount) this.notify?.(`E2E-доставка частичная: принято ${sent.acceptedRecipientCount}, ошибок ${sent.failedRecipientCount}. Не повторяй автоматически.`);
          else this.notify?.('Зашифрованная публикация отправлена участникам канала.');
        } catch (error) { this.notify?.(`E2E-публикация не отправлена: ${error?.message || error}`); }
        return;
      }
    }

    if (!isCurrentContext()) { this.notify?.('Публикация отменена: аккаунт или канал изменился.'); return; }
    let imagePath = null;
    if (mediaFile) {
      const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mediaFile.type];
      imagePath = `channels/${channel.id}/${user.id}/${crypto.randomUUID()}.${ext}`;
      const upload = await client.storage.from('chat-files').upload(imagePath, mediaFile, { contentType: mediaFile.type, upsert: false });
      if (upload.error) { this.notify?.('Не удалось загрузить изображение: ' + upload.error.message); return; }
      if (!isCurrentContext()) {
        await client.storage.from('chat-files').remove([imagePath]);
        this.notify?.('Публикация отменена: аккаунт или канал изменился. Загруженный файл удалён.');
        return;
      }
    }
    if (!isCurrentContext()) {
      if (imagePath) await client.storage.from('chat-files').remove([imagePath]);
      this.notify?.('Публикация отменена: аккаунт или канал изменился.');
      return;
    }
    const { data: createdPost, error } = await client.from('channel_posts').insert({
      channel_id: channel.id, author_id: user.id, body: postBody, image_path: imagePath
    }).select('id').single();
    if (error) {
      if (imagePath) await client.storage.from('chat-files').remove([imagePath]);
      this.notify?.(error.message || 'Ошибка публикации');
      return;
    }
    // A context switch after the insert is rare but cannot be silently treated
    // as success. Remove the just-created row and its media on a best-effort basis.
    if (!isCurrentContext()) {
      if (createdPost?.id) await client.from('channel_posts').delete().eq('id', createdPost.id);
      if (imagePath) await client.storage.from('chat-files').remove([imagePath]);
      this.notify?.('Публикация отменена: аккаунт или канал изменился.');
      return;
    }
    // Best-effort channel push: publication must not fail if push delivery is unavailable.
    try {
      if (createdPost?.id && client.functions?.invoke) {
        void client.functions.invoke('rim-push', { body: { action: 'send_channel_post', post_id: createdPost.id } })
          .then(({ error: pushError, data }) => {
            if (pushError || data?.error) this.logger?.warn?.('channels.push.delivery.failed', { message: String(pushError?.message || data?.error || 'unknown') });
          }).catch(pushError => this.logger?.warn?.('channels.push.delivery.failed', { message: String(pushError?.message || pushError) }));
      }
    } catch (pushError) {
      this.logger?.warn?.('channels.push.delivery.failed', { message: String(pushError?.message || pushError) });
    }
    if(mirrorToFeed&&channel.is_public===true&&channel.e2e_mode!=='required'){
      const mirrored=await this.window?.rimPublishChannelPostToFeed?.(channel,{id:createdPost.id,body:postBody,image_path:imagePath,sourceAuthor:'администратор канала'});
      if(!mirrored?.ok)this.notify?.('Публикация размещена в канале, но не перенесена в общую Ленту: '+String(mirrored?.error||'ошибка переноса'));
    }
    if (input) input.value = '';
    if (mediaInput) mediaInput.value = '';
    this.notify?.(mirrorToFeed?'Публикация обработана: канал и выбранная Лента.':'Публикация добавлена.');
    await this.open(channel.id);
  }

  async reactToPost(postId, emoji) {
    const user = this.getUser?.();
    const state = this.feedState;
    const channel = state?.channel || this.channel || this.window?.currentChannel;
    if (!user?.id || !postId || !channel?.id) return;
    if (!(await this.#allowPlaintextChannelOperation(channel, user.id, 'reaction'))) return;
    if ((state && this.feedState !== state)
      || String(this.getUser?.()?.id || '') !== String(user.id)
      || String((this.window?.currentChannel || channel)?.id || '') !== String(channel.id)) {
      this.notify?.('Операция отменена: аккаунт или канал изменился.');
      return;
    }
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
      if (channel?.id) await this.open(channel.id);
    }
  }

  dispose() {
    this.close();
    this.window?.removeEventListener?.('rim:e2e-message', this.e2eMessageHandler);
  }
}
