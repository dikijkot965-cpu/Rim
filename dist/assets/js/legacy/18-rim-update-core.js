
/* RIM 05.11.2026 — navigation, channel feed, polls, admin, sessions, RIM ID, groups and music.
   Classic-script module so the existing single-file HTML and inline controls remain compatible. */
(() => {
  'use strict';
  if (window.__RIM_UPDATE_20261105__) return;
  window.__RIM_UPDATE_20261105__ = true;

  const $ = id => document.getElementById(id);
  const DB = () => window.db || (typeof db !== 'undefined' ? db : null);
  const USER = () => window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
  const CHATS = () => (typeof conversations !== 'undefined' ? conversations : (window.conversations || []));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const say = m => (window.toast || window.notify || window.notifyMsg || console.info)(String(m ?? 'Неизвестная ошибка'));
  const errText = e => e?.message || e?.error_description || String(e || 'Неизвестная ошибка');
  const when = v => v ? new Date(v).toLocaleString('ru-RU') : '—';
  const publishableKey = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '';
  const supabaseUrl = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://xxvcsaomkyknudoaixbs.supabase.co';
  const root = document.documentElement;

  const style = document.createElement('style');
  style.id = 'rim-update-20261105-css';
  style.textContent = `
  #rimChannelFull{position:fixed;inset:0;z-index:10050;background:var(--bg);color:var(--text);display:flex;flex-direction:column;min-height:100dvh;overflow:hidden}
  #rimChannelFull .rim-cf-head{display:flex;align-items:center;gap:12px;padding:12px max(14px,env(safe-area-inset-left)) 12px max(14px,env(safe-area-inset-right));border-bottom:1px solid var(--border);background:var(--panel);flex-shrink:0}
  #rimChannelFull .rim-cf-head-copy{min-width:0;flex:1}#rimChannelFull .rim-cf-head h2{font:700 18px 'Playfair Display',serif;margin:0;overflow-wrap:anywhere}#rimChannelFull .rim-cf-head p{margin:3px 0 0;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
  #rimChannelFull .rim-cf-scroll{overflow:auto;overscroll-behavior:contain;flex:1;width:100%;max-width:900px;margin:0 auto;padding:12px 14px calc(26px + env(safe-area-inset-bottom));box-sizing:border-box}
  #rimChannelFull .rim-cf-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#rimChannelFull .rim-cf-post{background:var(--panel);border:1px solid var(--border);border-radius:15px;padding:14px;margin:12px 0;overflow-wrap:anywhere}
  #rimChannelFull .rim-cf-post-body{white-space:pre-wrap;line-height:1.55;overflow-wrap:anywhere}#rimChannelFull .rim-cf-comment{border-top:1px solid var(--border);padding:9px 0;display:flex;gap:8px;align-items:flex-start}#rimChannelFull .rim-cf-comment-body{min-width:0;flex:1;overflow-wrap:anywhere;white-space:pre-wrap}
  #rimChannelFull .rim-cf-comment-form{display:flex;gap:7px;margin-top:10px}#rimChannelFull .rim-cf-comment-form input{min-width:0;flex:1}#rimChannelFull .rim-cf-poll{border:1px solid var(--border);border-radius:14px;padding:12px;margin:12px 0;background:var(--panel2)}
  #rimChannelFull .rim-cf-poll-option{display:flex;gap:8px;align-items:center;width:100%;text-align:left;margin:6px 0;padding:9px 10px;border-radius:10px;border:1px solid var(--border);background:var(--panel);color:var(--text)}#rimChannelFull .rim-cf-poll-option.selected{border-color:var(--gold);background:var(--mine)}
  #rimChannelFull .rim-cf-ad{border:1px solid var(--border);border-radius:14px;padding:12px;margin:14px 0;background:linear-gradient(135deg,var(--panel2),var(--panel))}#rimChannelFull .rim-cf-ad img{width:100%;max-height:220px;object-fit:cover;border-radius:10px;margin:8px 0}
  .rim-update-card{border:1px solid var(--border);border-radius:14px;padding:13px;margin:12px 0;background:var(--panel)}.rim-update-muted{font-size:12px;color:var(--muted)}
  .rim-admin-user{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)}.rim-admin-user small{display:block;color:var(--muted);overflow-wrap:anywhere}.rim-admin-user-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:150px}.rim-admin-user-actions select{max-width:140px}
  .rim-admin-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:9px}.rim-admin-metric{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:12px;min-width:0}.rim-admin-metric span{display:block;color:var(--muted);font-size:12px}.rim-admin-metric b{display:block;font-size:21px;margin-top:5px;overflow-wrap:anywhere}
  .rim-search-panel{display:flex;gap:8px;align-items:center}.rim-search-panel input{flex:1;min-width:0}.rim-search-result-card{display:flex;gap:11px;align-items:center;padding:11px;border:1px solid var(--border);border-radius:12px;background:var(--panel);margin:7px 0;min-width:0}.rim-search-result-card .grow{min-width:0;flex:1;overflow-wrap:anywhere}
  .rim-music-toolbar{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,180px);gap:8px;margin:10px 0}.rim-music-track{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--panel);margin:8px 0}.rim-music-track audio{grid-column:1/-1;width:100%}
  .rim-analytics-days{display:grid;gap:7px;margin-top:12px}.rim-analytics-day{display:grid;grid-template-columns:72px minmax(0,1fr) 38px;gap:8px;align-items:center;font-size:11px}.rim-analytics-bar{height:9px;border-radius:10px;background:var(--panel2);overflow:hidden}.rim-analytics-bar>i{display:block;height:100%;background:var(--gold);border-radius:10px}.rim-group-member{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)}.rim-group-member>div:first-child{min-width:0;overflow-wrap:anywhere}
  @media(max-width:560px){.rim-admin-user{display:block}.rim-admin-user-actions{margin-top:8px}.rim-music-toolbar{grid-template-columns:1fr}.rim-group-member{align-items:flex-start;flex-direction:column}#rimChannelFull .rim-cf-scroll{padding-left:10px;padding-right:10px}}
  `;
  document.head.appendChild(style);

  // -------------------- Stable chat navigation and Favorites --------------------
  let favoritesSnapshot = null;
  async function openFavoritesStable() {
    const host = $('chatWindow');
    const user = USER();
    const d = DB();
    if (!host || !user || !d) return say('Не удалось открыть Избранное: проверь вход в аккаунт.');
    if (favoritesSnapshot === null && !host.querySelector('.rim-fav-workspace,.rim-writer')) favoritesSnapshot = host.innerHTML;
    host.classList.add('open','mobile-active');
    $('sidebar')?.classList.add('mobile-hidden');
    host.innerHTML = `<div class="rim-fav-workspace" style="height:100%;overflow:auto;padding:12px;box-sizing:border-box">
      <div class="chat-head" style="position:sticky;top:0;z-index:2"><button class="icon-btn" onclick="backToChats()">‹</button><div class="avatar">★</div><div class="chat-head-info"><div class="chat-head-name">Избранное</div><div class="chat-head-status">Личное пространство</div></div></div>
      <section class="rim-update-card"><h3 style="margin:0 0 7px">Твои материалы</h3><p class="rim-update-muted">Заметки, ссылки, важные сообщения и документы. Сохранённое синхронизируется с аккаунтом.</p><div class="row" style="flex-wrap:wrap"><button class="primary-btn" onclick="rimAddFavoriteStable()">＋ Добавить</button><button class="action-btn" onclick="rimOpenWriter()">✒ Lite Writer</button></div></section>
      <div id="rimFavoritesStableList"><div class="loading">Загрузка избранного…</div></div></div>`;
    const {data,error} = await d.from('rim_favorite_items').select('id,item_type,title,body,metadata,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(300);
    const out = $('rimFavoritesStableList');
    if (!out) return;
    if (error) { out.innerHTML = `<div class="notice">Не удалось загрузить избранное: ${esc(errText(error))}</div>`; return; }
    out.innerHTML = (data||[]).map(x=>`<article class="rim-update-card"><div class="row"><b class="grow">${esc(x.title||'Сохранённый материал')}</b><button class="action-btn danger-btn" onclick="rimDeleteFavoriteStable('${x.id}')">Удалить</button></div><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px">${esc(x.body||'')}</div><div class="rim-update-muted" style="margin-top:7px">${when(x.created_at)} · ${esc(x.item_type)}</div></article>`).join('') || '<div class="empty-state">Пока ничего не сохранено.</div>';
  }
  window.openFavorites = openFavoritesStable;
  window.rimAddFavoriteStable = async () => {
    const user=USER(),d=DB();if(!user||!d)return say('Войди в аккаунт.');
    const title=prompt('Название материала:','Заметка');if(title===null)return;
    const body=prompt('Текст или ссылка:','');if(body===null||!body.trim())return;
    const {error}=await d.from('rim_favorite_items').insert({user_id:user.id,item_type:/^https?:\/\//i.test(body.trim())?'link':'text',title:title.trim().slice(0,160)||'Заметка',body:body.trim().slice(0,20000),metadata:{}});
    if(error)return say('Не удалось сохранить: '+errText(error));await openFavoritesStable();
  };
  window.rimDeleteFavoriteStable = async id => {const user=USER(),d=DB();if(!user||!d||!confirm('Удалить материал?'))return;const {error}=await d.from('rim_favorite_items').delete().eq('id',id).eq('user_id',user.id);if(error)return say(errText(error));await openFavoritesStable();};
  window.backToChats = () => {
    const host=$('chatWindow');
    if(host && favoritesSnapshot!==null){host.innerHTML=favoritesSnapshot;favoritesSnapshot=null;}
    host?.classList.remove('mobile-active');$('sidebar')?.classList.remove('mobile-hidden');
  };
  function addFavoritesRow() {if(window.__RIM_FAVORITES_ROW_OWNED)return;
    const list=$('chatList');if(!list||$('rimFavoritesRowStable'))return;
    const row=document.createElement('button');row.type='button';row.id='rimFavoritesRowStable';row.className='chat-item';row.style.width='100%';row.style.textAlign='left';
    row.innerHTML='<span class="avatar">★</span><span class="chat-item-info"><span class="chat-item-name">Избранное</span><span class="chat-item-preview">Личные заметки и сохранённые материалы</span></span>';
    row.addEventListener('click',openFavoritesStable);list.prepend(row);
  }
  const baseRenderList=window.renderConversationList;
  if(typeof baseRenderList==='function'&&!window.__RIM_FAVORITES_ROW_OWNED) window.renderConversationList=function(){const r=baseRenderList.apply(this,arguments);addFavoritesRow();return r;};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addFavoritesRow,{once:true});else addFavoritesRow();

  if(window.__RIM_OPEN_CONVERSATION_OWNED||typeof window.__RIM_MODULAR_OPEN_IMPL==='function'){/* Stage B: modular owns open — legacy body not installed */}else window.openConversation = async function(id) {
    const d=DB(),user=USER(),host=$('chatWindow');
    if(!id || !d || !user || !host) return say('Не удалось открыть чат: отсутствует идентификатор переписки или сессия.');
    try {
      if(favoritesSnapshot!==null) window.backToChats();
      let arr=CHATS();let chat=arr.find(c=>String(c.id)===String(id));
      if(!chat){
        const [m,c]=await Promise.all([
          d.from('conversation_members').select('conversation_id').eq('conversation_id',id).eq('user_id',user.id).maybeSingle(),
          d.from('conversations').select('*').eq('id',id).maybeSingle()
        ]);
        if(m.error)throw m.error;if(c.error)throw c.error;
        if(!m.data||!c.data)throw new Error('Переписка не найдена или у аккаунта нет доступа.');
        chat=c.data; if(typeof conversations!=='undefined') conversations.unshift(chat); else (window.conversations??=[]).unshift(chat);
        arr=CHATS();
      }
      if(typeof activeConversation!=='undefined') activeConversation=chat; else window.activeConversation=chat;
      if(typeof replyTarget!=='undefined') replyTarget=null;
      try{window.cancelReply?.();}catch(_){}
      if(!window.__RIM_CONVERSATION_SHELL_OWNED){
        const set=(el,v)=>{const n=$(el);if(n)n.textContent=v;};
        set('chatHeadName',chat.title|| (chat.type==='direct'?'Личная переписка':'Групповая беседа'));
        set('chatHeadStatus',chat.type==='group'?'Групповая беседа':'Личная переписка');
        const av=$('chatHeadAvatar');if(av)av.textContent=chat.type==='group'?'♧':'♙';
        host.classList.add('open','mobile-active');$('sidebar')?.classList.add('mobile-hidden');
      } else {
        // Modular shell owns provisional header + mobile classes.
        host.classList.add('open','mobile-active');$('sidebar')?.classList.add('mobile-hidden');
      }
      if(typeof window.renderConversationList==='function')window.renderConversationList();
      await window.rimLoadMessagesStable();
      if(typeof window.subscribeToMessages==='function')window.subscribeToMessages();else if(typeof subscribeToMessages==='function')subscribeToMessages();
      try{await window.markConversationRead?.();}catch(_){}
      if(!window.__RIM_CONVERSATION_SHELL_OWNED){
        $('rimGroupSettingsButton')?.remove();
        if(chat.type==='group'){
          const head=document.querySelector('#chatWindow .chat-head');
          if(head){const b=document.createElement('button');b.id='rimGroupSettingsButton';b.className='icon-btn';b.title='Настройки группы';b.textContent='⚙';b.onclick=()=>window.rimOpenGroupSettings(chat.id);head.appendChild(b);}
        }
      }
      if(!window.__RIM_CONVERSATION_SHELL_OWNED&&chat.avatar_path&&chat.type==='group'){
        const {data:s}=await d.storage.from('avatars').createSignedUrl(chat.avatar_path,1800);
        const avNode=$('chatHeadAvatar');
        if(s?.signedUrl&&avNode)avNode.innerHTML=`<img src="${esc(s.signedUrl)}" alt="Аватар группы" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
      window.rimTrackEvent?.('conversation_open',{conversation_id:id,type:chat.type}).catch(()=>{});
    } catch(e) { say('Не удалось открыть чат: '+errText(e)); }
  };

  // Guard the message loader: a missing chat DOM must never turn into an opaque 'undefined' toast.
  if(window.__RIM_MESSAGE_TIMELINE_OWNED){/* modular timeline owns load */}else window.rimLoadMessagesStable=async()=>{const d=DB(),u=USER(),chat=(typeof activeConversation!=='undefined'?activeConversation:window.activeConversation),box=$('messages');if(!d||!u||!chat?.id){if(box)box.innerHTML='<div class="empty-state">Выберите переписку из списка.</div>';return;}if(!box){console.error('RIM: #messages element missing while opening',chat.id);say('Не найдено окно сообщений. Перезагрузи РИМ.');return;}box.innerHTML='<div class="loading">Загрузка сообщений…</div>';const {data,error}=await d.from('chat_messages').select('*').eq('conversation_id',chat.id).order('created_at',{ascending:true}).limit(100);if(error){box.innerHTML=`<div class="notice">Не удалось загрузить сообщения: ${esc(errText(error))}</div>`;console.error('RIM loadMessages:',error);return;}if(typeof messagesCache!=='undefined')messagesCache=data||[];else window.messagesCache=data||[];if(typeof window.renderMessages==='function')await window.renderMessages();else if(typeof renderMessages==='function')await renderMessages();};

  // -------------------- Advanced message actions --------------------
  window.rimOpenMessageActions = async id => {
    const m=(typeof messagesCache!=='undefined'?messagesCache:[]).find(x=>x.id===id);if(!m)return say('Сообщение уже не найдено.');
    const body=esc(m.body||'Вложение');
    window.showModal(`<h2 class="modal-title">Действия с сообщением</h2><div class="rim-update-card" style="white-space:pre-wrap;overflow-wrap:anywhere">${body.slice(0,800)}</div>
      <div class="rim-page-grid"><button class="action-btn" onclick="rimCopyMessage('${id}')">Копировать</button><button class="action-btn" onclick="rimSaveMessage('${id}')">В Избранное</button><button class="action-btn" onclick="pinMessage('${id}');closeModal()">Закрепить</button><button class="action-btn" onclick="rimForwardChoose('${id}')">Переслать</button></div><button class="action-btn" style="width:100%;margin-top:10px" onclick="closeModal()">Закрыть</button>`);
  };
  window.rimCopyMessage = async id => {const m=(typeof messagesCache!=='undefined'?messagesCache:[]).find(x=>x.id===id);if(!m)return;try{await navigator.clipboard.writeText(m.body||'');say('Текст скопирован.');}catch(_){say('Браузер не разрешил копирование.');}};
  window.rimSaveMessage = async id => {const d=DB(),u=USER(),m=(typeof messagesCache!=='undefined'?messagesCache:[]).find(x=>x.id===id);if(!d||!u||!m)return;const {error}=await d.from('rim_favorite_items').insert({user_id:u.id,item_type:'message',title:'Сообщение',body:m.body||'[Вложение]',metadata:{message_id:id,conversation_id:m.conversation_id}});if(error)return say(errText(error));say('Сообщение сохранено в Избранное.');window.closeModal?.();};
  window.rimForwardChoose = id => {
    const chats=CHATS().filter(c=>c.id!==(typeof activeConversation!=='undefined'?activeConversation?.id:null));
    window.showModal(`<h2 class="modal-title">Переслать сообщение</h2>${chats.map(c=>`<button class="rim-search-result-card" style="width:100%;color:var(--text)" onclick="rimForwardMessage('${id}','${c.id}')"><span class="grow"><b>${esc(c.title|| (c.type==='direct'?'Личная переписка':'Группа'))}</b><small class="rim-update-muted">${c.type==='group'?'Групповая беседа':'Личный чат'}</small></span><span>›</span></button>`).join('')||'<div class="empty-state">Нет других переписок.</div>'}`);
  };
  window.rimForwardMessage = async (id,targetId) => {
    const d=DB(),u=USER(),m=(typeof messagesCache!=='undefined'?messagesCache:[]).find(x=>x.id===id);if(!d||!u||!m)return;
    const {data:member,error:me}=await d.from('conversation_members').select('conversation_id').eq('conversation_id',targetId).eq('user_id',u.id).maybeSingle();if(me)return say(errText(me));if(!member)return say('Нет доступа к выбранному чату.');
    const {error}=await d.from('chat_messages').insert({conversation_id:targetId,sender_id:u.id,body:m.body||'',forwarded_from_user_id:m.sender_id,forwarded_from_message_id:m.id});if(error)return say('Не удалось переслать: '+errText(error));say('Сообщение переслано.');window.closeModal?.();
  };
  const baseRenderMessages=window.renderMessages;
  if(typeof baseRenderMessages==='function'&&!window.__RIM_MESSAGE_DECORATIONS_OWNED)window.renderMessages=async function(){await baseRenderMessages.apply(this,arguments);document.querySelectorAll('#messages .message[data-id]').forEach(el=>{const actions=el.querySelector('.message-actions');if(!actions||actions.querySelector('[data-rim-advanced]'))return;const b=document.createElement('button');b.type='button';b.dataset.rimAdvanced='1';b.title='Дополнительные действия';b.textContent='⋯';b.onclick=()=>window.rimOpenMessageActions(el.dataset.id);actions.appendChild(b);});};
})();

