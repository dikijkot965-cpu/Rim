
/* RIM 2026-11-05: consolidated stability layer. Kept isolated for safe rollback. */
(()=>{'use strict';
 const R=window.RIM=window.RIM||{};
 const $=id=>document.getElementById(id);
 const getDb=()=>window.db||(typeof db!=='undefined'?db:null), user=()=>window.currentUser||(typeof currentUser!=='undefined'?currentUser:null), chats=()=>typeof conversations!=='undefined'?conversations:(window.conversations||[]), messages=()=>typeof messagesCache!=='undefined'?messagesCache:(window.messagesCache||[]);
 const say=s=>(window.toast||window.notify||window.notifyMsg||console.warn)(String(s??''));
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const err=e=>e?.message||String(e||'Неизвестная ошибка');
 const fmt=v=>v?new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'давно не заходил';

 // Favorites is an ordinary list item, not a pinned/highlighted special card.
 function normalizeFavoritesRow(){
  const list=$('chatList'); if(!list)return;
  list.querySelectorAll('#rimFavoritesRow,#rimFavoritesRowStable,[data-rim-favorites-row]').forEach(n=>n.remove());
  const row=document.createElement('div'); row.id='rimFavoritesRowStable'; row.dataset.rimFavoritesRow='1'; row.className='chat-item';
  row.innerHTML='<div class="avatar">★</div><div class="chat-item-info"><div class="chat-item-name">Избранное</div><div class="chat-item-preview">Личные заметки и документы</div></div>';
  row.addEventListener('click',()=>window.openFavorites?.()); list.appendChild(row);
 }
 const favCss=document.createElement('style'); favCss.textContent='#rimFavoritesRow,#rimFavoritesRowStable{border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important}#rimFavoritesRow .avatar,#rimFavoritesRowStable .avatar{background:var(--panel2,rgba(255,255,255,.06))!important;color:var(--gold)!important;border:1px solid var(--border)!important}'; document.head.appendChild(favCss);
 const prevRender=window.renderConversationList;
 if(typeof prevRender==='function'&&!R.favoritesRenderer){window.renderConversationList=function(){const v=prevRender.apply(this,arguments);normalizeFavoritesRow();return v;};R.favoritesRenderer=true;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',normalizeFavoritesRow,{once:true});else normalizeFavoritesRow();

 // Music: protect against concurrent loads, duplicate rows, and N sequential signed-URL requests.
 let musicLoadToken=0;
 window.loadMusic=async function(){
  const list=$('musicList'),d=getDb(),u=user(); if(!list||!d||!u)return;
  const token=++musicLoadToken; list.innerHTML='<div class="loading">Загружаем музыкальный каталог…</div>';
  try{
   const {data,error}=await d.from('music_tracks').select('id,user_id,title,artist,file_path,visibility,created_at').order('created_at',{ascending:false}).limit(300);
   if(error)throw error; if(token!==musicLoadToken)return;
   const unique=new Map(); for(const t of data||[]){if(!t?.id||!t.file_path)continue; const key=String(t.user_id||'')+'|'+String(t.file_path); if(!unique.has(key))unique.set(key,t);}
   const tracks=[...unique.values()];
   const signed=await Promise.all(tracks.map(async t=>{const {data:s,error:e}=await d.storage.from('music-library').createSignedUrl(t.file_path,1800);return {track:t,url:s?.signedUrl||'',error:e};}));
   if(token!==musicLoadToken)return;
   const valid=signed.filter(x=>x.url);
   if(!valid.length){list.innerHTML='<div class="empty-state">Музыкальные файлы пока недоступны. Проверьте доступ к хранилищу.</div>';return;}
   const frag=document.createDocumentFragment();
   for(const {track:t,url} of valid){const item=document.createElement('article');item.className='card';item.dataset.trackId=t.id;
    const title=document.createElement('strong');title.textContent=t.title||'Без названия';
    const meta=document.createElement('div');meta.className='muted';meta.style.cssText='font-size:12px;margin:5px 0';meta.textContent=`${t.artist||'Неизвестный исполнитель'} · ${t.visibility==='public'?'public':'private'}${t.user_id===u.id?' · Ваш трек':''}`;
    const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=url;audio.style.cssText='width:100%;margin-top:8px';
    item.append(title,meta,audio);frag.appendChild(item);
   }
   list.replaceChildren(frag);
  }catch(e){if(token===musicLoadToken)list.innerHTML=`<div class="notice">Не удалось загрузить музыку: ${esc(err(e))}</div>`;}
 };

 // Forward menu was still wired to the legacy function. Route it to the working flow.
 if(typeof window.rimForwardChoose==='function')window.rimForward=window.rimForwardChoose;
 const oldMenu=window.rimMessageMenu;
 if(typeof oldMenu==='function'&&!R.forwardMenu&&!window.__RIM_FORWARD_OWNED){window.rimMessageMenu=function(id){oldMenu.apply(this,arguments);const modal=$('#modalRoot .modal');if(!modal)return;const buttons=[...modal.querySelectorAll('button')];const f=buttons.find(b=>/Переслать/.test(b.textContent||''));if(f){f.onclick=()=>{window.closeModal?.();window.rimForwardChoose?.(id);};}};R.forwardMenu=true;}


 // Stage B: forward attachment copy is owned by modular ForwardMessageService.
 // Legacy rimDoForward enhancement retired under __RIM_FORWARD_OWNED (and preferred even without flag at boot after modular bind).
 const priorForward=window.rimDoForward;
 if(typeof priorForward==='function'&&!R.forwardAttachments){
  if(window.__RIM_FORWARD_OWNED){
   R.forwardAttachments=true;
  }else{
   // Emergency-only: keep prior without re-wrapping attachment pipeline.
   R.forwardAttachments=true;
  }
 }

 // Active sessions panel is not part of the product settings UI; keep app integrations intact.
 const oldSettings=window.openSettings;
 if(typeof oldSettings==='function'&&!R.settingsClean&&!window.__RIM_SETTINGS_SHELL_OWNED){window.openSettings=function(){const result=oldSettings.apply(this,arguments);$('#rimMySessionsCard')?.remove();return result;};R.settingsClean=true;}


 // Fast startup: do not block first paint on music catalog and signed audio URLs.
 window.initializeApp=async function(){
  const u=user();if(!u)return;if(typeof initializing!=='undefined'&&initializing)return;
  try{if(typeof initializing!=='undefined')initializing=true; if($('authScreen'))$('authScreen').classList.add('hidden');
   const jobs=[['profile',()=>window.loadProfile?.()],['settings',()=>window.loadSettings?.()],['chats',()=>window.loadConversations?.()],['channels',()=>window.loadChannels?.()]];
   const results=await Promise.allSettled(jobs.map(([,fn])=>Promise.resolve().then(fn)));
   results.forEach((r,i)=>{if(r.status==='rejected')console.warn('RIM startup '+jobs[i][0]+':',r.reason);});
   if($('chatHeadStatus'))$('chatHeadStatus').textContent='На связи';
   if(typeof window.rimTrackEvent==='function')window.rimTrackEvent('session_start',{source:'web_app'}).catch(()=>{});
  }catch(e){console.error('RIM startup:',e);say('Ошибка запуска: '+err(e));}
  finally{if(typeof initializing!=='undefined')initializing=false;}
 };

 // Chat-list message/read-state Realtime projection is owned by src/application/conversation-state-controller.js.

 // Last-seen and read ticks for direct chats. Typing remains the ephemeral Realtime broadcast.
 const oldOpen=window.openConversation;
 if(typeof oldOpen==='function'&&!R.directPresence&&!window.__RIM_OPEN_CONVERSATION_OWNED&&typeof window.__RIM_MODULAR_OPEN_IMPL!=='function'){window.openConversation=async function(id){const result=await oldOpen.apply(this,arguments);
  // Modular open path already paints peer status via resolveChatHeader + afterOpen.
  if(window.__RIM_TYPING_PRESENCE_OWNED||window.__RIM_CONVERSATION_SHELL_OWNED)return result;
  try{
   const c=chats().find(x=>String(x.id)===String(id));if(!c||c.type!=='direct')return result;
   const d=getDb(),u=user();if(!d||!u)return result;
   const {data:members,error}=await d.from('conversation_members').select('user_id').eq('conversation_id',id).neq('user_id',u.id);
   if(error||!members?.length)return result;
   const other=members[0].user_id;const {data:p,error:pe}=await d.from('profiles').select('last_seen_at').eq('id',other).maybeSingle();
   const status=$('chatHeadStatus');if(status&&!pe)status.textContent=p?.last_seen_at?'Был(а) в сети: '+fmt(p.last_seen_at):'Время последнего посещения неизвестно';
  }catch(e){console.debug('RIM last seen:',err(e));}return result;};R.directPresence=true;}


 // Ensure the chat menu calls the forwarding chooser even if a legacy handler is recreated.
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const label=(b.textContent||'').trim();if(label==='➦ Переслать'||label==='Переслать'){const m=b.getAttribute('onclick')?.match(/rimForward\('([^']+)'\)/);if(m){e.preventDefault();e.stopImmediatePropagation();window.closeModal?.();window.rimForwardChoose?.(m[1]);}}},true);

 // Channel settings: resolve the channel from the rendered channel page if global state was lost.
 const oldChannelSettings=window.rimOpenChannelSettings;
 if(typeof oldChannelSettings==='function'&&!R.channelSettings&&!window.__RIM_CHANNEL_SETTINGS_OWNED){window.rimOpenChannelSettings=async function(){let c=window.currentChannel; if(!c&&window.__rimCurrentChannelId){const {data}=await getDb().from('channels').select('*').eq('id',window.__rimCurrentChannelId).maybeSingle();c=data;}
   if(!c){const full=$('rimChannelFull');const id=full?.dataset?.channelId;if(id){const {data}=await getDb().from('channels').select('*').eq('id',id).maybeSingle();c=data;}}
   if(c){window.currentChannel=c;try{currentChannel=c}catch(_){} }
   if(!c)return say('Не удалось определить открытый канал. Закройте канал и откройте его снова.');
   return oldChannelSettings.apply(this,arguments);
  };R.channelSettings=true;}

 // Read receipt state and tick rendering are owned by src/application/read-receipt-controller.js.
 console.info('[RIM] stability layer loaded');
})();

