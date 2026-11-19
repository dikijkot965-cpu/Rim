/* RIM runtime bootstrap — last classic-script shim (Stage C).
 * Extracted from legacy/02. Provides: Supabase client, lexical state, auth,
 * initializeApp, baseline helpers. Modular app.js owns open/send/timeline after load.
 * File lives outside assets/js/legacy/ so Stage C can retire the legacy/ tree from HTML.
 */

/* =====================================================
   SUPABASE
===================================================== */

const SUPABASE_URL = "https://xxvcsaomkyknudoaixbs.supabase.co";
const SUPABASE_KEY = "sb_publishable_8uEQ0o-7uF66sPZi8EVp5g_SDHXXJx0";
window.RIM_SUPABASE_PUBLISHABLE_KEY = SUPABASE_KEY;

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

const translations={ru:{chats:"Чаты",channels:"Каналы",music:"Музыка",search:"Поиск...",message:"Сообщение...",settings:"Настройки",profile:"Профиль",login:"Войти",register:"Регистрация",email:"Электронная почта",password:"Пароль",private:"Только я",public:"Для всех пользователей"},be:{chats:"Чаты",channels:"Каналы",music:"Музыка",search:"Пошук...",message:"Паведамленне...",settings:"Налады",profile:"Профіль",login:"Увайсці",register:"Рэгістрацыя",email:"Электронная пошта",password:"Пароль",private:"Толькі я",public:"Для ўсіх карыстальнікаў"}};
function tr(key){return translations[currentLanguage]?.[key]||translations.ru[key]||key;}
function toast(message){if(window.__rimPrimitives?.toast)return window.__rimPrimitives.toast(message);const el=document.getElementById("toast");if(!el)return;el.textContent=message;el.style.display="block";clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.style.display="none",3000);}
function esc(value){if(window.__rimPrimitives?.esc)return window.__rimPrimitives.esc(value);return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function initials(name){if(window.__rimPrimitives?.initials)return window.__rimPrimitives.initials(name);return (name||"?").trim().slice(0,1).toUpperCase();}
function formatTime(value){if(!value)return"";try{return new Date(value).toLocaleTimeString(currentLanguage==="be"?"be-BY":"ru-RU",{hour:"2-digit",minute:"2-digit"});}catch{return"";}}
function formatDate(value){if(!value)return"";try{return new Date(value).toLocaleDateString(currentLanguage==="be"?"be-BY":"ru-RU");}catch{return"";}}

/* =====================================================
   AUTHENTICATION
===================================================== */

function rimTogglePassword(id,button){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.rimTogglePassword==='function'&&window.rimTogglePassword!==rimTogglePassword)return window.rimTogglePassword(id,button);const input=document.getElementById(id);if(!input)return;input.type=input.type==='password'?'text':'password';if(button)button.textContent=input.type==='password'?'Показать':'Скрыть';}

function showLoginForm(){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.showLoginForm==='function'&&window.showLoginForm!==showLoginForm)return window.showLoginForm();const extra=document.getElementById('signupExtras');if(extra)extra.hidden=true;const reg=document.getElementById('registerBtn');const login=document.getElementById('loginBtn');if(reg){reg.textContent='Регистрация';reg.onclick=startRegistration;}if(login){login.textContent='Войти';login.onclick=signIn;}const status=document.getElementById('authStatus');if(status)status.textContent='';}

function startRegistration(){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.startRegistration==='function'&&window.startRegistration!==startRegistration)return window.startRegistration();const extra=document.getElementById('signupExtras');if(extra)extra.hidden=false;const reg=document.getElementById('registerBtn');const login=document.getElementById('loginBtn');if(reg){reg.textContent='Создать аккаунт';reg.onclick=signUp;}if(login){login.textContent='Назад ко входу';login.onclick=showLoginForm;}const status=document.getElementById('authStatus');if(status)status.textContent='Укажите почту, придумайте пароль и повторите его.';}

async function rimResetPassword(){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.rimResetPassword==='function'&&window.rimResetPassword!==rimResetPassword)return window.rimResetPassword();const email=(document.getElementById('authEmail')?.value||'').trim().toLowerCase();const status=document.getElementById('authStatus');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){if(status)status.textContent='Сначала укажите электронную почту, на которую зарегистрирован аккаунт.';return;}try{const {error}=await db.auth.resetPasswordForEmail(email);if(error)throw error;if(status)status.textContent='Если аккаунт с таким адресом существует, письмо для восстановления отправлено.';}catch(e){if(status)status.textContent=e?.message||String(e);}}

window.rimTogglePassword=rimTogglePassword;
window.startRegistration=startRegistration;
window.showLoginForm=showLoginForm;
window.rimResetPassword=rimResetPassword;

async function signIn(){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.signIn==='function'&&window.signIn!==signIn)return window.signIn();const email=document.getElementById('authEmail')?.value?.trim();const password=document.getElementById('authPassword')?.value;const status=document.getElementById('authStatus');if(!email||!password){if(status)status.textContent='Заполни электронную почту и пароль.';return;}if(status)status.textContent='Выполняется вход...';const {data,error}=await db.auth.signInWithPassword({email,password});if(error){if(status)status.textContent=error.message;return;}currentUser=data.user;window.currentUser=data.user;await initializeApp();}

async function signUp(){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.signUp==='function'&&window.signUp!==signUp)return window.signUp();const email=(document.getElementById('authEmail')?.value||'').trim().toLowerCase();const password=document.getElementById('authPassword')?.value||'';const confirm=document.getElementById('authPasswordConfirm')?.value||'';const status=document.getElementById('authStatus');if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){if(status)status.textContent='Введите действующий адрес электронной почты.';return;}if(password.length<8){if(status)status.textContent='Пароль должен быть не короче 8 символов.';return;}if(confirm&&confirm!==password){if(status)status.textContent='Пароли не совпадают.';return;}if(status)status.textContent='Создаём аккаунт...';const {data,error}=await db.auth.signUp({email,password});if(error){if(status)status.textContent=error.message;return;}if(data.session){currentUser=data.user;window.currentUser=data.user;await initializeApp();}else{if(status)status.textContent='Регистрация создана. Проверь почту и подтверди адрес.';showLoginForm();}}
async function signInWithGoogle(){if(window.__RIM_AUTH_FORM_OWNED&&typeof window.signInWithGoogle==='function'&&window.signInWithGoogle!==signInWithGoogle)return window.signInWithGoogle();toast('Модуль входа через Google ещё загружается.');}

async function signOut(){if(window.__RIM_SESSION_LIFECYCLE_OWNED&&typeof window.signOut==='function'&&window.signOut!==signOut)return window.signOut();try{if(realtimeChannel)await db.removeChannel(realtimeChannel);if(reactionChannel)await db.removeChannel(reactionChannel);realtimeChannel=null;reactionChannel=null;const {error}=await db.auth.signOut();if(error)throw error;currentUser=null;currentProfile=null;conversations=[];activeConversation=null;messagesCache=[];replyTarget=null;document.getElementById('app')?.classList.add('hidden');document.getElementById('authScreen')?.classList.remove('hidden');const status=document.getElementById('authStatus');if(status)status.textContent='Вы вышли из аккаунта.';try{window.__rimMirrorLegacyState?.();}catch(_){}}catch(error){console.error('RIM signOut:',error);toast('Не удалось завершить сеанс: '+(error?.message||'неизвестная ошибка'));}}

// Supabase persists the refreshable session in localStorage. Defer initialization
// outside the auth callback to avoid holding the auth lock during database requests.
db.auth.onAuthStateChange((event,session)=>{if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&session?.user&&!currentUser){currentUser=session.user;window.currentUser=currentUser;setTimeout(()=>initializeApp(),0);}if(event==='SIGNED_OUT'){currentUser=null;window.currentUser=null;}});

/* =====================================================
   STARTUP
===================================================== */

async function initializeApp(){if(window.__RIM_APP_BOOTSTRAP_OWNED&&typeof window.initializeApp==='function'&&window.initializeApp!==initializeApp)return window.initializeApp();if(!currentUser||initializing)return;initializing=true;try{document.getElementById("authScreen")?.classList.add("hidden");document.getElementById("app")?.classList.remove("hidden");const results=await Promise.allSettled([loadProfile(),loadSettings(),loadConversations(),loadChannels()]);results.forEach((r,i)=>{if(r.status==='rejected')console.error('Ошибка загрузки раздела '+i,r.reason);});const st=document.getElementById("chatHeadStatus");if(st)st.textContent="На связи";}catch(error){console.error(error);toast("Ошибка запуска приложения: "+(error?.message||error));}finally{initializing=false;try{window.__rimMirrorLegacyState?.();}catch(_){}}}

async function loadProfile(){if(window.__RIM_PROFILE_OWNED&&typeof window.loadProfile==='function'&&window.loadProfile!==loadProfile)return window.loadProfile();if(!currentUser?.id)return;const {data,error}=await db.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();if(error){console.error(error);return;}currentProfile=data;if(!data){const username='user_'+String(currentUser.id).slice(0,8);const {data:np}=await db.from('profiles').insert({id:currentUser.id,username,display_name:username}).select().single();if(np)currentProfile=np;}try{window.currentProfile=currentProfile;}catch(_){}}

async function loadSettings(){if(window.__RIM_APPEARANCE_OWNED&&typeof window.loadSettings==='function'&&window.loadSettings!==loadSettings)return window.loadSettings();if(!currentUser?.id)return;const {data,error}=await db.from("user_settings").select("*").eq("user_id",currentUser.id).maybeSingle();if(error)console.warn(error.message);if(data){currentTheme=["imperial","dark","light","halloween","halloween-imperial"].includes(data.theme)?data.theme:"imperial";currentLanguage=data.language||"ru";}applyTheme();applyLanguage();}

async function saveSettings(){if(window.__RIM_APPEARANCE_OWNED&&typeof window.saveSettings==='function'&&window.saveSettings!==saveSettings)return window.saveSettings();toast('Модуль настроек ещё загружается.');}

/* =====================================================
   CHAT LIST
===================================================== */

async function loadConversations(){if(typeof window.loadConversations==='function'&&window.loadConversations!==loadConversations)return window.loadConversations();toast('Модуль списка чатов ещё загружается.');}

function conversationTitle(chat){if(typeof window.conversationTitle==='function'&&window.conversationTitle!==conversationTitle)return window.conversationTitle(chat);if(chat?.title)return chat.title;return chat?.type==="direct"?"Личная переписка":"Групповая беседа";}

function renderConversationList(){if(window.__RIM_CONVERSATION_LIST_RENDER_OWNED&&typeof window.renderConversationList==='function'&&window.renderConversationList!==renderConversationList)return window.renderConversationList();toast('Список чатов ещё загружается.');}

function filterChats(){const q=(document.getElementById('chatSearch')?.value||'').trim().toLowerCase();document.querySelectorAll('#chatList .chat-item').forEach(el=>{el.style.display=!q||(el.innerText||'').toLowerCase().includes(q)?'':'none';});}

/* =====================================================
   OPEN CONVERSATION
===================================================== */

async function openConversation(id){if(typeof window.__RIM_MODULAR_OPEN_IMPL==='function')return window.__RIM_MODULAR_OPEN_IMPL(id);if(typeof window.openConversation==='function'&&window.openConversation!==openConversation)return window.openConversation(id);toast('Модуль открытия чата ещё загружается.');}

function backToChats(){if(typeof window.backToChats==='function'&&window.backToChats!==backToChats)return window.backToChats();try{document.getElementById('app')?.classList.remove('rim-chat-focus');}catch(_){}document.getElementById("chatWindow")?.classList.remove("mobile-active");document.getElementById("sidebar")?.classList.remove("mobile-hidden");}

async function loadMessages(){if(window.__RIM_MESSAGE_TIMELINE_OWNED&&typeof window.loadMessages==='function'&&window.loadMessages!==loadMessages)return window.loadMessages();if(typeof window.rimLoadMessagesStable==='function')return window.rimLoadMessagesStable();toast('Модуль ленты сообщений ещё загружается.');}

async function getProfiles(ids){if(typeof window.getProfiles==='function'&&window.getProfiles!==getProfiles)return window.getProfiles(ids);const unique=[...new Set((ids||[]).filter(Boolean))];if(!unique.length)return{};const {data}=await db.from("profiles").select("id,username,display_name,avatar_url").in("id",unique);const result={};(data||[]).forEach(p=>result[p.id]=p);return result;}

async function renderMessages(){if(window.__RIM_MESSAGE_LIST_RENDERER_OWNED&&typeof window.renderMessages==='function'&&window.renderMessages!==renderMessages)return window.renderMessages();toast('Модуль отрисовки сообщений ещё загружается.');}

function renderMentions(text){const safe=esc(text);return safe.replace(/@([a-zA-Z0-9_]+)/g,'<span style="color:var(--gold);font-weight:700;cursor:pointer" onclick="findUserByName(\'$1\')">@$1</span>');}

/* =====================================================
   REALTIME
===================================================== */

function subscribeToMessages(){if(window.__RIM_MESSAGE_TIMELINE_OWNED&&typeof window.subscribeToMessages==='function'&&window.subscribeToMessages!==subscribeToMessages)return window.subscribeToMessages();}

/* =====================================================
   SEND / EDIT / DELETE / REPLY
===================================================== */

async function sendMessage(){if(window.__RIM_MESSAGE_COMMANDS_OWNED&&typeof window.sendMessage==='function'&&window.sendMessage!==sendMessage)return window.sendMessage();toast('Модуль сообщений ещё загружается.');}

function messageKeydown(event){if(window.__RIM_COMPOSER_CHROME_OWNED&&typeof window.messageKeydown==='function'&&window.messageKeydown!==messageKeydown)return window.messageKeydown(event);if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}}

function resizeComposer(el){if(window.__RIM_COMPOSER_CHROME_OWNED&&typeof window.resizeComposer==='function'&&window.resizeComposer!==resizeComposer)return window.resizeComposer(el);if(!el)return;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,160)+'px';}

function setReply(id){if(window.__RIM_REPLY_TARGET_OWNED&&typeof window.setReply==='function'&&window.setReply!==setReply)return window.setReply(id);const message=(messagesCache||[]).find(m=>m.id===id);if(!message)return;replyTarget=message;window.replyTarget=message;}

function cancelReply(){if(window.__RIM_REPLY_TARGET_OWNED&&typeof window.cancelReply==='function'&&window.cancelReply!==cancelReply)return window.cancelReply();replyTarget=null;window.replyTarget=null;document.getElementById('replyBar')?.classList.add('hidden');}

async function editMessage(id){if(window.__RIM_MESSAGE_COMMANDS_OWNED&&typeof window.editMessage==='function'&&window.editMessage!==editMessage)return window.editMessage(id);toast('Модуль сообщений ещё загружается.');}

async function deleteMessage(id){if(window.__RIM_MESSAGE_COMMANDS_OWNED&&typeof window.deleteMessage==='function'&&window.deleteMessage!==deleteMessage)return window.deleteMessage(id);toast('Модуль сообщений ещё загружается.');}

async function reactToMessage(messageId,emoji){if(window.__RIM_MESSAGE_COMMANDS_OWNED&&typeof window.reactToMessage==='function'&&window.reactToMessage!==reactToMessage)return window.reactToMessage(messageId,emoji);toast('Модуль сообщений ещё загружается.');}

function toggleStickers(){if(window.__RIM_COMPOSER_CHROME_OWNED&&typeof window.toggleStickers==='function'&&window.toggleStickers!==toggleStickers)return window.toggleStickers();document.getElementById("stickerPanel")?.classList.toggle("hidden");}

async function sendSticker(sticker){if(window.__RIM_MESSAGE_COMMANDS_OWNED&&typeof window.sendSticker==='function'&&window.sendSticker!==sendSticker)return window.sendSticker(sticker);toast('Модуль сообщений ещё загружается.');}

/* =====================================================
   IMAGE UPLOAD
===================================================== */

async function sendImage(file){if(window.__RIM_MESSAGE_COMMANDS_OWNED&&typeof window.sendImage==='function'&&window.sendImage!==sendImage)return window.sendImage(file);toast('Модуль сообщений ещё загружается.');}

/* =====================================================
   CREATE DIRECT CHAT
===================================================== */

async function newDirectChat(){if(window.__RIM_COMPOSE_CHAT_OWNED&&typeof window.newDirectChat==='function'&&window.newDirectChat!==newDirectChat)return window.newDirectChat();toast('Модуль создания чата ещё загружается.');}

/* =====================================================
   CREATE GROUP
===================================================== */

async function newGroupChat(){if(window.__RIM_COMPOSE_CHAT_OWNED&&typeof window.newGroupChat==='function'&&window.newGroupChat!==newGroupChat)return window.newGroupChat();toast('Модуль создания группы ещё загружается.');}

/* =====================================================
   USER SEARCH / PROFILE
===================================================== */

async function findUserByName(username){if(window.__RIM_DIRECT_CHAT_OWNED&&typeof window.findUserByName==='function'&&window.findUserByName!==findUserByName)return window.findUserByName(username);toast('Модуль поиска пользователей ещё загружается.');}

function showUserProfile(profile){if(window.__RIM_DIRECT_CHAT_OWNED&&typeof window.showUserProfile==='function'&&window.showUserProfile!==showUserProfile)return window.showUserProfile(profile);toast('Модуль профиля собеседника ещё загружается.');}

async function startChatWith(userId){if(window.__RIM_DIRECT_CHAT_OWNED&&typeof window.startChatWith==='function'&&window.startChatWith!==startChatWith)return window.startChatWith(userId);toast('Модуль личных чатов ещё загружается.');}

async function openProfile(){if(window.__RIM_PROFILE_OWNED&&typeof window.openProfile==='function'&&window.openProfile!==openProfile)return window.openProfile();toast('Модуль профиля ещё загружается.');}

async function saveProfile(){if(window.__RIM_PROFILE_OWNED&&typeof window.saveProfile==='function'&&window.saveProfile!==saveProfile)return window.saveProfile();toast('Модуль профиля ещё загружается.');}
function openSettings(){if(window.__RIM_SETTINGS_SHELL_OWNED&&typeof window.openSettings==='function'&&window.openSettings!==openSettings)return window.openSettings();toast('Модуль настроек ещё загружается.');}

function applyTheme(){if(window.__RIM_APPEARANCE_OWNED&&typeof window.applyTheme==='function'&&window.applyTheme!==applyTheme)return window.applyTheme();if(!["imperial","dark","light","halloween","halloween-imperial"].includes(currentTheme))currentTheme="imperial";try{document.body.dataset.theme=currentTheme;}catch(_){}try{document.querySelector('meta[name="theme-color"]')?.setAttribute("content",({imperial:"#17130e",dark:"#101216",light:"#f1f2f5",halloween:"#160e20","halloween-imperial":"#100d19"})[currentTheme]||"#17130e");}catch(_){}}

function applyLanguage(){if(window.__RIM_APPEARANCE_OWNED&&typeof window.applyLanguage==='function'&&window.applyLanguage!==applyLanguage)return window.applyLanguage();try{window.currentLanguage=currentLanguage||'ru';}catch(_){}}

async function changeTheme(value){if(window.__RIM_APPEARANCE_OWNED&&typeof window.changeTheme==='function'&&window.changeTheme!==changeTheme)return window.changeTheme(value);toast('Модуль оформления ещё загружается.');}

async function changeLanguage(value){if(window.__RIM_APPEARANCE_OWNED&&typeof window.changeLanguage==='function'&&window.changeLanguage!==changeLanguage)return window.changeLanguage(value);toast('Модуль оформления ещё загружается.');}

/* =====================================================
   CHAT INFORMATION
===================================================== */

async function openChatInfo(){if(window.__RIM_CHAT_INFO_OWNED&&typeof window.openChatInfo==='function'&&window.openChatInfo!==openChatInfo)return window.openChatInfo();toast('Модуль сведений о чате ещё загружается.');}

async function addGroupMember(){if(window.__RIM_CHAT_INFO_OWNED&&typeof window.addGroupMember==='function'&&window.addGroupMember!==addGroupMember)return window.addGroupMember();toast('Модуль участников ещё загружается.');}

/* =====================================================
   CHANNELS
===================================================== */

async function loadChannels(){if(window.__RIM_CHANNEL_DIRECTORY_OWNED&&typeof window.loadChannels==='function'&&window.loadChannels!==loadChannels)return window.loadChannels();toast('Модуль каталога каналов ещё загружается.');}
async function createChannel(){if(window.__RIM_CHANNEL_COMMANDS_OWNED&&typeof window.createChannel==='function'&&window.createChannel!==createChannel)return window.createChannel();toast('Модуль создания канала ещё загружается.');}
async function openChannel(id){if(window.__RIM_CHANNEL_FEED_OWNED&&typeof window.openChannel==='function'&&window.openChannel!==openChannel)return window.openChannel(id);toast('Модуль каналов ещё загружается.');}

async function publishChannelPost(){if(window.__RIM_CHANNEL_FEED_OWNED&&typeof window.publishChannelPost==='function'&&window.publishChannelPost!==publishChannelPost)return window.publishChannelPost();toast('Модуль публикаций канала ещё загружается.');}
async function reactToPost(postId,emoji){if(window.__RIM_CHANNEL_FEED_OWNED&&typeof window.reactToPost==='function'&&window.reactToPost!==reactToPost)return window.reactToPost(postId,emoji);toast('Модуль реакций канала ещё загружается.');}

/* =====================================================
   MUSIC
===================================================== */

async function uploadMusic(){if(window.__RIM_MUSIC_OWNED&&typeof window.uploadMusic==='function'&&window.uploadMusic!==uploadMusic)return window.uploadMusic();toast('Модуль музыки ещё загружается.');}

async function loadMusic(){if(window.__RIM_MUSIC_OWNED&&typeof window.loadMusic==='function'&&window.loadMusic!==loadMusic)return window.loadMusic();if(typeof window.rimOpenMusic==='function')return window.rimOpenMusic();toast('Модуль музыки ещё загружается.');}

/* =====================================================
   SECTIONS / MODALS
===================================================== */

function showSection(section){if(window.__RIM_SECTION_NAV_OWNED&&typeof window.showSection==='function'&&window.showSection!==showSection)return window.showSection(section);currentSection=section;["moreSection","toolsSection"].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.add("hidden");el.style.display="none";}});["chats","channels","music"].forEach(name=>{const sec=document.getElementById(name+"Section");if(!sec)return;const on=name===section;sec.classList.toggle("hidden",!on);if(name==="chats")sec.style.display=on?"flex":"none";else if(on)sec.style.display="";document.getElementById("tab"+name.charAt(0).toUpperCase()+name.slice(1))?.classList.toggle("selected",on);});if(section==="channels")loadChannels();if(section==="music")loadMusic();}

function showModal(html){if(window.__RIM_MODAL_OWNED&&typeof window.showModal==='function'&&window.showModal!==showModal)return window.showModal(html);const root=document.getElementById("modalRoot");if(root)root.innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;}

function closeModal(){if(window.__RIM_MODAL_OWNED&&typeof window.closeModal==='function'&&window.closeModal!==closeModal)return window.closeModal();const root=document.getElementById("modalRoot");if(root)root.innerHTML="";}

/* =====================================================
   ANDROID KEYBOARD FIX
===================================================== */

function updateViewport(){if(window.__RIM_VIEWPORT_OWNED&&typeof window.updateViewport==='function'&&window.updateViewport!==updateViewport)return window.updateViewport();const vv=window.visualViewport;document.documentElement.style.setProperty("--app-height",(vv?vv.height:window.innerHeight)+"px");}

/* Viewport listeners: modular ViewportController installs when app binds; keep minimal early boot. */
if(!window.__RIM_VIEWPORT_OWNED){const vv=window.visualViewport;if(vv){vv.addEventListener("resize",updateViewport);vv.addEventListener("scroll",updateViewport);}window.addEventListener("resize",updateViewport);}

/* =====================================================
   PWA SERVICE WORKER
===================================================== */

async function registerServiceWorker(){if(!("serviceWorker" in navigator))return;try{await navigator.serviceWorker.register("/sw.js");}catch(e){console.warn("SW register failed",e);}}

(async function start(){
  updateViewport();registerServiceWorker();
  const {data,error}=await db.auth.getSession();
  if(error){const s=document.getElementById("authStatus");if(s)s.textContent=error.message;return;}
  if(data.session?.user){currentUser=data.session.user;window.currentUser=currentUser;await initializeApp();}
})();

window.db=db;window.currentUser=currentUser;window.currentProfile=currentProfile;window.conversations=conversations;window.activeConversation=activeConversation;window.messagesCache=messagesCache;window.replyTarget=replyTarget;window.currentTheme=currentTheme;window.currentLanguage=currentLanguage;window.currentChannel=currentChannel;
const __rimMirrorState=()=>{window.currentUser=currentUser;window.currentProfile=currentProfile;window.conversations=conversations;window.activeConversation=activeConversation;window.messagesCache=messagesCache;window.replyTarget=replyTarget;window.currentTheme=currentTheme;window.currentLanguage=currentLanguage;window.currentChannel=currentChannel;};
window.__rimMirrorLegacyState=__rimMirrorState;

function rimOpenAttachSheet(){if(window.__RIM_COMPOSER_CHROME_OWNED&&typeof window.rimOpenAttachSheet==='function'&&window.rimOpenAttachSheet!==rimOpenAttachSheet)return window.rimOpenAttachSheet();toast('Модуль вложений ещё загружается.');}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('rimAttachBtn')?.addEventListener('click',rimOpenAttachSheet);document.getElementById('rimVoiceBtn')?.addEventListener('click',()=>{if(typeof window.rimStartVoiceMessage==='function')window.rimStartVoiceMessage();else toast('Запись голосовых скоро будет доступна.');});});
window.rimOpenAttachSheet=rimOpenAttachSheet;
