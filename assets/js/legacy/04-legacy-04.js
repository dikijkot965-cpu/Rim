
/* =========================================================
   IMPERIAL MESSENGER — WELCOME + LOCAL PRODUCTIVITY SUITE
   Existing Supabase-backed features above remain untouched.
   This layer adds reliable local tools without pretending that
   local browser data is synced to the server or other devices.
========================================================= */
(function(){
 'use strict';
 const STORE='imperial_local_suite_v1';
 const WELCOME='imperial_welcome_seen_v2';
 const HALLOWEEN='imperial_halloween_offer_seen_v1';
 const $=id=>document.getElementById(id);
 const uid=()=>currentUser?.id||'guest';
 const read=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(_){return {}}};
 const write=o=>localStorage.setItem(STORE,JSON.stringify(o));
 const state=()=>{const a=read();a[uid()]??={friends:[],follows:[],posts:[],statuses:[],events:[],polls:[],drafts:{},folders:[],favorites:[],warnings:[],appeals:[]};return a};
 const save=a=>write(a);
 const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stamp=()=>new Date().toISOString();
 const localNotice=(title,body)=>showModal(`<h2 class="modal-title">${esc2(title)}</h2><p>${esc2(body)}</p><button class="primary-btn" style="width:100%" onclick="closeModal()">Понятно</button>`);
 function inject(){
  if($('imperialLocalSuiteStyles'))return;
  const st=document.createElement('style');st.id='imperialLocalSuiteStyles';st.textContent=`
  .ils-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
  .ils-card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:12px;color:var(--text);text-align:left;min-height:68px}
  .ils-card b{display:block;color:var(--gold2);margin-bottom:5px}.ils-card small{color:var(--muted)}
  .ils-list{display:flex;flex-direction:column;gap:8px;margin:10px 0;max-height:52vh;overflow:auto}
  .ils-item{padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--panel2);overflow-wrap:anywhere}
  .ils-field{width:100%;padding:11px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text);margin:5px 0 9px}
  .ils-row{display:flex;gap:7px;flex-wrap:wrap}.ils-row button{flex:1}
  .ils-muted{font-size:11px;color:var(--muted);line-height:1.45}
  .ils-tag{display:inline-block;border:1px solid var(--border);border-radius:20px;padding:3px 8px;font-size:10px;margin:2px;color:var(--muted)}
  .ils-hero{width:100%;max-height:190px;object-fit:cover;border-radius:10px;margin:8px 0}
  `;document.head.appendChild(st);
 }
 function openSuite(){
  inject();
  showModal(`<h2 class="modal-title">⚜ Инструменты РИМ</h2><p class="ils-muted">Дополнительные инструменты. Локальные разделы хранят данные только в этом браузере и на этом устройстве, пока не подключены к серверу.</p>
  <div class="ils-grid">
   <button class="ils-card" onclick="ilsOpen('friends')"><b>👥 Друзья и подписки</b><small>Список контактов и отслеживаемых</small></button>
   <button class="ils-card" onclick="ilsOpen('feed')"><b>📰 Лента публикаций</b><small>Локальные записи и реакции</small></button>
   <button class="ils-card" onclick="ilsOpen('status')"><b>🟢 Статусы</b><small>Личные заметки о состоянии</small></button>
   <button class="ils-card" onclick="ilsOpen('events')"><b>🗓 Календарь</b><small>События и даты сообщества</small></button>
   <button class="ils-card" onclick="ilsOpen('polls')"><b>📊 Опросы</b><small>Создание и голосование на устройстве</small></button>
   <button class="ils-card" onclick="ilsOpen('drafts')"><b>📝 Черновики</b><small>Сохранённые тексты</small></button>
   <button class="ils-card" onclick="ilsOpen('folders')"><b>🗂 Папки чатов</b><small>Личные списки и архив</small></button>
   <button class="ils-card" onclick="ilsOpen('search')"><b>🔎 Поиск</b><small>Поиск по загруженным сообщениям</small></button>
   <button class="ils-card" onclick="ilsOpen('export')"><b>📦 Экспорт данных</b><small>Резервная копия локальных данных</small></button>
   <button class="ils-card" onclick="ilsOpen('system')"><b>⚙ Состояние системы</b><small>Подключение и возможности</small></button>
   <button class="ils-card" onclick="ilsOpen('server')"><b>🛡 Серверные функции</b><small>Что требует дополнительной настройки</small></button>
  </div><button class="primary-btn" style="width:100%" onclick="closeModal()">Закрыть</button>`);
 }
 function data(){return state()[uid()]}
 function persist(mutator){const all=state(),d=all[uid()];mutator(d);save(all)}
 function list(items,empty){return `<div class="ils-list">${items.length?items.map(x=>`<div class="ils-item">${x}</div>`).join(''):`<div class="empty-state">${empty}</div>`}</div>`}
 function back(title,body){showModal(`<h2 class="modal-title">${title}</h2>${body}<button class="action-btn" style="width:100%;margin-top:8px" onclick="ilsOpen('home')">← К инструментам</button>`)}
 window.ilsOpen=function(which){
  inject();const d=data();
  if(which==='home')return openSuite();
  if(which==='friends')return back('👥 Друзья и подписки',`<p class="ils-muted">Это персональный список на устройстве, не отправляет запросы другим аккаунтам.</p><input id="ilsFriend" class="ils-field" placeholder="Имя или @username"><div class="ils-row"><button class="primary-btn" onclick="ilsAdd('friends','ilsFriend')">Добавить друга</button><button class="action-btn" onclick="ilsAdd('follows','ilsFriend')">Подписаться</button></div>${list(d.friends.map(x=>`👤 ${esc2(x)}`),'Список друзей пуст.')}${list(d.follows.map(x=>`➕ ${esc2(x)}`),'Подписок пока нет.')}`);
  if(which==='feed')return back('📰 Локальная лента',`<textarea id="ilsPost" class="ils-field" rows="3" placeholder="Напишите публикацию..."></textarea><button class="primary-btn" style="width:100%" onclick="ilsCreate('posts','ilsPost')">Опубликовать локально</button>${list(d.posts.slice().reverse().map(x=>`<b>${esc2(x.author)}</b><div>${esc2(x.text)}</div><small class="ils-muted">${new Date(x.at).toLocaleString()}</small><div class="ils-row"><button class="action-btn" onclick="ilsLike('${x.id}')">♡ ${x.likes||0}</button><button class="action-btn" onclick="ilsDelete('posts','${x.id}')">Удалить</button></div>`),'Публикаций пока нет.')}`);
  if(which==='status')return back('🟢 Мой статус',`<input id="ilsStatus" class="ils-field" maxlength="120" placeholder="Короткий статус"><button class="primary-btn" style="width:100%" onclick="ilsCreate('statuses','ilsStatus')">Сохранить статус</button>${list(d.statuses.slice().reverse().map(x=>`${esc2(x.text)}<div class="ils-muted">${new Date(x.at).toLocaleString()}</div>`),'Статус ещё не установлен.')}`);
  if(which==='events')return back('🗓 Календарь сообщества',`<input id="ilsEventName" class="ils-field" placeholder="Название события"><input id="ilsEventDate" type="datetime-local" class="ils-field"><textarea id="ilsEventDesc" class="ils-field" placeholder="Описание"></textarea><button class="primary-btn" style="width:100%" onclick="ilsEvent()">Добавить событие</button>${list(d.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(x=>`<b>${esc2(x.name)}</b><div>${esc2(x.date)}</div><div>${esc2(x.desc)}</div>`),'Событий пока нет.')}`);
  if(which==='polls')return back('📊 Опросы',`<input id="ilsPollQ" class="ils-field" placeholder="Вопрос опроса"><textarea id="ilsPollOpts" class="ils-field" placeholder="Варианты — каждый с новой строки"></textarea><button class="primary-btn" style="width:100%" onclick="ilsPoll()">Создать опрос</button>${list(d.polls.slice().reverse().map(x=>`<b>${esc2(x.q)}</b>${x.opts.map((o,i)=>`<button class="action-btn" style="width:100%;margin:3px 0;text-align:left" onclick="ilsVote('${x.id}',${i})">${esc2(o)} — ${x.votes[i]||0}</button>`).join('')}`),'Опросов пока нет.')}`);
  if(which==='drafts')return back('📝 Черновики',`<input id="ilsDraftName" class="ils-field" placeholder="Название черновика"><textarea id="ilsDraftText" class="ils-field" rows="5" placeholder="Текст..."></textarea><button class="primary-btn" style="width:100%" onclick="ilsSaveDraft()">Сохранить</button>${list(Object.entries(d.drafts).map(([k,v])=>`<b>${esc2(k)}</b><div>${esc2(v)}</div><button class="action-btn" onclick="ilsLoadDraft('${encodeURIComponent(k)}')">Открыть</button><button class="action-btn" onclick="ilsDeleteDraft('${encodeURIComponent(k)}')">Удалить</button>`),'Черновиков нет.')}`);
  if(which==='folders')return back('🗂 Папки и архив',`<p class="ils-muted">Создавайте личные папки-метки. Они не перемещают серверные переписки и не скрывают чаты от других устройств.</p><input id="ilsFolder" class="ils-field" placeholder="Название папки"><button class="primary-btn" style="width:100%" onclick="ilsCreate('folders','ilsFolder')">Создать папку</button>${list(d.folders.map(x=>`📁 ${esc2(x.text)}`),'Папок нет.')}`);
  if(which==='favorites')return back('⭐ Избранное',`<textarea id="ilsFav" class="ils-field" placeholder="Сохранить заметку или текст"></textarea><button class="primary-btn" style="width:100%" onclick="ilsCreate('favorites','ilsFav')">Сохранить</button>${list(d.favorites.slice().reverse().map(x=>`${esc2(x.text)}<div class="ils-muted">${new Date(x.at).toLocaleString()}</div>`),'Избранное пусто.')}`);
  if(which==='search')return back('🔎 Поиск по сообщениям',`<input id="ilsSearch" class="ils-field" placeholder="Введите фразу"><button class="primary-btn" style="width:100%" onclick="ilsSearch()">Искать</button><div id="ilsSearchResults" class="ils-list"></div><p class="ils-muted">Ищет только сообщения, уже загруженные в текущую переписку, и локальные публикации/черновики.</p>`);
  if(which==='export')return back('📦 Экспорт локальных данных',`<p>Создайте JSON-копию локальных инструментов. Это не экспортирует серверные сообщения, фотографии или учётную запись.</p><button class="primary-btn" style="width:100%" onclick="ilsExport()">Скачать резервную копию</button><label class="action-btn" style="display:block;text-align:center;margin-top:8px">Импортировать копию<input type="file" accept="application/json" hidden onchange="ilsImport(this.files[0])"></label>`);
  if(which==='system')return back('⚙ Состояние системы',`<div class="ils-item">Аккаунт: ${currentUser?'авторизован':'не авторизован'}</div><div class="ils-item">Интернет: ${navigator.onLine?'браузер сообщает о подключении':'нет подключения'}</div><div class="ils-item">Supabase: ${esc2(SUPABASE_URL)}</div><div class="ils-item">Локальные данные: ${new Blob([JSON.stringify(d)]).size} байт</div><p class="ils-muted">Статус сети браузера не гарантирует доступность сервера. Реальное состояние Supabase проверяется запросом.</p><button class="action-btn" style="width:100%" onclick="ilsCheckServer()">Проверить Supabase</button>`);
  if(which==='server')return back('🛡 Серверные функции',`<div class="ils-item"><b>Требуют отдельной серверной реализации</b><br>Запланированные публикации и автоматическая отправка; push-уведомления; отзыв конкретных сессий; надёжный антиспам и лимиты; серверная статистика; полноценная модерация с журналом действий и апелляциями; синхронизация папок, черновиков и настроек между устройствами; голосовые сообщения с хранением и воспроизведением.</div><div class="ils-item"><b>Требуют таблиц и RLS-политик</b><br>Друзья/подписки, лента, статусы, события, опросы, история редактирования, избранное, папки, архив и поиск по всей истории.</div><p class="ils-muted">Не добавляю секретный service_role-ключ в браузер. Такие функции нужно выполнять через защищённые серверные функции.</p>`);
 };
 window.ilsAdd=(kind,id)=>{const v=$(id)?.value.trim();if(!v)return toast('Введите имя или username.');persist(d=>{if(!d[kind].includes(v))d[kind].push(v)});ilsOpen('friends');};
 window.ilsCreate=(kind,id)=>{const v=$(id)?.value.trim();if(!v)return toast('Поле не должно быть пустым.');persist(d=>d[kind].push({id:crypto.randomUUID(),text:v,at:stamp(),author:currentProfile?.display_name||currentProfile?.username||'Я',likes:0}));ilsOpen(kind==='posts'?'feed':kind==='statuses'?'status':kind==='folders'?'folders':'favorites');};
 window.ilsDelete=(kind,id)=>{persist(d=>d[kind]=d[kind].filter(x=>x.id!==id));ilsOpen(kind==='posts'?'feed':'favorites')};
 window.ilsLike=id=>{persist(d=>{const x=d.posts.find(p=>p.id===id);if(x)x.likes=(x.likes||0)+1});ilsOpen('feed')};
 window.ilsEvent=()=>{const name=$('ilsEventName').value.trim(),date=$('ilsEventDate').value,desc=$('ilsEventDesc').value.trim();if(!name||!date)return toast('Укажите название и дату.');persist(d=>d.events.push({id:crypto.randomUUID(),name,date,desc}));ilsOpen('events')};
 window.ilsPoll=()=>{const q=$('ilsPollQ').value.trim(),opts=$('ilsPollOpts').value.split('\n').map(x=>x.trim()).filter(Boolean);if(!q||opts.length<2)return toast('Нужен вопрос и минимум два варианта.');persist(d=>d.polls.push({id:crypto.randomUUID(),q,opts,votes:opts.map(()=>0),voted:false}));ilsOpen('polls')};
 window.ilsVote=(id,i)=>{persist(d=>{const p=d.polls.find(x=>x.id===id);if(!p||p.voted)return toast('Голос уже учтён на этом устройстве.');p.votes[i]++;p.voted=true});ilsOpen('polls')};
 window.ilsSaveDraft=()=>{const n=$('ilsDraftName').value.trim(),v=$('ilsDraftText').value;if(!n||!v.trim())return toast('Заполните название и текст.');persist(d=>d.drafts[n]=v);ilsOpen('drafts')};
 window.ilsLoadDraft=k=>{const name=decodeURIComponent(k),v=data().drafts[name]||'';showModal(`<h2 class="modal-title">${esc2(name)}</h2><textarea id="ilsDraftEdit" class="ils-field" rows="8">${esc2(v)}</textarea><button class="primary-btn" style="width:100%" onclick="ilsUpdateDraft('${encodeURIComponent(name)}')">Сохранить изменения</button>`)};
 window.ilsUpdateDraft=k=>{const n=decodeURIComponent(k);persist(d=>d.drafts[n]=$('ilsDraftEdit').value);ilsOpen('drafts')};
 window.ilsDeleteDraft=k=>{const n=decodeURIComponent(k);persist(d=>delete d.drafts[n]);ilsOpen('drafts')};
 window.ilsSearch=()=>{const q=$('ilsSearch').value.trim().toLowerCase(),r=$('ilsSearchResults');if(!q)return;r.innerHTML='';const hits=(messagesCache||[]).filter(m=>(m.body||'').toLowerCase().includes(q));const local=[...data().posts,...data().favorites].filter(x=>(x.text||'').toLowerCase().includes(q));const html=[...hits.map(m=>`<div class="ils-item">${esc2(m.body||'')}</div>`),...local.map(x=>`<div class="ils-item">${esc2(x.text)}</div>`)];r.innerHTML=html.join('')||'<div class="empty-state">Совпадений не найдено.</div>'};
 window.ilsExport=()=>{const blob=new Blob([JSON.stringify({version:1,exported_at:stamp(),data:data()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='imperial-messenger-local-backup.json';a.click();URL.revokeObjectURL(url)};
 window.ilsImport=file=>{if(!file)return;const fr=new FileReader();fr.onload=()=>{try{const obj=JSON.parse(fr.result);if(!obj.data||typeof obj.data!=='object')throw Error('Неверный формат');persist(d=>Object.assign(d,obj.data));toast('Локальная копия импортирована.');ilsOpen('home')}catch(e){toast('Не удалось импортировать: '+e.message)}};fr.readAsText(file)};
 window.ilsCheckServer=async()=>{try{const {error}=await db.from('profiles').select('id').limit(1);if(error)throw error;toast('Supabase отвечает на запрос.')}catch(e){toast('Проверка не пройдена: '+(e.message||'ошибка'))}};
 // New welcome: shown once per account. Exact selected art files are expected in /assets; no substitute artwork is used.
 function showWelcome(){
  if(!currentUser)return;
  const key=WELCOME+'_'+currentUser.id;if(localStorage.getItem(key))return;
  localStorage.setItem(key,'1');
  const letter='/assets/imperial-welcome-letter.jpg';
  showModal(`<h2 class="modal-title">Добро пожаловать!</h2><img class="ils-hero" src="${letter}" alt="Старинное императорское письмо с сургучной печатью" onerror="this.style.display='none'"><p>Добро пожаловать в Русский Императорский Мессенджер!</p><p>Прежде чем вы начнёте, — пара важных слов о проекте.</p><p>Мессенджер создаётся и развивается одним человеком. Часть функций ещё в работе, поэтому возможны ошибки и временные неудобства.</p><p>Если вы нашли ошибку, столкнулись с проблемой или хотите оставить отзыв — напишите мне:</p><p>· В РИМ: <a href="#" style="color:var(--gold2);font-weight:bold" onclick="event.preventDefault();closeModal();findUserByName('imperator')">@imperator</a><br>· В Telegram: <a href="https://t.me/CatsZlo" target="_blank" rel="noopener" style="color:var(--gold2);font-weight:bold">@CatsZlo</a></p><p>Буду благодарен за сообщения об ошибках, предложения по улучшению и конструктивную обратную связь.</p><p>Желаю вам приятного общения!</p><button class="primary-btn" style="width:100%" onclick="closeModal();ilsAfterWelcome()">Продолжить</button>`);
 }
 window.ilsAfterWelcome=()=>{if(!localStorage.getItem(HALLOWEEN)){localStorage.setItem(HALLOWEEN,'1');showModal(`<h2 class="modal-title">🎃 Особая тема к Хэллоуину</h2><img class="ils-hero" src="/assets/halloween-castle.jpg" alt="Замок с привидениями ночью" onerror="this.style.display='none'"><p>Попробуйте специальное оформление мессенджера к Хэллоуину.</p><div class="ils-row"><button class="action-btn" onclick="closeModal()">Позже</button><button class="primary-btn" onclick="changeTheme('halloween');closeModal()">Включить тему</button></div>`)} };
 const priorInit=window.initializeApp;
 // Function declarations are global lexical bindings in this page; wrap the existing initializer after it is defined.
 if(typeof initializeApp==='function'&&!window.__ilsInitWrapped){
  window.__ilsInitWrapped=true;const old=initializeApp;
  initializeApp=async function(){await old();if(currentUser){inject();setTimeout(showWelcome,350)}};
 }
 document.addEventListener('DOMContentLoaded',()=>{inject();if(document.querySelector('.tabbar')&&!$('tabLocalSuite')){const b=document.createElement('button');b.className='action-btn';b.id='tabLocalSuite';b.textContent='Инструменты';b.onclick=openSuite;document.querySelector('.tabbar').appendChild(b)}setTimeout(()=>{if(currentUser)showWelcome()},2200)});
 window.addEventListener('online',()=>{const el=$('chatHeadStatus');if(el)el.textContent='На связи'});
 window.addEventListener('offline',()=>{const el=$('chatHeadStatus');if(el)el.textContent='Нет сети'});
})();
