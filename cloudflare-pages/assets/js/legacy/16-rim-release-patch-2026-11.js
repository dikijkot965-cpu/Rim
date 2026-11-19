
/* RIM RELEASE PATCH — Favorites / Writer / local music / core reliability */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const notifyMsg=(m)=>{if(typeof window.notify==='function')window.notify(m);else if(typeof window.toast==='function')window.toast(m);else console.info('[RIM]',m)};
 const getDb=()=>window.db||((typeof db!=='undefined')?db:null);
 const getUser=()=>window.currentUser||((typeof currentUser!=='undefined')?currentUser:null);
 const state={docs:[],items:[],activeDoc:null,localTracks:[],activeTrack:null,dbReady:false,saveTimer:null};
 const CSS=`
 #rimFavoritesRow{border:1px solid rgba(201,164,93,.38);background:linear-gradient(110deg,rgba(201,164,93,.13),rgba(201,164,93,.035));}
 #rimFavoritesRow .avatar{background:linear-gradient(145deg,#8b6a2d,#d9bd79);color:#21180c}
 .rim-writer{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--bg,#17130e);color:var(--text,#f3e8d2)}
 .rim-writer-head{display:flex;gap:8px;align-items:center;padding:12px;border-bottom:1px solid var(--border,rgba(201,164,93,.25));flex-wrap:wrap}
 .rim-writer-head h2{font:700 19px 'Playfair Display',serif;margin:0;flex:1}
 .rim-writer-layout{display:grid;grid-template-columns:minmax(170px,240px) minmax(0,1fr);flex:1;min-height:0}
 .rim-writer-docs{overflow:auto;border-right:1px solid var(--border,rgba(201,164,93,.25));padding:10px}
 .rim-writer-doc{padding:10px;border-radius:10px;cursor:pointer;border:1px solid transparent;margin-bottom:6px;background:var(--panel,#211b13)}
 .rim-writer-doc.active{border-color:var(--gold,#c9a45d)}
 .rim-writer-main{display:flex;flex-direction:column;min-width:0;min-height:0;padding:12px;gap:10px}
 .rim-writer-title{width:100%;background:transparent;color:inherit;border:0;border-bottom:1px solid var(--border);font:700 22px 'Playfair Display',serif;padding:8px 2px;outline:none}
 .rim-writer-toolbar{display:flex;gap:5px;flex-wrap:wrap}
 .rim-writer-toolbar button{min-width:34px;padding:7px 9px;border:1px solid var(--border);border-radius:8px;background:var(--panel2,#2b2318);color:inherit}
 .rim-writer-area{flex:1;min-height:220px;overflow:auto;padding:18px;background:var(--panel,#211b13);border:1px solid var(--border);border-radius:12px;outline:none;line-height:1.72;font-size:16px;overflow-wrap:anywhere}
 .rim-writer-area:empty:before{content:'Начни писать…';color:var(--muted,#b7a78c)}
 .rim-writer-area h1,.rim-writer-area h2,.rim-writer-area h3{font-family:'Playfair Display',serif}
 .rim-writer-status{font-size:11px;color:var(--muted,#b7a78c);display:flex;justify-content:space-between;gap:8px}
 .rim-fav-workspace{height:100%;min-height:0;display:flex;flex-direction:column;overflow:auto;padding:14px;gap:12px}
 .rim-fav-card{padding:12px;border:1px solid var(--border);background:var(--panel);border-radius:12px}
 .rim-local-player{padding:13px;border:1px solid var(--border);background:var(--panel);border-radius:13px;margin:10px 0}
 .rim-local-track{display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid var(--border)}
 .rim-local-track button{flex:0 0 auto}
 @media(max-width:650px){.rim-writer-layout{grid-template-columns:1fr;grid-template-rows:minmax(100px,28%) minmax(0,1fr)}.rim-writer-docs{border-right:0;border-bottom:1px solid var(--border);display:flex;gap:6px}.rim-writer-doc{min-width:135px;margin:0}.rim-writer-main{padding:8px}.rim-writer-area{font-size:15px;padding:13px}}
 `;
 const style=document.createElement('style');style.id='rim-release-patch-style';style.textContent=CSS;document.head.appendChild(style);

 // Conversation ordering is owned by the modular ConversationStateController.

 // Reaction toggle: selecting the same emoji removes it; selecting another replaces it.
 if(window.__RIM_MESSAGE_COMMANDS_OWNED){/* modular owns react */}else window.reactToMessage=async function(messageId,emoji){
  const d=getDb(),u=getUser();if(!d||!u)return notifyMsg('Сначала войди в РИМ.');
  const {data:rows,error:readError}=await d.from('message_reactions').select('id,emoji').eq('message_id',messageId).eq('user_id',u.id);
  if(readError)return notifyMsg('Не удалось проверить реакцию: '+readError.message);
  const existing=rows||[];
  if(existing.some(x=>x.emoji===emoji)){
   const ids=existing.filter(x=>x.emoji===emoji).map(x=>x.id);
   const {error}=await d.from('message_reactions').delete().in('id',ids);
   if(error)return notifyMsg('Не удалось убрать реакцию: '+error.message);
  }else{
   if(existing.length){const {error}=await d.from('message_reactions').delete().in('id',existing.map(x=>x.id));if(error)return notifyMsg('Не удалось заменить реакцию: '+error.message);}
   const {error}=await d.from('message_reactions').insert({message_id:messageId,user_id:u.id,emoji});
   if(error)return notifyMsg('Не удалось поставить реакцию: '+error.message);
  }
  if(typeof window.loadMessages==='function')await window.loadMessages();
 };

 // Favorites virtual chat and writer workspace.
 function addFavoritesRow(){if(window.__RIM_FAVORITES_ROW_OWNED)return;
  const list=$('chatList');if(!list||$('rimFavoritesRow'))return;
  const row=document.createElement('div');row.id='rimFavoritesRow';row.className='chat-item';row.innerHTML='<div class="avatar">★</div><div class="chat-item-info"><div class="chat-item-name">Избранное</div><div class="chat-item-preview">Личные заметки и документы</div></div><span class="feature-small">✎</span>';
  row.addEventListener('click',openFavorites);list.prepend(row);
 }
 if(typeof window.renderConversationList==='function'&&!window.__rimFavoritesRenderer){
  const originalRender=window.renderConversationList;
  if(!window.__RIM_FAVORITES_ROW_OWNED){window.renderConversationList=function(){const out=originalRender.apply(this,arguments);addFavoritesRow();return out;};window.__rimFavoritesRenderer=true;}
 }
 async function fetchDocs(){
  const d=getDb(),u=getUser();if(!d||!u)return [];
  const {data,error}=await d.from('rim_writer_documents').select('id,title,content,folder,updated_at,created_at').eq('user_id',u.id).order('updated_at',{ascending:false}).limit(300);
  if(error){console.warn('RIM writer documents:',error.message);return null;}return data||[];
 }
 async function fetchItems(){
  const d=getDb(),u=getUser();if(!d||!u)return [];
  const {data,error}=await d.from('rim_favorite_items').select('id,item_type,title,body,metadata,created_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(300);
  if(error){console.warn('RIM favorites:',error.message);return null;}return data||[];
 }
 function renderFavorites(){
  const host=$('rimFavoriteItems');if(!host)return;
  if(state.items===null){host.innerHTML='<div class="notice">Не удалось загрузить избранное. Проверь SQL-миграцию.</div>';return;}
  host.innerHTML=state.items.map(x=>`<article class="rim-fav-card"><div class="row"><b class="grow">${esc(x.title||'Сохранённый материал')}</b><button class="action-btn danger-btn" onclick="rimDeleteFavorite('${x.id}')">Удалить</button></div><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:7px">${esc(x.body||'')}</div><div class="feature-small" style="margin-top:7px">${new Date(x.created_at).toLocaleString()}</div></article>`).join('')||'<div class="empty-state">Здесь будут твои сохранённые материалы.</div>';
 }
 window.rimAddFavorite=async function(){
  const d=getDb(),u=getUser();if(!d||!u)return notifyMsg('Войди в аккаунт.');
  const title=prompt('Название материала:','Заметка');if(title===null)return;
  const body=prompt('Текст или ссылка:','');if(body===null||!body.trim())return;
  const {error}=await d.from('rim_favorite_items').insert({user_id:u.id,item_type:/^https?:\/\//i.test(body.trim())?'link':'text',title:title.trim().slice(0,160),body:body.trim().slice(0,20000),metadata:{}});
  if(error)return notifyMsg('Не удалось сохранить: '+error.message);
  state.items=await fetchItems();renderFavorites();
 };
 window.rimDeleteFavorite=async function(id){const d=getDb(),u=getUser();if(!d||!u||!confirm('Удалить материал из избранного?'))return;const {error}=await d.from('rim_favorite_items').delete().eq('id',id).eq('user_id',u.id);if(error)return notifyMsg(error.message);state.items=await fetchItems();renderFavorites();};
 window.rimOpenWriter=async function(){
  const host=$('chatWindow');if(!host)return;
  host.classList.add('open','mobile-active');$('sidebar')?.classList.add('mobile-hidden');
  state.docs=await fetchDocs();state.activeDoc=state.docs?.[0]?.id||null;
  host.innerHTML=`<div class="rim-writer"><div class="rim-writer-head"><button class="icon-btn" onclick="openFavorites()">‹</button><h2>✒ Lite Writer</h2><button class="action-btn" onclick="rimNewDocument()">＋ Документ</button><button class="action-btn" onclick="rimSaveDocument()">Сохранить</button></div><div class="rim-writer-layout"><aside class="rim-writer-docs" id="rimWriterDocs"></aside><section class="rim-writer-main"><input id="rimWriterTitle" class="rim-writer-title" maxlength="160" placeholder="Название документа"><div class="rim-writer-toolbar"><button onclick="rimFormat('bold')"><b>B</b></button><button onclick="rimFormat('italic')"><i>I</i></button><button onclick="rimFormat('underline')"><u>U</u></button><button onclick="rimFormat('strikeThrough')"><s>S</s></button><button onclick="rimFormat('formatBlock','H1')">H1</button><button onclick="rimFormat('formatBlock','H2')">H2</button><button onclick="rimFormat('formatBlock','P')">¶</button><button onclick="rimFormat('insertUnorderedList')">• Список</button><button onclick="rimFormat('insertOrderedList')">1. Список</button><button onclick="rimFormat('formatBlock','BLOCKQUOTE')">❝</button><button onclick="rimInsertLink()">Ссылка</button><button onclick="rimFormat('removeFormat')">Очистить</button></div><div id="rimWriterArea" class="rim-writer-area" contenteditable="true" spellcheck="true"></div><div class="rim-writer-status"><span id="rimWriterSaveStatus">Автосохранение включено</span><span id="rimWriterCount">0 слов · 0 символов</span></div></section></div></div>`;
  renderWriterDocs();loadActiveDoc();
  $('rimWriterArea')?.addEventListener('input',()=>{updateWriterCount();scheduleWriterSave();});
  $('rimWriterTitle')?.addEventListener('input',scheduleWriterSave);
 };
 function renderWriterDocs(){const host=$('rimWriterDocs');if(!host)return;host.innerHTML=(state.docs||[]).map(x=>`<div class="rim-writer-doc ${x.id===state.activeDoc?'active':''}" onclick="rimSelectDocument('${x.id}')"><b>${esc(x.title||'Без названия')}</b><div class="feature-small">${new Date(x.updated_at||x.created_at).toLocaleDateString()}</div></div>`).join('')||'<div class="feature-small">Документов пока нет.</div>';}
 function cleanWriterHtml(input){const doc=new DOMParser().parseFromString(String(input||''),'text/html');const allowed=new Set(['P','DIV','BR','B','STRONG','I','EM','U','S','STRIKE','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','A','PRE','CODE']);const walk=node=>{[...node.childNodes].forEach(child=>{if(child.nodeType===1){if(!allowed.has(child.tagName)){child.replaceWith(...child.childNodes);return;}[...child.attributes].forEach(a=>{if(child.tagName==='A'&&a.name==='href'){try{const u=new URL(a.value);if(!['http:','https:'].includes(u.protocol))child.removeAttribute('href');else child.setAttribute('href',u.href);}catch(_){child.removeAttribute('href');}}else if(!(child.tagName==='A'&&a.name==='href'))child.removeAttribute(a.name);});walk(child);}else if(child.nodeType!==3)child.remove();});};walk(doc.body);return doc.body.innerHTML;}
 function loadActiveDoc(){const doc=(state.docs||[]).find(x=>x.id===state.activeDoc);if($('rimWriterTitle'))$('rimWriterTitle').value=doc?.title||'';if($('rimWriterArea'))$('rimWriterArea').innerHTML=cleanWriterHtml(doc?.content||'');updateWriterCount();}
 window.rimSelectDocument=function(id){if(state.saveTimer){clearTimeout(state.saveTimer);state.saveTimer=null;}state.activeDoc=id;renderWriterDocs();loadActiveDoc();};
 window.rimNewDocument=async function(){await saveDocNow();state.activeDoc=null;if($('rimWriterTitle'))$('rimWriterTitle').value='';if($('rimWriterArea'))$('rimWriterArea').innerHTML='';renderWriterDocs();updateWriterCount();$('rimWriterTitle')?.focus();};
 window.rimFormat=function(command,value=null){$('rimWriterArea')?.focus();document.execCommand(command,false,value);updateWriterCount();scheduleWriterSave();};
 window.rimInsertLink=function(){const url=prompt('Адрес ссылки (https://...)');if(!url)return;try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw 0;window.rimFormat('createLink',parsed.href);}catch(_){notifyMsg('Укажи корректную ссылку http:// или https://.');}};
 function updateWriterCount(){const t=$('rimWriterArea')?.innerText||'';const words=(t.trim().match(/\S+/g)||[]).length;const n=$('rimWriterCount');if(n)n.textContent=`${words} слов · ${t.length} символов`;}
 function scheduleWriterSave(){if(state.saveTimer)clearTimeout(state.saveTimer);const s=$('rimWriterSaveStatus');if(s)s.textContent='Изменения не сохранены…';state.saveTimer=setTimeout(()=>saveDocNow(),900);}
 async function saveDocNow(){const d=getDb(),u=getUser(),area=$('rimWriterArea'),title=$('rimWriterTitle');if(!area||!d||!u)return;const payload={user_id:u.id,title:(title?.value||'Без названия').trim().slice(0,160)||'Без названия',content:cleanWriterHtml(area.innerHTML).slice(0,1000000),folder:'Основное',updated_at:new Date().toISOString()};let result;if(state.activeDoc)result=await d.from('rim_writer_documents').update(payload).eq('id',state.activeDoc).eq('user_id',u.id).select('id,title,content,folder,updated_at,created_at').single();else result=await d.from('rim_writer_documents').insert(payload).select('id,title,content,folder,updated_at,created_at').single();if(result.error){const s=$('rimWriterSaveStatus');if(s)s.textContent='Не сохранено: '+result.error.message;return;}if(!state.activeDoc)state.activeDoc=result.data.id;const i=state.docs.findIndex(x=>x.id===result.data.id);if(i>=0)state.docs[i]=result.data;else state.docs.unshift(result.data);renderWriterDocs();const s=$('rimWriterSaveStatus');if(s)s.textContent='Сохранено '+new Date().toLocaleTimeString();}
 window.rimSaveDocument=saveDocNow;
 async function openFavorites(){
  const host=$('chatWindow');if(!host)return;if(state.originalChatMarkup===null)state.originalChatMarkup=host.innerHTML;
  state.items=await fetchItems();
  host.innerHTML=`<div class="rim-fav-workspace"><div class="chat-head" style="position:sticky;top:0"><button class="icon-btn" onclick="backToChats()">‹</button><div class="avatar">★</div><div class="chat-head-info"><div class="chat-head-name">Избранное</div><div class="chat-head-status">Личное пространство</div></div></div><div class="rim-fav-card"><h3 style="margin-top:0">Твои материалы</h3><p class="feature-small">Сохраняй заметки, ссылки и важные фрагменты. Данные синхронизируются через твой аккаунт РИМа.</p><div class="row" style="flex-wrap:wrap"><button class="primary-btn" onclick="rimAddFavorite()">＋ Добавить материал</button><button class="action-btn" onclick="rimOpenWriter()">✒ Открыть Lite Writer</button></div></div><div id="rimFavoriteItems"></div></div>`;
  renderFavorites();
 }
 window.openFavorites=openFavorites;
 const originalBack=window.backToChats;window.backToChats=function(){const host=$('chatWindow');if(host&&state.originalChatMarkup!==null){host.innerHTML=state.originalChatMarkup;state.originalChatMarkup=null;}if(typeof originalBack==='function')return originalBack.apply(this,arguments);};
 const originalOpenConversation=window.openConversation;window.openConversation=async function(){const host=$('chatWindow');if(host&&state.originalChatMarkup!==null){host.innerHTML=state.originalChatMarkup;state.originalChatMarkup=null;}if(typeof originalOpenConversation==='function')return originalOpenConversation.apply(this,arguments);};

 // Local music: browser-side library; files stay on this device (IndexedDB), no automatic Storage upload.
 const IDB='rim-local-audio-v1',STORE='tracks';
 function openAudioDb(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('IndexedDB недоступна'));const req=indexedDB.open(IDB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const st=db.createObjectStore(STORE,{keyPath:'id'});st.createIndex('title','title',{unique:false});}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async function audioTx(mode,fn){const d=await openAudioDb();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode),st=tx.objectStore(STORE);let value;try{value=fn(st);}catch(e){reject(e);return;}tx.oncomplete=()=>{d.close();resolve(value?.result??null);};tx.onerror=()=>{d.close();reject(tx.error);};});}
 async function getLocalTracks(){const d=await openAudioDb();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readonly'),r=tx.objectStore(STORE).getAll();r.onsuccess=()=>{d.close();resolve(r.result||[])};r.onerror=()=>{d.close();reject(r.error)};});}
 function injectLocalMusic(){const sec=$('musicSection');if(!sec||$('rimLocalMusic'))return;const legacy=sec.querySelector('#musicTitle')?.closest('.card');if(legacy)legacy.style.display='none';const panel=document.createElement('div');panel.id='rimLocalMusic';panel.className='rim-local-player';panel.innerHTML=`<div class="row"><div class="grow"><h3 style="margin:0">♫ Музыка на устройстве</h3><div class="feature-small">Локальная библиотека: аудио остаётся в хранилище браузера на этом устройстве.</div></div><label class="primary-btn" style="cursor:pointer">＋ Добавить файлы<input id="rimLocalAudioInput" type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.flac,.wav,.webm" multiple hidden></label></div><div id="rimLocalAudioNow" style="margin-top:10px"><audio id="rimLocalAudioPlayer" controls preload="metadata" style="width:100%"></audio></div><div id="rimLocalAudioList" style="margin-top:8px"></div>`;sec.prepend(panel);$('rimLocalAudioInput').addEventListener('change',importLocalAudio);renderLocalTracks();}
 async function importLocalAudio(ev){const files=[...(ev.target.files||[])];if(!files.length)return;try{if(navigator.storage?.persist)await navigator.storage.persist();for(const f of files){if(!f.type.startsWith('audio/')&&!/\.(mp3|m4a|aac|ogg|opus|flac|wav|webm)$/i.test(f.name))continue;const rec={id:crypto.randomUUID(),title:f.name.replace(/\.[^.]+$/,''),name:f.name,mime:f.type||'audio/mpeg',size:f.size,blob:f,added_at:new Date().toISOString()};await audioTx('readwrite',st=>st.put(rec));}notifyMsg('Файлы добавлены в локальную музыкальную библиотеку.');await renderLocalTracks();}catch(e){notifyMsg('Не удалось сохранить локальные аудиофайлы: '+e.message);}ev.target.value='';}
 async function playLocalTrack(id){try{const d=await openAudioDb();const rec=await new Promise((resolve,reject)=>{const r=d.transaction(STORE,'readonly').objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});d.close();if(!rec)return;const player=$('rimLocalAudioPlayer');if(!player)return;if(state.activeTrack?.url)URL.revokeObjectURL(state.activeTrack.url);const url=URL.createObjectURL(rec.blob);state.activeTrack={id,url};player.src=url;player.play().catch(()=>{});$('rimLocalAudioNow').querySelector('.feature-small')?.remove();}catch(e){notifyMsg('Не удалось открыть композицию: '+e.message);}}
 async function deleteLocalTrack(id){if(!confirm('Удалить файл из локальной библиотеки этого устройства?'))return;await audioTx('readwrite',st=>st.delete(id));if(state.activeTrack?.id===id){$('rimLocalAudioPlayer').pause();$('rimLocalAudioPlayer').removeAttribute('src');URL.revokeObjectURL(state.activeTrack.url);state.activeTrack=null;}await renderLocalTracks();}
 async function renderLocalTracks(){const host=$('rimLocalAudioList');if(!host)return;try{const tracks=await getLocalTracks();host.innerHTML=tracks.map(t=>`<div class="rim-local-track"><div class="grow"><b>${esc(t.title)}</b><div class="feature-small">${(t.size/1048576).toFixed(1)} МБ · локально</div></div><button class="action-btn" onclick="rimPlayLocalTrack('${t.id}')">▶</button><button class="action-btn danger-btn" onclick="rimDeleteLocalTrack('${t.id}')">×</button></div>`).join('')||'<div class="empty-state">Добавь аудиофайлы с устройства. Они не отправляются на сервер автоматически.</div>';}catch(e){host.innerHTML='<div class="notice">Локальная библиотека недоступна в этом браузере: '+esc(e.message)+'</div>';}}
 window.rimPlayLocalTrack=playLocalTrack;window.rimDeleteLocalTrack=deleteLocalTrack;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectLocalMusic,{once:true});else injectLocalMusic();
 const oldShow=window.showSection;if(typeof oldShow==='function'&&!window.__rimLocalMusicNav){window.showSection=function(name){const r=oldShow.apply(this,arguments);if(name==='music')injectLocalMusic();return r;};window.__rimLocalMusicNav=true;}

 // Add destination aliases for RIM and Telegram channels to the ad input UI.
 function enhanceAdDestination(){const input=$('rimAdUrl');if(!input||input.dataset.rimAliases)return;input.dataset.rimAliases='1';input.type='text';input.placeholder='https://site.ru или @канал / tg:@канал';input.title='Сайт: https://... · канал РИМа: @username · Telegram: tg:@username';const label=input.previousElementSibling;if(label&&label.classList.contains('field-label'))label.textContent='Ссылка или канал (сайт / @РИМ / tg:@Telegram)';}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceAdDestination,{once:true});else enhanceAdDestination();
 if('MutationObserver'in window){const adObserver=new MutationObserver(()=>enhanceAdDestination());adObserver.observe(document.body,{childList:true,subtree:true});}
 // Rewrite ad destination in existing banner click handler to resolve app/Telegram aliases safely.
 const originalRenderAd=window.rimRenderAdBanner;
 if(typeof originalRenderAd==='function'&&!window.__rimAdAliasRenderer){
  window.rimRenderAdBanner=async function(channelId){await originalRenderAd.apply(this,arguments);const a=document.querySelector('#rimChannelAdSlot a');if(!a)return;const raw=a.getAttribute('href')||'';if(/^tg:@[a-z0-9_]{3,32}$/i.test(raw)){a.href='https://t.me/'+raw.slice(4);a.target='_blank';a.rel='noopener noreferrer';}else if(/^rim:@[a-z0-9_]{3,24}$/i.test(raw)){const handle=raw.slice(4);a.href='#';a.addEventListener('click',async e=>{e.preventDefault();const d=getDb();const {data,error}=await d.from('channels').select('id').eq('username',handle).maybeSingle();if(error||!data)return notifyMsg('Канал РИМа не найден.');if(typeof window.openChannel==='function')window.openChannel(data.id);else notifyMsg('Канал найден, но навигация недоступна.');},{once:true});}}
  window.__rimAdAliasRenderer=true;
 }

 // Ephemeral typing indicator over Supabase Realtime Broadcast (no table or message spam).
 let typingRoom=null,typingChannel=null,typingStopTimer=null,lastTypingSent=0,typingBaseStatus='';
 const activeConv=()=>window.activeConversation||((typeof activeConversation!=='undefined')?activeConversation:null);
 const activeUid=()=>getUser()?.id;
 async function bindTyping(){
  const d=getDb(),conv=activeConv(),uid=activeUid();if(!d||!conv||!uid)return;
  if(typingChannel){try{await d.removeChannel(typingChannel)}catch(_){}typingChannel=null;}
  if(typingStopTimer){clearTimeout(typingStopTimer);typingStopTimer=null;}
  typingRoom=conv.id;
  const status=$('chatHeadStatus');typingBaseStatus=status?.textContent||'';
  // Private topic access is restricted by realtime.messages RLS to conversation members.
  try{await d.realtime?.setAuth?.()}catch(_){}
  typingChannel=d.channel('rim-typing-'+conv.id,{config:{private:true,broadcast:{self:false}}});
  typingChannel.on('broadcast',{event:'typing'},payload=>{
   const v=payload?.payload||{};if(typingRoom!==conv.id)return;
   const target=$('chatHeadStatus');if(!target)return;
   if(v.is_typing){target.textContent='Печатает…';if(typingStopTimer)clearTimeout(typingStopTimer);typingStopTimer=setTimeout(()=>{if(typingRoom===conv.id)target.textContent=typingBaseStatus;typingStopTimer=null;},2600);}
   else{if(typingStopTimer)clearTimeout(typingStopTimer);typingStopTimer=null;target.textContent=typingBaseStatus;}
  }).subscribe();
 }
 async function sendTyping(isTyping){
  if(!typingChannel||!activeUid())return;
  const now=Date.now();if(isTyping&&now-lastTypingSent<900)return;lastTypingSent=now;
  try{await typingChannel.send({type:'broadcast',event:'typing',payload:{is_typing:!!isTyping}})}catch(e){console.debug('RIM typing broadcast:',e?.message||e)}
 }
 const originalSubscribe=window.subscribeToMessages;
 if(typeof originalSubscribe==='function'&&!window.__rimTypingBound){
  window.subscribeToMessages=function(){const r=originalSubscribe.apply(this,arguments);bindTyping();return r;};window.__rimTypingBound=true;
 }
 const typingInput=$('messageInput');if(typingInput){typingInput.addEventListener('input',()=>{const value=typingInput.value.trim();if(value){sendTyping(true);if(typingStopTimer)clearTimeout(typingStopTimer);typingStopTimer=setTimeout(()=>sendTyping(false),1800);}else sendTyping(false);});typingInput.addEventListener('blur',()=>sendTyping(false));}

 // Keep controls above seasonal decorative layers.
 const layer=document.getElementById('rimHalloweenOrnaments');if(layer){layer.style.pointerEvents='none';layer.style.zIndex='0';}
 document.documentElement.classList.add('rim-release-patch-loaded');
 console.info('RIM release patch initialized');
})();

