
/* =====================================================
   SUPABASE
===================================================== */

const SUPABASE_URL = "https://xxvcsaomkyknudoaixbs.supabase.co";
const SUPABASE_KEY = "sb_publishable_8uEQ0o-7uF66sPZi8EVp5g_SDHXXJx0";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
 auth: {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storage: window.localStorage,
  flowType: 'pkce'
 }
});

let currentUser = null;
let currentProfile = null;
let conversations = [];
let activeConversation = null;
let messagesCache = [];
let replyTarget = null;
let realtimeChannel = null;
let reactionChannel = null;
let currentSection = "chats";
let currentTheme = "imperial";
let currentLanguage = "ru";
let currentChannel = null;
let initializing = false;

const translations = {
 ru:{
  chats:"Чаты",channels:"Каналы",music:"Музыка",
  search:"Поиск...",message:"Сообщение...",
  settings:"Настройки",profile:"Профиль",
  login:"Войти",register:"Регистрация",
  email:"Электронная почта",password:"Пароль",
  private:"Только я",public:"Для всех пользователей"
 },
 be:{
  chats:"Чаты",channels:"Каналы",music:"Музыка",
  search:"Пошук...",message:"Паведамленне...",
  settings:"Налады",profile:"Профіль",
  login:"Увайсці",register:"Рэгістрацыя",
  email:"Электронная пошта",password:"Пароль",
  private:"Толькі я",public:"Для ўсіх карыстальнікаў"
 }
};

function tr(key){
 return translations[currentLanguage]?.[key] || translations.ru[key] || key;
}

function toast(message){
 const el=document.getElementById("toast");
 el.textContent=message;
 el.style.display="block";
 clearTimeout(window.toastTimer);
 window.toastTimer=setTimeout(()=>el.style.display="none",3000);
}

function esc(value){
 return String(value ?? "").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 }[c]));
}

function initials(name){
 return (name || "?").trim().slice(0,1).toUpperCase();
}

function formatTime(value){
 if(!value)return "";
 return new Date(value).toLocaleTimeString(
  currentLanguage==="be"?"be-BY":"ru-RU",
  {hour:"2-digit",minute:"2-digit"}
 );
}

function formatDate(value){
 if(!value)return "";
 return new Date(value).toLocaleDateString(
  currentLanguage==="be"?"be-BY":"ru-RU"
 );
}

/* =====================================================
   AUTHENTICATION
===================================================== */

async function signIn(){
 const email=document.getElementById("authEmail").value.trim();
 const password=document.getElementById("authPassword").value;
 const status=document.getElementById("authStatus");

 if(!email || !password){
  status.textContent="Заполни электронную почту и пароль.";
  return;
 }

 status.textContent="Выполняется вход...";

 const {data,error}=await db.auth.signInWithPassword({email,password});

 if(error){
  status.textContent=error.message;
  return;
 }

 currentUser=data.user;
 await initializeApp();
}

async function signUp(){
 const email=document.getElementById("authEmail").value.trim();
 const password=document.getElementById("authPassword").value;
 const status=document.getElementById("authStatus");

 if(!email || password.length<6){
  status.textContent="Укажи почту и пароль длиной не менее 6 символов.";
  return;
 }

 status.textContent="Создаём аккаунт...";

 const {data,error}=await db.auth.signUp({email,password});

 if(error){
  status.textContent=error.message;
  return;
 }

 if(data.session){
  currentUser=data.user;
  await initializeApp();
 }else{
  status.textContent="Регистрация создана. Проверь почту и подтверди адрес.";
 }
}

async function signOut(){
 // Explicit logout: revoke the local session and clean up realtime listeners.
 try{
  if(realtimeChannel) await db.removeChannel(realtimeChannel);
  if(reactionChannel) await db.removeChannel(reactionChannel);
  realtimeChannel=null;
  reactionChannel=null;
  const {error}=await db.auth.signOut();
  if(error) throw error;
  currentUser=null;
  currentProfile=null;
  conversations=[];
  activeConversation=null;
  messagesCache=[];
  replyTarget=null;
  const app=document.getElementById('app');
  const auth=document.getElementById('authScreen');
  if(app) app.classList.add('hidden');
  if(auth) auth.classList.remove('hidden');
  const status=document.getElementById('authStatus');
  if(status) status.textContent='Вы вышли из аккаунта.';
 }catch(error){
  console.error('RIM signOut:',error);
  toast('Не удалось завершить сеанс: '+(error?.message||'неизвестная ошибка'));
 }
}

// Supabase persists the refreshable session in localStorage. Defer initialization
// outside the auth callback to avoid holding the auth lock during database requests.
db.auth.onAuthStateChange((event,session)=>{
 if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED') && session?.user && !currentUser){
  currentUser=session.user;
  setTimeout(()=>initializeApp(),0);
 }
 if(event==='SIGNED_OUT')currentUser=null;
});

/* =====================================================
   STARTUP
===================================================== */

async function initializeApp(){
 if(!currentUser || initializing)return;

 initializing=true;

 try{
  document.getElementById("authScreen").classList.add("hidden");

  // First paint is independent: load the main data in parallel and defer music until its tab is opened.
  const results=await Promise.allSettled([loadProfile(),loadSettings(),loadConversations(),loadChannels()]);
  results.forEach((r,i)=>{if(r.status==='rejected')console.error('Ошибка загрузки раздела '+i,r.reason)});

  if(document.getElementById("chatHeadStatus"))document.getElementById("chatHeadStatus").textContent="На связи";
 }catch(error){
  console.error(error);
  toast("Ошибка запуска приложения: "+error.message);
 }finally{
  initializing=false;
  try{window.__rimMirrorLegacyState?.();}catch(_){}

 }
}

async function loadProfile(){
 const {data,error}=await db
  .from("profiles")
  .select("*")
  .eq("id",currentUser.id)
  .maybeSingle();

 if(error){
  console.error(error);
  return;
 }

 currentProfile=data;

 if(!data){
  const username="user_"+currentUser.id.slice(0,8);

  const {data:newProfile,error:createError}=await db
   .from("profiles")
   .insert({
    id:currentUser.id,
    username,
    display_name:username
   })
   .select()
   .single();

  if(!createError)currentProfile=newProfile;
 }
}

async function loadSettings(){
 const {data,error}=await db
  .from("user_settings")
  .select("*")
  .eq("user_id",currentUser.id)
  .maybeSingle();

 if(error)console.warn("Настройки не загружены:",error.message);

 if(data){
  currentTheme=["imperial","dark","light","halloween"].includes(data.theme)
   ?data.theme:"imperial";

  currentLanguage=data.language || "ru";
 }

 applyTheme();
 applyLanguage();
}

async function saveSettings(){
 const {error}=await db
  .from("user_settings")
  .upsert({
   user_id:currentUser.id,
   theme:currentTheme,
   language:currentLanguage,
   updated_at:new Date().toISOString()
  });

 if(error)toast("Не удалось сохранить настройки: "+error.message);
}

/* =====================================================
   CHAT LIST
===================================================== */

async function loadConversations(){
 const list=document.getElementById("chatList");
 list.innerHTML='<div class="loading">Загрузка...</div>';

 const {data:members,error}=await db
  .from("conversation_members")
  .select("conversation_id")
  .eq("user_id",currentUser.id);

 if(error){
  list.innerHTML='<div class="notice">Ошибка загрузки переписок: '+esc(error.message)+'</div>';
  return;
 }

 const ids=(members||[]).map(x=>x.conversation_id);

 if(!ids.length){
  conversations=[];
  renderConversationList();
  return;
 }

 const {data:chats,error:chatError}=await db
  .from("conversations")
  .select("*")
  .in("id",ids)
  .order("created_at",{ascending:false});

 if(chatError){
  list.innerHTML='<div class="notice">'+esc(chatError.message)+'</div>';
  return;
 }

 conversations=chats||[];
 renderConversationList();
}

function conversationTitle(chat){
 if(chat.title)return chat.title;
 return chat.type==="direct"?"Личная переписка":"Групповая беседа";
}

function renderConversationList(){
 const list=document.getElementById("chatList");

 if(!conversations.length){
  list.innerHTML='<div class="empty-state">Пока нет переписок.<br>Создай новый чат кнопкой ＋</div>';
  return;
 }

 list.innerHTML=conversations.map(chat=>{
  const active=activeConversation?.id===chat.id?"active":"";

  return `
   <div class="chat-item ${active}" onclick="openConversation('${chat.id}')">
    <div class="avatar">⚜</div>
    <div class="chat-item-info">
     <div class="chat-item-name">${esc(conversationTitle(chat))}</div>
     <div class="chat-item-preview">${chat.type==="group"?"Групповая беседа":"Переписка"}</div>
    </div>
   </div>`;
 }).join("");
}

function filterChats(){
 const q=document.getElementById("chatSearch").value.toLowerCase();

 document.querySelectorAll(".chat-item").forEach(el=>{
  el.style.display=el.innerText.toLowerCase().includes(q)?"flex":"none";
 });
}

/* =====================================================
   OPEN CONVERSATION
===================================================== */

async function openConversation(id){
 const chat=conversations.find(c=>c.id===id);
 if(!chat)return;

 activeConversation=chat;
 replyTarget=null;
 cancelReply();

 if(document.getElementById("chatHeadName"))document.getElementById("chatHeadName").textContent=conversationTitle(chat);
 if(document.getElementById("chatHeadAvatar"))document.getElementById("chatHeadAvatar").textContent=chat.type==="group"?"♧":"♙";
 if(document.getElementById("chatHeadStatus"))document.getElementById("chatHeadStatus").textContent=chat.type==="group"?"Групповая беседа":"Личная переписка";

 const win=document.getElementById("chatWindow");
 win?.classList.add("open","mobile-active");

 document.getElementById("sidebar")?.classList.add("mobile-hidden");

 renderConversationList();
 await loadMessages();
 subscribeToMessages();
}

function backToChats(){
 document.getElementById("chatWindow")?.classList.remove("mobile-active");
 document.getElementById("sidebar")?.classList.remove("mobile-hidden");
}

async function loadMessages(){
 if(!activeConversation)return;

 const box=document.getElementById("messages");
 box.innerHTML='<div class="loading">Загрузка сообщений...</div>';

 const {data,error}=await db
  .from("chat_messages")
  .select("*")
  .eq("conversation_id",activeConversation.id)
  .order("created_at",{ascending:true})
  .limit(50);

 if(error){
  box.innerHTML='<div class="notice">Не удалось загрузить сообщения: '+esc(error.message)+'</div>';
  return;
 }

 messagesCache=data||[];
 await renderMessages();
}

async function getProfiles(ids){
 const unique=[...new Set(ids.filter(Boolean))];
 if(!unique.length)return {};

 const {data}=await db
  .from("profiles")
  .select("id,username,display_name,avatar_url")
  .in("id",unique);

 const result={};
 (data||[]).forEach(p=>result[p.id]=p);
 return result;
}

async function renderMessages(){
 const box=document.getElementById("messages");
 const oldScroll=box.scrollHeight-box.scrollTop-box.clientHeight;

 const ids=messagesCache.map(m=>m.sender_id);
 const profiles=await getProfiles(ids);

 if(!messagesCache.length){
  box.innerHTML='<div class="empty-state">Здесь пока нет сообщений.<br>Начни разговор.</div>';
  return;
 }

 const imageUrls={};

 const imageRows=await Promise.all(messagesCache.filter(m=>m.image_path).map(async m=>{
  const {data,error}=await db.storage.from("chat-files").createSignedUrl(m.image_path,1800);
  return !error&&data?.signedUrl?[m.id,data.signedUrl]:null;
 }));
 for(const entry of imageRows)if(entry)imageUrls[entry[0]]=entry[1];

 box.innerHTML=messagesCache.map(m=>{
  const mine=m.sender_id===currentUser.id;
  const p=profiles[m.sender_id]||{};
  const author=p.display_name||p.username||"Пользователь";
  const reply=messagesCache.find(x=>x.id===m.reply_to_message_id);
  const body=renderMentions(m.body||"");

  return `
   <article class="message ${mine?"mine":""}" data-id="${m.id}">
    ${!mine?`<div class="message-author">${esc(author)}</div>`:""}
    ${reply?`<div class="reply-preview">Ответ на: ${esc(reply.body||"Вложение")}</div>`:""}
    <div class="message-body">${body}</div>
    ${imageUrls[m.id]?`<img class="message-image" src="${imageUrls[m.id]}" loading="lazy">`:""}
    ${m.sticker_id?`<div style="font-size:42px">${esc(m.sticker_id)}</div>`:""}
    <div class="message-meta">
     ${m.edited_at?"изменено · ":""}${formatTime(m.created_at)}
    </div>
    <div class="message-actions">
     <button onclick="setReply('${m.id}')">Ответить</button>
     ${mine?`<button onclick="editMessage('${m.id}')">Изменить</button>
     <button onclick="deleteMessage('${m.id}')">Удалить</button>`:""}
     <button onclick="reactToMessage('${m.id}','👍')">👍</button>
     <button onclick="reactToMessage('${m.id}','❤️')">❤️</button>
     <button onclick="reactToMessage('${m.id}','😂')">😂</button>
    </div>
   </article>`;
 }).join("");

 if(oldScroll<100)box.scrollTop=box.scrollHeight;
}

function renderMentions(text){
 const safe=esc(text);

 return safe.replace(/@([a-zA-Z0-9_]+)/g,
  '<span style="color:var(--gold);font-weight:700;cursor:pointer" onclick="findUserByName(\'$1\')">@$1</span>'
 );
}

/* =====================================================
   REALTIME
===================================================== */

function subscribeToMessages(){
 if(realtimeChannel){
  db.removeChannel(realtimeChannel);
  realtimeChannel=null;
 }

 if(!activeConversation)return;

 realtimeChannel=db
  .channel("messages-"+activeConversation.id)
  .on("postgres_changes",{
   event:"*",
   schema:"public",
   table:"chat_messages",
   filter:"conversation_id=eq."+activeConversation.id
  },async()=>{
   await loadMessages();
  })
  .subscribe();
}

/* =====================================================
   SEND / EDIT / DELETE / REPLY
===================================================== */

async function sendMessage(){
 if(!activeConversation){
  toast("Сначала выбери переписку.");
  return;
 }

 const input=document.getElementById("messageInput");
 const body=input.value.trim();

 if(!body)return;

 const payload={
  conversation_id:activeConversation.id,
  sender_id:currentUser.id,
  body,
  reply_to_message_id:replyTarget?.id||null
 };

 const {error}=await db.from("chat_messages").insert(payload);

 if(error){
  toast("Ошибка отправки: "+error.message);
  return;
 }

 input.value="";
 input.style.height="42px";
 cancelReply();

 document.getElementById("stickerPanel").classList.add("hidden");
 await loadMessages();
}

function messageKeydown(event){
 if(event.key==="Enter"&&!event.shiftKey){
  event.preventDefault();
  sendMessage();
 }
}

function resizeComposer(el){
 el.style.height="42px";
 el.style.height=Math.min(el.scrollHeight,110)+"px";
}

function setReply(id){
 const m=messagesCache.find(x=>x.id===id);
 if(!m)return;

 replyTarget=m;

 if(document.getElementById("replyText"))document.getElementById("replyText").textContent="Ответ: "+(m.body||"Вложение");
 document.getElementById("replyBar")?.classList.remove("hidden");
 document.getElementById("messageInput")?.focus();
}

function cancelReply(){
 replyTarget=null;
 document.getElementById("replyBar")?.classList.add("hidden");
}

async function editMessage(id){
 const m=messagesCache.find(x=>x.id===id);
 if(!m)return;

 const newText=prompt("Измени текст сообщения:",m.body||"");
 if(newText===null)return;

 if(!newText.trim()){
  toast("Пустое сообщение нельзя сохранить.");
  return;
 }

 const {error}=await db.from("chat_messages")
  .update({
   body:newText.trim(),
   edited_at:new Date().toISOString()
  })
  .eq("id",id)
  .eq("sender_id",currentUser.id);

 if(error){
  toast("Ошибка изменения: "+error.message);
  return;
 }

 await loadMessages();
}

async function deleteMessage(id){
 if(!confirm("Удалить это сообщение?"))return;

 const {error}=await db.from("chat_messages")
  .delete()
  .eq("id",id)
  .eq("sender_id",currentUser.id);

 if(error){
  toast("Ошибка удаления: "+error.message);
  return;
 }

 await loadMessages();
}

async function reactToMessage(messageId,emoji){
 const {error}=await db.from("message_reactions")
  .upsert({
   message_id:messageId,
   user_id:currentUser.id,
   emoji
  });

 if(error)toast("Не удалось поставить реакцию: "+error.message);
 else toast("Реакция добавлена.");
}

function toggleStickers(){
 document.getElementById("stickerPanel").classList.toggle("hidden");
}

async function sendSticker(sticker){
 if(!activeConversation)return toast("Сначала выбери чат.");

 const {error}=await db.from("chat_messages").insert({
  conversation_id:activeConversation.id,
  sender_id:currentUser.id,
  body:"",
  sticker_id:sticker
 });

 if(error){
  toast("Ошибка отправки стикера: "+error.message);
  return;
 }

 document.getElementById("stickerPanel").classList.add("hidden");
 await loadMessages();
}

/* =====================================================
   IMAGE UPLOAD
===================================================== */

async function sendImage(file){
 if(!file)return;
 if(!activeConversation)return toast("Сначала выбери чат.");

 if(file.size>5*1024*1024){
  toast("Максимальный размер фотографии — 5 МБ.");
  return;
 }

 if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){
  toast("Поддерживаются JPG, PNG, WEBP и GIF.");
  return;
 }

 const ext=file.name.split(".").pop().toLowerCase();
 const path=currentUser.id+"/"+activeConversation.id+"/"+crypto.randomUUID()+"."+ext;

 toast("Загружаю фотографию...");

 const {error:uploadError}=await db.storage
  .from("chat-files")
  .upload(path,file,{contentType:file.type,upsert:false});

 if(uploadError){
  toast("Ошибка загрузки: "+uploadError.message);
  return;
 }

 const {error:insertError}=await db.from("chat_messages").insert({
  conversation_id:activeConversation.id,
  sender_id:currentUser.id,
  body:"",
  image_path:path,
  reply_to_message_id:replyTarget?.id||null
 });

 if(insertError){
  toast("Файл загружен, но сообщение не отправлено: "+insertError.message);
  return;
 }

 cancelReply();
 document.getElementById("imageInput").value="";
 await loadMessages();
}

/* =====================================================
   CREATE DIRECT CHAT
===================================================== */

async function newDirectChat(){
 const username=prompt("Введи username пользователя без символа @:");
 if(!username)return;

 const {data:profile,error}=await db
  .from("profiles")
  .select("id,username,display_name")
  .eq("username",username.replace(/^@/,""))
  .maybeSingle();

 if(error||!profile){
  toast("Пользователь не найден.");
  return;
 }

 if(profile.id===currentUser.id){
  toast("Нельзя создать переписку с самим собой.");
  return;
 }

 const {data,error:rpcError}=await db.rpc("start_direct_chat",{
  other_user:profile.id
 });

 if(rpcError){
  toast("Не удалось создать чат: "+rpcError.message);
  return;
 }

 await loadConversations();

 const conversationId=typeof data==="string"?data:data?.id;
 if(conversationId)await openConversation(conversationId);
}

/* =====================================================
   CREATE GROUP
===================================================== */

async function newGroupChat(){
 const title=prompt("Название группы:");
 if(!title?.trim())return;

 const names=prompt("Username участников через запятую. Себя добавлять не нужно:");
 if(!names)return;

 const usernames=names.split(",")
  .map(x=>x.trim().replace(/^@/,""))
  .filter(Boolean);

 const {data:profiles,error}=await db
  .from("profiles")
  .select("id,username")
  .in("username",usernames);

 if(error){
  toast(error.message);
  return;
 }

 if(!profiles?.length){
  toast("Участники не найдены.");
  return;
 }

 const ids=profiles.map(p=>p.id);

 const {data,error:rpcError}=await db.rpc("create_group_chat",{
  group_title:title.trim(),
  invited_users:ids
 });

 if(rpcError){
  toast("Ошибка создания группы: "+rpcError.message);
  return;
 }

 await loadConversations();

 const conversationId=typeof data==="string"?data:data?.id;
 if(conversationId)await openConversation(conversationId);
}

/* =====================================================
   USER SEARCH / PROFILE
===================================================== */

async function findUserByName(username){
 const {data,error}=await db.from("profiles")
  .select("id,username,display_name,bio,avatar_url")
  .eq("username",username)
  .maybeSingle();

 if(error||!data){
  toast("Пользователь не найден.");
  return;
 }

 showUserProfile(data);
}

function showUserProfile(profile){
 const name=profile.display_name||profile.username||"Пользователь";

 showModal(`
  <h2 class="modal-title">Профиль пользователя</h2>

  <div class="profile-block">
   <div class="avatar profile-avatar">
    ${profile.avatar_url?`<img src="${esc(profile.avatar_url)}">`:esc(initials(name))}
   </div>

   <div>
    <strong>${esc(name)}</strong>
    <div class="muted">@${esc(profile.username||"")}</div>
   </div>
  </div>

  <p>${esc(profile.bio||"Пользователь пока не добавил описание.")}</p>

  <div class="modal-actions">
   <button class="action-btn" onclick="closeModal()">Закрыть</button>
   <button class="primary-btn" onclick="closeModal();startChatWith('${profile.id}')">Написать</button>
  </div>
 `);
}

async function startChatWith(userId){
 const {data,error}=await db.rpc("start_direct_chat",{other_user:userId});

 if(error)return toast(error.message);

 await loadConversations();

 const id=typeof data==="string"?data:data?.id;
 if(id)openConversation(id);
}

async function openProfile(){
 const p=currentProfile||{};

 showModal(`
  <h2 class="modal-title">Мой профиль</h2>

  <div class="profile-block">
   <div class="avatar profile-avatar">${esc(initials(p.display_name||p.username))}</div>

   <div>
    <strong>${esc(p.display_name||"Пользователь")}</strong>
    <div class="muted">@${esc(p.username||"")}</div>
   </div>
  </div>

  <label class="field-label">Отображаемое имя</label>
  <input class="field" id="editDisplayName" value="${esc(p.display_name||"")}">

  <label class="field-label">Имя пользователя</label>
  <input class="field" id="editUsername" value="${esc(p.username||"")}">

  <label class="field-label">О себе</label>
  <textarea class="field" id="editBio" rows="3">${esc(p.bio||"")}</textarea>

  <label class="field-label">Аватар</label>
  <input class="field" type="file" id="avatarFile" accept="image/*">

  <div class="modal-actions">
   <button class="action-btn" onclick="closeModal()">Закрыть</button>
   <button class="primary-btn" onclick="saveProfile()">Сохранить</button>
  </div>

  <button class="action-btn danger-btn" style="width:100%;margin-top:12px" onclick="signOut()">Выйти из аккаунта</button>
 `);
}

async function saveProfile(){
 const display_name=document.getElementById("editDisplayName").value.trim();
 const username=document.getElementById("editUsername").value.trim();
 const bio=document.getElementById("editBio").value.trim();
 const file=document.getElementById("avatarFile").files[0];

 if(!username)return toast("Username не может быть пустым.");

 const patch={display_name,username,bio};

 if(file){
  if(file.size>3*1024*1024)return toast("Аватар должен быть не больше 3 МБ.");

  const ext=file.name.split(".").pop().toLowerCase();
  const path=currentUser.id+"/"+crypto.randomUUID()+"."+ext;

  const {error:uploadError}=await db.storage
   .from("avatars")
   .upload(path,file,{upsert:true});

  if(uploadError)return toast("Ошибка аватара: "+uploadError.message);

  patch.avatar_path=path;
 }

 const {data,error}=await db.from("profiles")
  .update(patch)
  .eq("id",currentUser.id)
  .select()
  .single();

 if(error)return toast("Ошибка профиля: "+error.message);

 currentProfile=data;
 closeModal();
 toast("Профиль сохранён.");
}

/* =====================================================
   SETTINGS / THEME / LANGUAGE
===================================================== */

function openSettings(){
 showModal(`
  <h2 class="modal-title">Настройки</h2>

  <div class="settings-row">
   <span>Оформление</span>

   <select id="themeSelect" onchange="changeTheme(this.value)">
    <option value="imperial" ${currentTheme==="imperial"?"selected":""}>Имперская</option>
    <option value="dark" ${currentTheme==="dark"?"selected":""}>Тёмная</option>
    <option value="light" ${currentTheme==="light"?"selected":""}>Светлая</option>
   </select>
  </div>

  <div class="settings-row">
   <span>Язык</span>

   <select id="languageSelect" onchange="changeLanguage(this.value)">
    <option value="ru" ${currentLanguage==="ru"?"selected":""}>Русский</option>
    <option value="be" ${currentLanguage==="be"?"selected":""}>Беларуская</option>
   </select>
  </div>

  <div class="settings-row">
   <span>Уведомления</span>
   <span class="muted">Подготовка к подключению</span>
  </div>

  <div class="modal-actions">
   <button class="primary-btn" onclick="closeModal()">Готово</button>
  </div>
 `);
}

function applyTheme(){
 if(!["imperial","dark","light"].includes(currentTheme)){
  currentTheme="imperial";
 }

 document.body.dataset.theme=currentTheme;

 const colors={
  imperial:"#17130e",
  dark:"#101216",
  light:"#f1f2f5"
 };

 document.querySelector('meta[name="theme-color"]')
  .setAttribute("content",colors[currentTheme]);
}

function applyLanguage(){
 if(document.getElementById("tabChats"))document.getElementById("tabChats").textContent=tr("chats");
 if(document.getElementById("tabChannels"))document.getElementById("tabChannels").textContent=tr("channels");
 if(document.getElementById("tabMusic"))document.getElementById("tabMusic").textContent=tr("music");
 document.getElementById("chatSearch").placeholder=tr("search");
 document.getElementById("messageInput").placeholder=tr("message");
}

async function changeTheme(value){
 if(!["imperial","dark","light"].includes(value))return;

 currentTheme=value;
 applyTheme();
 await saveSettings();
}

async function changeLanguage(value){
 currentLanguage=value;
 applyLanguage();
 await saveSettings();
}

/* =====================================================
   CHAT INFORMATION
===================================================== */

async function openChatInfo(){
 if(!activeConversation)return;

 const {data:members,error}=await db
  .from("conversation_members")
  .select("user_id")
  .eq("conversation_id",activeConversation.id);

 if(error)return toast(error.message);

 const profiles=await getProfiles((members||[]).map(x=>x.user_id));

 const html=(members||[]).map(m=>{
  const p=profiles[m.user_id]||{};

  return `<div class="settings-row">
   <span>${esc(p.display_name||p.username||"Участник")}</span>
   <span class="muted">@${esc(p.username||"")}</span>
  </div>`;
 }).join("");

 showModal(`
  <h2 class="modal-title">${esc(conversationTitle(activeConversation))}</h2>
  <p class="muted">Участники: ${(members||[]).length}</p>

  ${html}

  ${activeConversation.type==="group"?`
   <button class="action-btn" style="width:100%;margin-top:12px" onclick="addGroupMember()">Добавить участника</button>
  `:""}

  <button class="primary-btn" style="width:100%;margin-top:12px" onclick="closeModal()">Закрыть</button>
 `);
}

async function addGroupMember(){
 if(!activeConversation)return;

 const username=prompt("Username нового участника:");
 if(!username)return;

 const {data:user,error}=await db.from("profiles")
  .select("id")
  .eq("username",username.replace(/^@/,""))
  .maybeSingle();

 if(error||!user)return toast("Пользователь не найден.");

 const {error:addError}=await db.from("conversation_members")
  .insert({
   conversation_id:activeConversation.id,
   user_id:user.id
  });

 if(addError)return toast("Не удалось добавить участника: "+addError.message);

 toast("Участник добавлен.");
 openChatInfo();
}

/* =====================================================
   CHANNELS
===================================================== */

async function loadChannels(){
 const list=document.getElementById("channelList");

 const {data,error}=await db.from("channels")
  .select("*")
  .order("created_at",{ascending:false});

 if(error){
  list.innerHTML='<div class="notice">'+esc(error.message)+'</div>';
  return;
 }

 list.innerHTML=(data||[]).map(c=>`
  <div class="card">
   <h3>${esc(c.title)}</h3>

   <div class="muted" style="font-size:12px">${esc(c.description||"")}</div>

   <div class="row" style="margin-top:10px">
    <button class="primary-btn grow" onclick="openChannel('${c.id}')">Открыть</button>
    <span class="muted">${c.is_public?"Публичный":"Закрытый"}</span>
   </div>
  </div>
 `).join("")||'<div class="empty-state">Каналов пока нет.</div>';
}

async function createChannel(){
 const title=prompt("Название канала:");
 if(!title?.trim())return;

 const description=prompt("Описание канала:")||"";
 const isPublic=confirm("Сделать канал публичным?");

 const {data,error}=await db.from("channels")
  .insert({
   title:title.trim(),
   description,
   owner_id:currentUser.id,
   is_public:isPublic
  })
  .select()
  .single();

 if(error)return toast("Ошибка создания канала: "+error.message);

 await db.from("channel_members").upsert({
  channel_id:data.id,
  user_id:currentUser.id,
  role:"admin"
 });

 await loadChannels();
 toast("Канал создан.");
}

async function openChannel(id){
 const {data:channel,error}=await db.from("channels")
  .select("*")
  .eq("id",id)
  .single();

 if(error)return toast(error.message);

 currentChannel=channel;

 const {data:posts,error:postError}=await db.from("channel_posts")
  .select("*")
  .eq("channel_id",id)
  .order("created_at",{ascending:false})
  .limit(100);

 if(postError)return toast(postError.message);

 const postsHtml=(posts||[]).map(p=>`
  <div class="card">
   <div>${esc(p.body)}</div>

   <div class="muted" style="font-size:10px;margin-top:8px">
    ${formatDate(p.created_at)} ${formatTime(p.created_at)}
   </div>

   <div class="row" style="margin-top:7px">
    <button class="action-btn" onclick="reactToPost('${p.id}','👍')">👍</button>
    <button class="action-btn" onclick="reactToPost('${p.id}','❤️')">❤️</button>
   </div>
  </div>
 `).join("");

 const canPost=channel.owner_id===currentUser.id;

 showModal(`
  <h2 class="modal-title">${esc(channel.title)}</h2>
  <p class="muted">${esc(channel.description||"")}</p>

  ${canPost?`
   <textarea class="field" id="channelPostText" rows="3" placeholder="Новая публикация"></textarea>
   <button class="primary-btn" style="width:100%;margin:8px 0" onclick="publishChannelPost()">Опубликовать</button>
  `:""}

  <h3>Публикации</h3>

  <div style="max-height:40vh;overflow:auto">
   ${postsHtml||"Публикаций пока нет."}
  </div>

  <button class="action-btn" style="width:100%;margin-top:10px" onclick="closeModal()">Закрыть</button>
 `);
}

async function publishChannelPost(){
 const body=document.getElementById("channelPostText").value.trim();
 if(!body)return toast("Напиши текст публикации.");

 const {error}=await db.from("channel_posts").insert({
  channel_id:currentChannel.id,
  author_id:currentUser.id,
  body
 });

 if(error)return toast("Ошибка публикации: "+error.message);

 toast("Публикация добавлена.");
 openChannel(currentChannel.id);
}

async function reactToPost(postId,emoji){
 const {error}=await db.from("channel_reactions").upsert({
  post_id:postId,
  user_id:currentUser.id,
  emoji
 });

 if(error)toast(error.message);
 else toast("Реакция добавлена.");
}

/* =====================================================
   MUSIC
===================================================== */

async function uploadMusic(){
 const title=document.getElementById("musicTitle").value.trim();
 const file=document.getElementById("musicFile").files[0];
 const visibility=document.getElementById("musicVisibility").value;

 if(!title||!file)return toast("Укажи название и выбери аудиофайл.");
 if(file.size>20*1024*1024)return toast("Максимальный размер файла — 20 МБ.");

 const ext=file.name.split(".").pop().toLowerCase();
 const path=currentUser.id+"/"+crypto.randomUUID()+"."+ext;

 toast("Загружаю музыку...");

 const {error:uploadError}=await db.storage.from("music-library")
  .upload(path,file,{contentType:file.type});

 if(uploadError)return toast("Ошибка загрузки: "+uploadError.message);

 const {error}=await db.from("music_tracks").insert({
  user_id:currentUser.id,
  title,
  file_path:path,
  visibility
 });

 if(error)return toast("Ошибка сохранения трека: "+error.message);

 document.getElementById("musicTitle").value="";
 document.getElementById("musicFile").value="";

 await loadMusic();
 toast("Трек загружен.");
}

async function loadMusic(){
 const list=document.getElementById("musicList");
 if(!currentUser)return;

 const {data,error}=await db.from("music_tracks")
  .select("*")
  .order("title");

 if(error){
  list.innerHTML='<div class="notice">'+esc(error.message)+'</div>';
  return;
 }

 list.innerHTML="";

 for(const track of (data||[])){
  const {data:urlData}=await db.storage
   .from("music-library")
   .createSignedUrl(track.file_path,3600);

  if(!urlData?.signedUrl)continue;

  const item=document.createElement("div");
  item.className="card";

  item.innerHTML=`
   <strong>${esc(track.title)}</strong>

   <div class="muted" style="font-size:11px;margin:5px 0">
    ${track.visibility==="public"?"Доступен всем":"Личный трек"}
   </div>

   <audio controls preload="none" style="width:100%"></audio>
  `;

  item.querySelector("audio").src=urlData.signedUrl;
  list.appendChild(item);
 }
}

/* =====================================================
   SECTIONS / MODALS
===================================================== */

function showSection(section){
 currentSection=section;

 ["chats","channels","music"].forEach(name=>{
  document.getElementById(name+"Section").classList.toggle("hidden",name!==section);

  const tab=document.getElementById("tab"+name.charAt(0).toUpperCase()+name.slice(1));
  tab.classList.toggle("selected",name===section);
 });

 if(section==="channels")loadChannels();
 if(section==="music")loadMusic();
}

function showModal(html){
 document.getElementById("modalRoot").innerHTML=`
  <div class="modal-backdrop" onclick="if(event.target===this)closeModal()">
   <div class="modal">${html}</div>
  </div>`;
}

function closeModal(){
 document.getElementById("modalRoot").innerHTML="";
}

/* =====================================================
   ANDROID KEYBOARD FIX
===================================================== */

function updateViewport(){
 const vv=window.visualViewport;

 if(!vv){
  document.documentElement.style.setProperty("--app-height",window.innerHeight+"px");
  return;
 }

 document.documentElement.style.setProperty("--app-height",vv.height+"px");

 const input=document.getElementById("messageInput");

 if(document.activeElement===input){
  requestAnimationFrame(()=>{
   const messages=document.getElementById("messages");
   messages.scrollTop=messages.scrollHeight;
  });
 }
}

if(window.visualViewport){
 window.visualViewport.addEventListener("resize",updateViewport);
 window.visualViewport.addEventListener("scroll",updateViewport);
}

window.addEventListener("resize",updateViewport);

window.addEventListener("orientationchange",()=>{
 setTimeout(updateViewport,200);
});

document.getElementById("messageInput").addEventListener("focus",()=>{
 setTimeout(updateViewport,100);
});

document.getElementById("messageInput").addEventListener("blur",()=>{
 setTimeout(updateViewport,100);
});

/* =====================================================
   PWA SERVICE WORKER
===================================================== */

async function registerServiceWorker(){
 if(!("serviceWorker" in navigator)){
  console.warn("Service Worker не поддерживается этим браузером.");
  return;
 }

 try{
  const registration=await navigator.serviceWorker.register("/service-worker.js");
  console.log("Service Worker зарегистрирован:",registration.scope);
 }catch(error){
  console.warn("Не удалось зарегистрировать Service Worker:",error);
 }
}

/* =====================================================
   INITIAL SESSION CHECK
===================================================== */

(async function start(){
 updateViewport();

 registerServiceWorker();

 const {data,error}=await db.auth.getSession();

 if(error){
  document.getElementById("authStatus").textContent=error.message;
  return;
 }

 if(data.session?.user){
  currentUser=data.session.user;
  await initializeApp();
 }
})();

/* RIM: mirror lexical state onto window for modular bridge */


/* =====================================================
   WINDOW MIRROR — Stage C prep for 02 retirement
   Modular bridge and HTML handlers read window.* safely.
===================================================== */
window.db = db;
window.currentUser = currentUser;
window.currentProfile = currentProfile;
window.conversations = conversations;
window.activeConversation = activeConversation;
window.messagesCache = messagesCache;
window.replyTarget = replyTarget;
window.currentTheme = currentTheme;
window.currentLanguage = currentLanguage;
window.currentChannel = currentChannel;
// Keep mirrors in sync when state mutates through lexical bindings used by initializeApp.
const __rimMirrorState = () => {
  window.currentUser = currentUser;
  window.currentProfile = currentProfile;
  window.conversations = conversations;
  window.activeConversation = activeConversation;
  window.messagesCache = messagesCache;
  window.replyTarget = replyTarget;
  window.currentTheme = currentTheme;
  window.currentLanguage = currentLanguage;
  window.currentChannel = currentChannel;
};
window.__rimMirrorLegacyState = __rimMirrorState;
