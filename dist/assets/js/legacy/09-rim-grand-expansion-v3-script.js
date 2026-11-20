
(()=>{
 'use strict';
 const THEME_KEY='rim_halloween_imperial_extras_v3';
 let activeTopicId=null, activeTopicTitle='Все сообщения', topicsCache=[];
 window.rimGetActiveTopicId=()=>activeTopicId;
 const $=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const oldSend=window.sendMessage;
 const oldSendImage=window.sendImage;
 const oldLoadMessages=window.loadMessages;
 const oldOpenSettings=window.openSettings;

 function seasonalPrefs(){try{return JSON.parse(localStorage.getItem(THEME_KEY)||'{}')}catch(_){return {}}}
 function saveSeasonalPrefs(v){localStorage.setItem(THEME_KEY,JSON.stringify({...seasonalPrefs(),...v}));}
 function ensureSeasonalLayer(){
  if(!$('rimSeasonalLayer')){const layer=document.createElement('div');layer.id='rimSeasonalLayer';layer.innerHTML='<span class="rim-bat">🦇</span><span class="rim-bat">🦇</span><span class="rim-bat">🦇</span>';document.body.appendChild(layer)}
  if(!$('rimSeasonalVignette')){const v=document.createElement('div');v.id='rimSeasonalVignette';v.className='rim-seasonal-vignette';document.body.appendChild(v)}
 }
 function applySeasonalPrefs(){
  ensureSeasonalLayer();const p=seasonalPrefs();
  document.body.classList.toggle('rim-seasonal-effects',!!p.bats&&String(window.currentTheme||'') .includes('halloween'));
  const v=$('rimSeasonalVignette');if(v)v.style.display=p.vignette&&String(typeof currentTheme!=='undefined'?currentTheme:'').includes('halloween')?'block':'none';
  document.documentElement.style.setProperty('--rim-halloween-glow',p.glow===false?'transparent':'rgba(210,116,35,.18)');
 }
 window.rimHalloweenExtras=function(){
  const p=seasonalPrefs();
  if(typeof window.showModal!=='function')return;
  showModal(`<h2 class="modal-title">🎃⚜ Императорская ночь</h2>
   <p class="muted">Дополнительное оформление сезонной темы. Параметры сохраняются на этом устройстве.</p>
   <div class="rim-halloween-control"><b>🦇 Летучие мыши</b><p class="muted">Ненавязчивая анимация на фоне.</p><label><input id="rimBatToggle" type="checkbox" ${p.bats?'checked':''}> Включить</label></div>
   <div class="rim-halloween-control"><b>🌒 Затемнение по краям</b><p class="muted">Кинематографическая виньетка.</p><label><input id="rimVignetteToggle" type="checkbox" ${p.vignette?'checked':''}> Включить</label></div>
   <div class="rim-halloween-control"><b>🕯 Тёплое свечение</b><p class="muted">Мягкий золотисто-оранжевый акцент.</p><label><input id="rimGlowToggle" type="checkbox" ${p.glow!==false?'checked':''}> Включить</label></div>
   <div class="rim-halloween-control"><b>🛡 Имперские украшения</b><p class="muted">Геральдические рамки, медно-золотые акценты и тёмно-фиолетовая палитра включаются автоматически в имперской хэллоуинской теме.</p></div>
   <div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button><button class="primary-btn" onclick="rimSaveHalloweenExtras()">Сохранить</button></div>`);
 };
 window.rimSaveHalloweenExtras=function(){
  saveSeasonalPrefs({bats:$('rimBatToggle')?.checked||false,vignette:$('rimVignetteToggle')?.checked||false,glow:$('rimGlowToggle')?.checked!==false});
  applySeasonalPrefs();closeModal();toast('Оформление императорской ночи сохранено.');
 };

 // Extend settings without replacing the existing settings workflow.
 if(typeof oldOpenSettings==='function'){
  if(window.__RIM_SETTINGS_SHELL_OWNED){/* modular owns settings */}else window.openSettings=function(){const r=oldOpenSettings.apply(this,arguments);setTimeout(()=>{
   const modal=document.querySelector('#modalRoot .modal');if(!modal||modal.querySelector('#rimHalloweenExtrasButton'))return;
   const section=document.createElement('div');section.className='rim-halloween-control';section.innerHTML='<b>🎃⚜ Сезонное оформление</b><p class="muted">Настройте детали императорской хэллоуинской темы.</p><button id="rimHalloweenExtrasButton" class="action-btn" style="width:100%" onclick="rimHalloweenExtras()">Открыть настройки хэллоуинской темы</button>';
   modal.appendChild(section);
  },0);return r;};
 }
 const prevApply=window.applyTheme;
 if(typeof prevApply==='function')window.applyTheme=function(){const r=prevApply.apply(this,arguments);applySeasonalPrefs();return r;};

 function ensureTopicToolbar(){
  const composer=document.querySelector('.composer');if(!composer)return;if(!activeConversation||activeConversation.type!=='group'){$('rimTopicToolbar')?.remove();return;}if($('rimTopicToolbar'))return;
  const bar=document.createElement('div');bar.id='rimTopicToolbar';bar.className='rim-topic-toolbar';
  bar.innerHTML='<span id="rimTopicCurrent" class="rim-topic-current">Тема: Все сообщения</span><button class="action-btn" onclick="rimOpenTopics()">▤ Темы</button><button class="action-btn" onclick="rimClearTopic()" title="Показать все сообщения">Все</button>';
  composer.parentElement.insertBefore(bar,composer);
 }
 window.rimClearTopic=function(){activeTopicId=null;activeTopicTitle='Все сообщения';updateTopicLabel();if(activeConversation)loadMessages();};
 function updateTopicLabel(){const e=$('rimTopicCurrent');if(e)e.textContent='Тема: '+activeTopicTitle;}
 window.rimOpenTopics=async function(){
  if(typeof currentUser==='undefined'||!activeConversation)return toast('Сначала откройте беседу.');
  const {data,error}=await db.from('chat_topics').select('*').eq('conversation_id',activeConversation.id).order('sort_order').order('created_at');
  if(error)return toast('Не удалось загрузить темы: '+error.message);
  topicsCache=data||[];
  const rows=topicsCache.map(t=>`<div class="rim-topic-item ${activeTopicId===t.id?'active':''}"><div><b>${safe(t.icon)} ${safe(t.title)}</b><div class="muted">${t.is_closed?'Закрыта':'Открыта'}</div></div><button class="action-btn" onclick="rimSelectTopic('${t.id}')">Открыть</button></div>`).join('');
  showModal(`<h2 class="modal-title">▤ Темы беседы</h2><p class="muted">Разделяйте обсуждения одной группы на отдельные темы.</p><div>${rows||'<div class="empty-state">Тем пока нет.</div>'}</div><label class="field-label">Название новой темы</label><input id="rimNewTopicTitle" class="field" maxlength="80" placeholder="Например, Объявления"><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button><button class="primary-btn" onclick="rimCreateTopic()">Создать тему</button></div>`);
 };
 window.rimCreateTopic=async function(){
  const title=$('rimNewTopicTitle')?.value.trim();if(!title)return toast('Введите название темы.');
  const {data,error}=await db.from('chat_topics').insert({conversation_id:activeConversation.id,title,created_by:currentUser.id}).select().single();
  if(error)return toast('Не удалось создать тему: '+error.message);
  activeTopicId=data.id;activeTopicTitle=data.title;updateTopicLabel();closeModal();toast('Тема создана.');await loadMessages();
 };
 window.rimSelectTopic=function(id){const t=topicsCache.find(x=>x.id===id);if(!t)return;activeTopicId=t.id;activeTopicTitle=t.title;updateTopicLabel();closeModal();loadMessages();};

 if(typeof oldSend==='function'&&!window.__RIM_MESSAGE_COMMANDS_OWNED)window.sendMessage=async function(){
  if(!activeTopicId)return oldSend.apply(this,arguments);
  if(!activeConversation||!currentUser)return toast('Сначала выберите беседу.');
  const input=$('messageInput'),body=input?.value.trim();if(!body)return;
  const payload={conversation_id:activeConversation.id,sender_id:currentUser.id,body,reply_to_message_id:replyTarget?.id||null,topic_id:activeTopicId};
  const {error}=await db.from('chat_messages').insert(payload);if(error)return toast('Ошибка отправки: '+error.message);
  input.value='';input.style.height='42px';if(typeof cancelReply==='function')cancelReply();$('stickerPanel')?.classList.add('hidden');await loadMessages();
 };
 if(typeof oldSendImage==='function')window.sendImage=async function(file){
  if(!activeTopicId)return oldSendImage.apply(this,arguments);
  if(!file)return;if(!activeConversation||!currentUser)return toast('Сначала выберите беседу.');
  if(file.size>5*1024*1024)return toast('Максимальный размер фотографии — 5 МБ.');
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))return toast('Поддерживаются JPG, PNG, WEBP и GIF.');
  const ext=file.name.split('.').pop().toLowerCase(),path=currentUser.id+'/'+activeConversation.id+'/'+crypto.randomUUID()+'.'+ext;
  const {error:up}=await db.storage.from('chat-files').upload(path,file,{contentType:file.type,upsert:false});if(up)return toast('Ошибка загрузки: '+up.message);
  const {error}=await db.from('chat_messages').insert({conversation_id:activeConversation.id,sender_id:currentUser.id,body:'',image_path:path,reply_to_message_id:replyTarget?.id||null,topic_id:activeTopicId});
  if(error)return toast('Файл загружен, но сообщение не отправлено: '+error.message);
  cancelReply();$('imageInput').value='';await loadMessages();
 };
 if(typeof oldLoadMessages==='function')window.loadMessages=async function(){
  if(!activeTopicId)return oldLoadMessages.apply(this,arguments);
  if(!activeConversation)return;
  const box=$('messages');if(!box)return;
  box.innerHTML='<div class="loading">Загрузка сообщений темы...</div>';
  const {data,error}=await db.from('chat_messages').select('*').eq('conversation_id',activeConversation.id).eq('topic_id',activeTopicId).order('created_at',{ascending:true}).limit(50);
  if(error){box.innerHTML='<div class="notice">Не удалось загрузить тему: '+safe(error.message)+'</div>';return;}
  messagesCache=data||[];await renderMessages();
 };

 // Reset the selected topic when moving to another conversation.
 const previousOpenConversation=window.openConversation;
 if(typeof previousOpenConversation==='function')window.openConversation=async function(id){activeTopicId=null;activeTopicTitle='Все сообщения';updateTopicLabel();return previousOpenConversation.apply(this,arguments);};

 // Topics selector appears only inside an open conversation.
 const obs=new MutationObserver(()=>{ensureTopicToolbar();applySeasonalPrefs();});
 if(document.body)obs.observe(document.body,{childList:true,subtree:true});
 document.addEventListener('DOMContentLoaded',()=>{ensureSeasonalLayer();ensureTopicToolbar();applySeasonalPrefs();});
 ensureSeasonalLayer();ensureTopicToolbar();applySeasonalPrefs();
})();
