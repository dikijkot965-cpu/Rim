
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DB = () => window.db || (typeof db !== 'undefined' ? db : null);
  const USER = () => window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
  const CHATS = () => (typeof conversations !== 'undefined' ? conversations : (window.conversations || []));
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const say = m => (window.toast || window.notify || window.notifyMsg || console.info)(String(m ?? 'Неизвестная ошибка'));
  const errText = e => e?.message || e?.error_description || String(e || 'Неизвестная ошибка');
  const when = v => v ? new Date(v).toLocaleString('ru-RU') : '—';
  const publishableKey = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
  const supabaseUrl = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://xxvcsaomkyknudoaixbs.supabase.co';
// -------------------- Channel full-page feed, comments, polls and ads --------------------
  let activeChannelId=null;
  async function channelProfiles(ids){const unique=[...new Set((ids||[]).filter(Boolean))];if(!unique.length)return {};const {data}=await DB().from('profiles').select('id,username,display_name,avatar_url').in('id',unique);return Object.fromEntries((data||[]).map(p=>[p.id,p]));}
  async function channelAd(channelId){
    const d=DB();const {data:settings}=await d.from('rim_platform_settings').select('ads_enabled').eq('id',true).maybeSingle();if(settings?.ads_enabled===false)return null;
    const {data:campaigns,error}=await d.from('ad_campaigns').select('id,title,body,media_url,destination_url,placement,starts_at,ends_at').eq('status','active').eq('placement','channel_feed').order('created_at',{ascending:false}).limit(80);
    if(error||!campaigns?.length)return null;
    const ids=campaigns.map(x=>x.id);const {data:targets}=await d.from('ad_campaign_targets').select('campaign_id,channel_id,target_type').in('campaign_id',ids);
    const allTargets=targets||[];const targeted=allTargets.filter(t=>t.target_type==='channel');
    const now=Date.now();const ad=campaigns.find(c=>(!c.starts_at||new Date(c.starts_at).getTime()<=now)&&(!c.ends_at||new Date(c.ends_at).getTime()>now)&&(!allTargets.some(t=>t.campaign_id===c.id)||targeted.some(t=>t.campaign_id===c.id&&t.channel_id===channelId)));
    if(!ad)return null;let image='';if(ad.media_url){const {data:s}=await d.storage.from('rim-advertising').createSignedUrl(ad.media_url,1800);image=s?.signedUrl||'';}return {...ad,image};
  }
  function adDestination(url){if(!url)return '#';if(/^tg:@[a-z0-9_]{3,32}$/i.test(url))return 'https://t.me/'+url.slice(4);if(/^rim:@[a-z0-9_]{3,24}$/i.test(url))return '#rim:'+url.slice(5);if(/^@[a-z0-9_]{3,24}$/i.test(url))return '#rim:'+url.slice(1);return url;}
  window.rimChannelAdOpen=async (campaignId,channelId,encodedUrl)=>{
    const url=decodeURIComponent(encodedUrl||'');
    const d=DB(),u=USER();if(d&&u){const {error}=await d.from('ad_events').insert({campaign_id:campaignId,user_id:u.id,event_type:'click',channel_id:channelId});if(error)console.warn('RIM ad click:',error.message);}
    if(/^#rim:/i.test(url)){const handle=url.slice(5);const {data,error}=await d.from('channels').select('id').eq('username',handle).maybeSingle();if(error||!data)return say('Канал РИМа не найден.');return window.openChannel(data.id);}
    if(/^https?:\/\//i.test(url))window.open(url,'_blank','noopener');else if(url&&url!=='#')say('Недопустимый адрес рекламной ссылки.');
  };
  let channelRequestEpoch=0;
  async function renderChannelFull(id){
    const requestEpoch=++channelRequestEpoch;
    const d=DB(),u=USER();if(!d||!u)throw new Error('Требуется вход в РИМ.');
    const {data:c,error:ce}=await d.from('channels').select('*').eq('id',id).maybeSingle();
    if(ce)throw ce;if(!c)throw new Error('Канал не найден.');
    if(requestEpoch!==channelRequestEpoch)return;
    activeChannelId=id;window.currentChannel=c;

    // Load only the data required for the first meaningful paint. The avatar
    // request is independent and therefore runs alongside membership/feed reads.
    const [membershipResult,postsResult,pollsResult,avatarResult]=await Promise.all([
      d.from('channel_members').select('role').eq('channel_id',id).eq('user_id',u.id).maybeSingle(),
      d.from('channel_posts').select('*').eq('channel_id',id).order('created_at',{ascending:false}).limit(30),
      d.from('channel_polls').select('*').eq('channel_id',id).order('created_at',{ascending:false}).limit(20),
      c.avatar_path?d.storage.from('avatars').createSignedUrl(c.avatar_path,1800):Promise.resolve({data:null,error:null})
    ]);
    if(requestEpoch!==channelRequestEpoch||activeChannelId!==id)return;
    if(membershipResult.error)throw membershipResult.error;
    if(postsResult.error)throw postsResult.error;
    if(pollsResult.error)throw pollsResult.error;
    const membership=membershipResult.data,posts=postsResult.data||[],polls=pollsResult.data||[];
    const joined=!!membership,role=membership?.role||'',manager=c.owner_id===u.id||['admin','moderator'].includes(role)||(window.isImperator?.()===true),canPost=c.owner_id===u.id||role==='admin'||(window.isImperator?.()===true);
    const avatarUrl=avatarResult.data?.signedUrl||'';
    const joinHtml=joined?'<button class="action-btn" onclick="rimLeaveChannel(\''+id+'\')">Отписаться</button>':c.is_public?'<button class="primary-btn" onclick="rimJoinChannel(\''+id+'\')">Подписаться</button>':'<span class="rim-update-muted">Закрытый канал</span>';
    const full=document.createElement('section');full.id='rimChannelFull';
    full.innerHTML=`<header class="rim-cf-head"><button class="icon-btn" onclick="rimCloseChannelFull()" aria-label="Назад">‹</button><div class="rim-channel-avatar" style="width:46px;height:46px;flex:0 0 46px;overflow:hidden">${avatarUrl?`<img src="${esc(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">`:'⚜'}</div><div class="rim-cf-head-copy"><h2>${esc(c.title)}</h2><p>${esc(c.description||'')}${c.username?' · @'+esc(c.username):''}</p></div>${manager?'<button class="icon-btn" onclick="rimOpenChannelSettings()" title="Настройки">⚙</button>':''}<button class="icon-btn" onclick="rimCloseChannelFull()" title="Закрыть">×</button></header><main class="rim-cf-scroll"><div class="rim-cf-toolbar">${joinHtml}${manager?'<button class="action-btn" onclick="rimOpenChannelSettings()">⚙ Настройки канала</button>':''}${canPost?'<button class="action-btn" onclick="rimCreateChannelPoll()">📊 Создать опрос</button>':''}</div>${canPost?'<section class="rim-update-card"><textarea id="rimChannelPostBody" class="field" rows="3" maxlength="10000" placeholder="Новая публикация"></textarea><button class="primary-btn" style="margin-top:8px" onclick="rimPublishPost()">Опубликовать</button></section>':''}<section class="rim-cf-feed-state rim-update-muted" role="status">Загружаем дополнительные данные канала…</section><h3>Публикации</h3>${posts.map(p=>`<article class="rim-cf-post"><div class="rim-cf-post-body">${esc(p.body||'')}</div><div class="rim-update-muted" style="margin-top:9px">${when(p.created_at)}</div></article>`).join('')||'<div class="empty-state">Публикаций пока нет.</div>'}</main>`;
    $('rimChannelFull')?.remove();document.body.appendChild(full);

    // Enrichment is deliberately deferred until the channel shell is visible.
    // The first page is bounded; comments/reactions/votes are not requested for
    // the previous 100 posts anymore.
    const postIds=posts.map(p=>p.id),pollIds=polls.map(p=>p.id);
    let reactionsResult,votesResult;
    try{
      [reactionsResult,votesResult]=await Promise.all([
        postIds.length?d.from('channel_reactions').select('post_id,user_id,emoji').in('post_id',postIds):Promise.resolve({data:[],error:null}),
        pollIds.length?d.from('channel_poll_votes').select('poll_id,user_id,option_index').in('poll_id',pollIds):Promise.resolve({data:[],error:null})
      ]);
      if(reactionsResult.error)throw reactionsResult.error;if(votesResult.error)throw votesResult.error;
    }catch(error){
      if(requestEpoch===channelRequestEpoch&&activeChannelId===id&&full.isConnected){const state=full.querySelector('.rim-cf-feed-state');if(state)state.textContent='Дополнительные данные не загрузились. Основные публикации доступны.';}
      console.warn('RIM channel enrichment:',error?.message||error);return;
    }
    if(requestEpoch!==channelRequestEpoch||activeChannelId!==id||!full.isConnected)return;
    const profileMap=await channelProfiles(posts.map(p=>p.author_id));
    if(requestEpoch!==channelRequestEpoch||activeChannelId!==id||!full.isConnected)return;
    const reactions=reactionsResult.data||[],votes=votesResult.data||[];
    const pollHtml=polls.map(p=>{
      const pollVotes=votes.filter(v=>v.poll_id===p.id),own=pollVotes.find(v=>v.user_id===u.id),total=pollVotes.length;
      const options=(p.options||[]).map((opt,i)=>{const count=pollVotes.filter(v=>v.option_index===i).length,pct=total?Math.round(count*100/total):0;return `<button class="rim-cf-poll-option ${own?.option_index===i?'selected':''}" ${p.is_closed||own?'disabled':''} onclick="rimVoteChannelPoll('${p.id}',${i})"><span class="grow">${esc(opt)}</span><b>${count}</b><span class="rim-update-muted">${pct}%</span></button>`;}).join('');
      return `<section class="rim-cf-poll"><div class="rim-update-muted">ОПРОС · ${total} голосов ${p.is_closed?'· закрыт':''}</div><h3 style="margin:6px 0 9px">${esc(p.question)}</h3>${options}<div class="rim-update-muted">${own?'Ваш голос учтён':p.is_closed?'Голосование закрыто':'Выберите вариант'}</div></section>`;
    }).join('');
    const postsHtml=posts.map(p=>{
      const rx=reactions.filter(x=>x.post_id===p.id);
      const commentsHtml='<div class="rim-update-muted">Откройте комментарии, чтобы загрузить их.</div>';
      return `<article class="rim-cf-post" data-rim-post-id="${esc(p.id)}"><div class="rim-cf-post-body">${esc(p.body||'')}</div><div class="rim-update-muted" style="margin-top:9px">${esc(profileMap[p.author_id]?.display_name||profileMap[p.author_id]?.username||'Автор')} · ${when(p.created_at)}</div><div class="rim-cf-toolbar">${['👍','❤️','🔥','👏','🎉'].map(e=>`<button class="action-btn" onclick="rimReactChannelPost('${p.id}','${e}')">${e} ${rx.filter(x=>x.emoji===e).length||''}</button>`).join('')}</div><button type="button" class="rim-cf-comment-toggle" aria-expanded="false" onclick="rimLoadChannelComments(this,'${p.id}')">Комментарии</button><div class="rim-cf-comments">${commentsHtml}${joined||c.is_public?`<form class="rim-cf-comment-form" onsubmit="event.preventDefault();rimAddChannelComment('${p.id}')"><input id="rimChannelComment-${p.id}" class="field" maxlength="2000" placeholder="Написать комментарий…"><button class="primary-btn" type="submit">Отправить</button></form>`:'<div class="rim-update-muted">Подпишитесь на канал, чтобы комментировать.</div>'}</div></article>`;
    }).join('')||'<div class="empty-state">Публикаций пока нет.</div>';
    const main=full.querySelector('.rim-cf-scroll');
    if(!main||requestEpoch!==channelRequestEpoch||activeChannelId!==id)return;
    main.innerHTML=`<div class="rim-cf-toolbar">${joinHtml}${manager?'<button class="action-btn" onclick="rimOpenChannelSettings()">⚙ Настройки канала</button>':''}${canPost?'<button class="action-btn" onclick="rimCreateChannelPoll()">📊 Создать опрос</button>':''}</div>${canPost?'<section class="rim-update-card"><textarea id="rimChannelPostBody" class="field" rows="3" maxlength="10000" placeholder="Новая публикация"></textarea><button class="primary-btn" style="margin-top:8px" onclick="rimPublishPost()">Опубликовать</button></section>':''}${pollHtml}<h3>Публикации</h3>${postsHtml}`;
    if(!window.__rimChannelViewTracked)window.__rimChannelViewTracked={};
    const stamp=id+':'+u.id,shouldTrackView=!window.__rimChannelViewTracked[stamp]||Date.now()-window.__rimChannelViewTracked[stamp]>300000;
    if(shouldTrackView){window.__rimChannelViewTracked[stamp]=Date.now();window.rimTrackEvent?.('channel_view',{channel_id:id}).catch(()=>{});}
    // Advertising is non-critical to the feed and must never delay its first paint.
    channelAd(id).then(ad=>{
      if(!ad||requestEpoch!==channelRequestEpoch||activeChannelId!==id||!full.isConnected)return;
      const aside=document.createElement('aside');aside.className='rim-cf-ad';
      aside.innerHTML=`<div class="rim-update-muted">РЕКЛАМА</div>${ad.image?`<img src="${esc(ad.image)}" alt="${esc(ad.title)}">`:''}<b>${esc(ad.title)}</b><div style="margin:6px 0">${esc(ad.body||'')}</div>${ad.destination_url?`<button class="action-btn" onclick="rimChannelAdOpen('${ad.id}','${id}','${encodeURIComponent(adDestination(ad.destination_url)).replace(/'/g,'%27')}')">Подробнее ↗</button>`:''}`;
      main.insertBefore(aside,main.querySelector('.rim-cf-poll')||main.querySelector('h3'));
      if(shouldTrackView)d.from('ad_events').insert({campaign_id:ad.id,user_id:u.id,event_type:'impression',channel_id:id}).then(({error})=>{if(error)console.warn('Ad impression:',error.message);});
    }).catch(error=>console.warn('RIM channel ad load:',error?.message||error));
  }
  window.rimLoadChannelComments=async(button,postId)=>{
    const panel=button?.nextElementSibling;if(!panel?.classList.contains('rim-cf-comments'))return;
    const open=panel.classList.toggle('open');button.setAttribute('aria-expanded',String(open));
    if(!open||button.dataset.loaded==='1'||button.dataset.loading==='1')return;
    const channelId=activeChannelId,epoch=channelRequestEpoch,d=DB();button.dataset.loading='1';
    const previous=panel.querySelector('.rim-update-muted');if(previous)previous.textContent='Загружаем комментарии…';
    try{
      const {data,error}=await d.from('channel_post_comments').select('*').eq('post_id',postId).order('created_at',{ascending:true}).limit(100);
      if(error)throw error;if(epoch!==channelRequestEpoch||channelId!==activeChannelId||!panel.isConnected)return;
      const rows=data||[],profiles=await channelProfiles(rows.map(x=>x.author_id));
      if(epoch!==channelRequestEpoch||channelId!==activeChannelId||!panel.isConnected)return;
      const html=rows.map(x=>`<div class="rim-cf-comment"><div class="rim-cf-comment-body"><b>${esc(profiles[x.author_id]?.display_name||profiles[x.author_id]?.username||'Участник')}</b><div>${esc(x.body)}</div><small class="rim-update-muted">${when(x.created_at)}</small></div></div>`).join('')||'<div class="rim-update-muted">Комментариев пока нет.</div>';
      const form=panel.querySelector('.rim-cf-comment-form');panel.innerHTML=html;if(form)panel.append(form);
      button.textContent='Комментарии · '+rows.length;button.dataset.loaded='1';
    }catch(error){if(epoch===channelRequestEpoch&&panel.isConnected){if(previous)previous.textContent='Не удалось загрузить комментарии. Закройте и откройте раздел повторно.';button.dataset.loaded='0';}console.warn('RIM channel comments:',error?.message||error);}
    finally{delete button.dataset.loading;}
  };
  if(window.__RIM_CHANNEL_FEED_OWNED){/* Stage B/C: modular channel feed owns openChannel */}else window.openChannel = async id => {try{await renderChannelFull(id);}catch(e){say('Не удалось открыть канал: '+errText(e));}};
  window.rimCloseChannelFull=()=>{channelRequestEpoch++;$('rimChannelFull')?.remove();activeChannelId=null;};
  window.rimAddChannelComment=async postId=>{const d=DB(),u=USER(),c=window.currentChannel,input=$('rimChannelComment-'+postId),body=input?.value.trim();if(!d||!u||!c||!body)return;const {error}=await d.from('channel_post_comments').insert({post_id:postId,channel_id:c.id,author_id:u.id,body:body.slice(0,2000)});if(error)return say('Не удалось добавить комментарий: '+errText(error));await renderChannelFull(c.id);};
  window.rimReactChannelPost=async(postId,emoji)=>{const d=DB(),u=USER(),{data:old,error:re}=await d.from('channel_reactions').select('post_id').eq('post_id',postId).eq('user_id',u.id).eq('emoji',emoji).maybeSingle();if(re)return say(errText(re));const r=old?await d.from('channel_reactions').delete().eq('post_id',postId).eq('user_id',u.id).eq('emoji',emoji):await d.from('channel_reactions').insert({post_id:postId,user_id:u.id,emoji});if(r.error)return say(errText(r.error));if(activeChannelId)await renderChannelFull(activeChannelId);};
  window.rimCreateChannelPoll=()=>window.showModal(`<h2 class="modal-title">Новый опрос</h2><label>Вопрос</label><input id="rimPollQuestion" class="field" maxlength="500" placeholder="Что хотите узнать у подписчиков?"><label>Варианты ответа (каждый с новой строки)</label><textarea id="rimPollOptions" class="field" rows="5" placeholder="Первый вариант&#10;Второй вариант"></textarea><div class="rim-cf-toolbar"><button class="primary-btn" onclick="rimSaveChannelPoll()">Создать опрос</button><button class="action-btn" onclick="closeModal()">Отмена</button></div>`);
  window.rimSaveChannelPoll=async()=>{const d=DB(),u=USER(),c=window.currentChannel,q=$('rimPollQuestion')?.value.trim(),opts=($('rimPollOptions')?.value||'').split('\n').map(x=>x.trim()).filter(Boolean);if(!c||!q||opts.length<2||opts.length>10)return say('Нужны вопрос и от 2 до 10 вариантов.');const {error}=await d.from('channel_polls').insert({channel_id:c.id,question:q,options:opts,created_by:u.id});if(error)return say('Не удалось создать опрос: '+errText(error));window.closeModal?.();await renderChannelFull(c.id);};
  window.rimVoteChannelPoll=async(pollId,index)=>{const d=DB(),u=USER();const {error}=await d.from('channel_poll_votes').upsert({poll_id:pollId,user_id:u.id,option_index:index},{onConflict:'poll_id,user_id'});if(error)return say('Не удалось записать голос: '+errText(error));if(activeChannelId)await renderChannelFull(activeChannelId);};
  window.rimPublishPost=async()=>{const d=DB(),u=USER(),c=window.currentChannel,body=$('rimChannelPostBody')?.value.trim();if(!d||!u||!c||!body)return say('Введите текст публикации.');const {error}=await d.from('channel_posts').insert({channel_id:c.id,author_id:u.id,body:body.slice(0,10000)});if(error)return say('Не удалось опубликовать: '+errText(error));await renderChannelFull(c.id);};
  if(window.__RIM_CHANNEL_COMMANDS_OWNED){/* modular owns channel commands */}else window.rimJoinChannel=async id=>{const {error}=await DB().rpc('rim_channel_join',{p_channel_id:id});if(error)return say(errText(error));await renderChannelFull(id);};
  if(window.__RIM_CHANNEL_COMMANDS_OWNED){/* modular owns channel commands */}else window.rimLeaveChannel=async id=>{if(!confirm('Отписаться от канала?'))return;const {error}=await DB().rpc('rim_channel_leave',{p_channel_id:id});if(error)return say(errText(error));await renderChannelFull(id);};

  // Channel settings add-on: explicit channel roles and revocable invite links.
  window.rimChannelCreateInvite=async()=>{const c=window.currentChannel;if(!c)return;const maxRaw=prompt('Лимит использований (пусто — без лимита):','');if(maxRaw===null)return;const max=maxRaw.trim()?Number(maxRaw):null;if(max!==null&&(!Number.isInteger(max)||max<1||max>100000))return say('Введите целое число от 1 до 100000.');const daysRaw=prompt('Срок действия в днях (пусто — без срока):','');if(daysRaw===null)return;const days=daysRaw.trim()?Number(daysRaw):null;if(days!==null&&(!Number.isInteger(days)||days<1||days>3650))return say('Срок должен быть от 1 до 3650 дней.');const expires=days?new Date(Date.now()+days*86400000).toISOString():null;const {data,error}=await DB().rpc('rim_channel_create_invite',{p_channel_id:c.id,p_max_uses:max,p_expires_at:expires});if(error)return say(errText(error));const item=data?.[0];if(!item)return say('Сервер не вернул код приглашения.');try{await navigator.clipboard.writeText(item.invite_code);}catch(_){}say('Приглашение создано: '+item.invite_code);await window.rimOpenChannelSettings();};
  window.rimChannelRevokeInvite=async id=>{if(!confirm('Отозвать приглашение?'))return;const {error}=await DB().rpc('rim_channel_revoke_invite',{p_invite_id:id});if(error)return say(errText(error));await window.rimOpenChannelSettings();};
  window.rimChannelCopyInvite=async code=>{try{await navigator.clipboard.writeText(code);say('Код приглашения скопирован.');}catch(_){say('Код приглашения: '+code);}};
  window.rimJoinChannelByInvite=async()=>{const code=prompt('Вставьте код приглашения в канал:');if(!code)return;const {data,error}=await DB().rpc('rim_channel_join_invite',{p_code:code.trim()});if(error)return say(errText(error));say('Вы подписались на канал.');await window.openChannel(data);};
  window.rimSetChannelMemberRoleByName=async()=>{const c=window.currentChannel,name=$('rimChannelRoleUsername')?.value.trim().replace(/^@/,'')||'',role=$('rimChannelRoleSelect')?.value;if(!c||!name)return say('Введите username участника.');const {data:p,error:pe}=await DB().from('profiles').select('id,username').eq('username',name).maybeSingle();if(pe||!p)return say('Пользователь не найден.');const {data:changed,error}=await DB().rpc('rim_channel_set_member_role',{p_channel_id:c.id,p_user_id:p.id,p_role:role});if(error)return say(errText(error));if(!changed)return say('Этот пользователь не состоит в канале.');say('Роль участника изменена.');await window.rimOpenChannelSettings();};
  const baseChannelSettings=window.rimOpenChannelSettings;
  if(typeof baseChannelSettings==='function')window.rimOpenChannelSettings=async function(){
    await baseChannelSettings.apply(this,arguments);
    const c=window.currentChannel,modal=$('modalRoot')?.querySelector('.modal'),box=modal?.querySelector('.rim-channel-settings');
    if(!c||!box||$('rimChannelExtraSettings'))return;
    const owner=USER(),roleAdmin=c.owner_id===owner?.id||(window.isImperator?.()===true);
    if(!roleAdmin)return;
    // Render the settings modal immediately; ancillary role/invite data must not
    // block the primary controls from appearing.
    const extra=document.createElement('section');extra.id='rimChannelExtraSettings';extra.className='rim-update-card';
    extra.innerHTML='<h3>Роли и приглашения</h3><div class="rim-update-muted" role="status">Загружаем роли и приглашения…</div>';
    box.appendChild(extra);
    const channelId=c.id,d=DB();
    Promise.all([
      d.from('channel_invite_links').select('id,invite_code,max_uses,uses_count,expires_at,revoked,created_at').eq('channel_id',channelId).order('created_at',{ascending:false}).limit(20),
      d.from('channel_members').select('user_id,role').eq('channel_id',channelId).order('joined_at',{ascending:false}).limit(200)
    ]).then(([inviteResult,memberResult])=>{
      if(!extra.isConnected||window.currentChannel?.id!==channelId)return;
      const invites=inviteResult.data||[],members=memberResult.data||[];
      const inviteError=inviteResult.error||memberResult.error;
      extra.innerHTML=`<h3>Роли и приглашения</h3><p class="rim-update-muted">Назначать администраторов и модераторов может владелец канала или суперадминистратор.</p>${inviteError?`<div class="notice">${esc(errText(inviteError))}</div>`:''}<div class="rim-search-panel"><input id="rimChannelRoleUsername" class="field" placeholder="@username участника"><select id="rimChannelRoleSelect" class="field"><option value="subscriber">Подписчик</option><option value="moderator">Модератор</option><option value="admin">Администратор</option></select><button class="action-btn" onclick="rimSetChannelMemberRoleByName()">Назначить</button></div><h4>Активные приглашения</h4>${invites.map(x=>`<div class="rim-group-member"><div><b>${esc(x.invite_code)}</b><div class="rim-update-muted">Использовано: ${x.uses_count}${x.max_uses?' / '+x.max_uses:''} · До: ${when(x.expires_at)}</div><div class="rim-update-muted">${x.revoked?'Отозвано':'Активно'}</div></div><div class="row"><button class="action-btn" onclick="rimChannelCopyInvite('${x.invite_code}')">Копировать</button>${!x.revoked?`<button class="action-btn danger-btn" onclick="rimChannelRevokeInvite('${x.id}')">Отозвать</button>`:''}</div></div>`).join('')||'<div class="rim-update-muted">Приглашений пока нет.</div>'}<button class="primary-btn" style="margin-top:9px" onclick="rimChannelCreateInvite()">Создать приглашение</button><div class="rim-update-muted" style="margin-top:8px">Участников в канале: ${members.length}</div>`;
    }).catch(error=>{if(extra.isConnected)extra.innerHTML='<h3>Роли и приглашения</h3><div class="notice">Не удалось загрузить дополнительные настройки: '+esc(errText(error))+'</div>';});
  };
})();

