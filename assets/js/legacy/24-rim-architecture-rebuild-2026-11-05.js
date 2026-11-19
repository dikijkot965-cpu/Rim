
(() => {
  'use strict';
  if (window.__RIM_ARCH_REBUILD_20261105__) return;
  window.__RIM_ARCH_REBUILD_20261105__ = true;

  const $ = id => document.getElementById(id);
  const DB = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch (_) { return window.db || null; } };
  const USER = () => { try { return typeof currentUser !== 'undefined' ? currentUser : window.currentUser; } catch (_) { return window.currentUser || null; } };
  const CHATS = () => { try { return typeof conversations !== 'undefined' ? conversations : (window.conversations || []); } catch (_) { return window.conversations || []; } };
  const MESSAGES = () => { try { return typeof messagesCache !== 'undefined' ? messagesCache : (window.messagesCache || []); } catch (_) { return window.messagesCache || []; } };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notify = msg => { const fn = window.toast || window.notify || window.notifyMsg; if (typeof fn === 'function') fn(String(msg)); else console.info('[RIM]', msg); };
  const errorText = e => e?.message || e?.error_description || String(e || 'Неизвестная ошибка');
  const styles = document.createElement('style');
  styles.id = 'rim-architecture-rebuild-css';
  styles.textContent = `
  .rim-auth-options summary{cursor:pointer;color:var(--gold2);font-size:12px;font-weight:700;padding:2px 0 7px}.rim-auth-password-wrap{position:relative;display:flex;align-items:center}.rim-auth-password-wrap .field{padding-right:76px}.rim-auth-eye{position:absolute;right:8px;border:0;background:transparent;color:var(--gold2);font-size:12px;padding:7px;cursor:pointer}.rim-auth-extra{margin-top:10px}.rim-auth-hint{font-size:12px;color:var(--muted);line-height:1.45;margin-top:7px}.rim-auth-reset{display:block;margin:10px auto 0;border:0;background:transparent;color:var(--gold2);font-size:12px;cursor:pointer}
  #chatWindow{position:relative}.rim-workspace-overlay{position:absolute;inset:0;z-index:48;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--bg);color:var(--text)}
  .rim-workspace-head{display:flex;align-items:center;gap:10px;min-height:58px;padding:9px 13px;border-bottom:1px solid var(--border);background:var(--panel);flex-shrink:0}.rim-workspace-head h2{font:700 18px 'Playfair Display',serif;color:var(--gold2);margin:0}.rim-workspace-head small{display:block;color:var(--muted);font-size:11px;margin-top:2px}.rim-workspace-head .grow{flex:1;min-width:0}
  .rim-fav-scroll{flex:1;min-height:0;overflow:auto;padding:12px;overscroll-behavior:contain}.rim-fav-intro{border:1px solid var(--border);border-radius:14px;padding:14px;background:linear-gradient(145deg,var(--panel2),var(--panel));margin-bottom:12px}.rim-fav-item{border:1px solid var(--border);border-radius:13px;background:var(--panel);padding:12px;margin:9px 0;overflow-wrap:anywhere}.rim-fav-item-body{white-space:pre-wrap;line-height:1.5;margin-top:7px}.rim-fav-item-meta{color:var(--muted);font-size:11px;margin-top:8px}
  .rim-writer-shell{display:flex;flex:1;min-height:0;overflow:hidden}.rim-writer-docs{width:240px;flex:0 0 240px;border-right:1px solid var(--border);overflow:auto;padding:10px;background:var(--panel)}.rim-writer-doc{padding:10px;border-radius:10px;cursor:pointer;margin:4px 0;border:1px solid transparent}.rim-writer-doc.active{background:var(--panel2);border-color:var(--gold)}.rim-writer-doc b{display:block;overflow-wrap:anywhere;font-size:13px}.rim-writer-doc small{display:block;color:var(--muted);margin-top:4px}.rim-writer-main{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;overflow:hidden;background:var(--bg)}.rim-writer-titlebar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--panel)}.rim-writer-titlebar input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font:600 18px 'Playfair Display',serif}.rim-writer-state{font-size:11px;color:var(--muted);white-space:nowrap}.rim-writer-toolbar.ql-toolbar.ql-snow{border:0;border-bottom:1px solid var(--border);background:var(--panel);padding:8px 12px;display:flex;flex-wrap:wrap;gap:2px}.rim-writer-toolbar .ql-formats{margin-right:7px!important}.rim-writer-paper-wrap{flex:1;min-height:0;overflow:auto;padding:22px 16px 44px;background:var(--panel2)}.rim-writer-paper{max-width:850px;min-height:100%;margin:0 auto;background:#fff;color:#242424;border-radius:3px;box-shadow:0 4px 24px rgba(0,0,0,.18);padding:clamp(22px,5vw,60px);box-sizing:border-box}.rim-writer-paper .ql-container.ql-snow{border:0;font-family:Georgia,'Times New Roman',serif;font-size:17px}.rim-writer-paper .ql-editor{min-height:65vh;line-height:1.72;padding:0;color:#252525}.rim-writer-paper .ql-editor.ql-blank::before{left:0;right:0;color:#999;font-style:normal}.rim-writer-footer{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;background:var(--panel);border-top:1px solid var(--border);font-size:11px;color:var(--muted)}.rim-writer-mobile-docs{display:none}
  .rim-cf-comments{display:none!important}.rim-cf-comments.open{display:block!important}.rim-cf-comment-toggle{border:0;background:transparent;color:var(--gold2);font-size:13px;font-weight:700;padding:9px 0 2px;cursor:pointer;text-align:left}.rim-cf-comment-toggle:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:4px}
  .rim-forward-hide{display:flex;align-items:center;gap:9px;padding:10px 0 13px;color:var(--text);font-size:13px}.rim-forward-hide input{accent-color:var(--gold);width:17px;height:17px}
  @media(max-width:700px){.rim-writer-docs{display:none;position:absolute;z-index:2;inset:0 auto 0 0;width:min(82vw,290px);box-shadow:10px 0 28px rgba(0,0,0,.3)}.rim-writer-shell.docs-open .rim-writer-docs{display:block}.rim-writer-mobile-docs{display:inline-flex}.rim-writer-paper-wrap{padding:12px 7px 28px}.rim-writer-paper{padding:22px 18px}.rim-writer-titlebar{padding:8px 10px}.rim-writer-state{max-width:95px;overflow:hidden;text-overflow:ellipsis}.rim-workspace-head{gap:7px;padding:8px}.rim-workspace-head h2{font-size:16px}}
  `;
  document.head.appendChild(styles);

  // -------------------- Authentication --------------------
  let authMode = 'login';
  let authBusy = false;
  window.rimTogglePassword = (id, button) => { const input=$(id); if(!input)return; input.type=input.type==='password'?'text':'password'; if(button)button.textContent=input.type==='password'?'Показать':'Скрыть'; };
  window.showLoginForm = () => {
    authMode='login'; const extra=$('signupExtras');if(extra)extra.hidden=true;
    const reg=$('registerBtn'),login=$('loginBtn'),pass=$('authPassword');
    if(reg){reg.textContent='Регистрация';reg.onclick=window.startRegistration;}
    if(login){login.textContent='Войти';login.onclick=window.signIn;}
    if(pass){pass.autocomplete='current-password';pass.placeholder='Введите пароль';}
    const label=$('passwordLabel');if(label)label.textContent='Пароль для входа';
    const confirm=$('authPasswordConfirm');if(confirm)confirm.value='';
    const status=$('authStatus');if(status)status.textContent='';
  };
  window.startRegistration = () => {
    authMode='signup';const extra=$('signupExtras');if(extra)extra.hidden=false;
    const reg=$('registerBtn'),login=$('loginBtn'),pass=$('authPassword');
    if(reg){reg.textContent='Создать аккаунт';reg.onclick=window.signUp;}
    if(login){login.textContent='Назад ко входу';login.onclick=window.showLoginForm;}
    if(pass)pass.autocomplete='new-password';
    const label=$('passwordLabel');if(label)label.textContent='Придумайте пароль для входа';
    const status=$('authStatus');if(status)status.textContent='Укажите почту, придумайте пароль и повторите его.';
    $('authPasswordConfirm')?.focus();
  };
  window.signIn = async () => {
    if(authBusy)return;const d=DB(),email=($('authEmail')?.value||'').trim().toLowerCase(),password=$('authPassword')?.value||'',status=$('authStatus'),button=$('loginBtn');
    if(!d)return status&&(status.textContent='Сервис входа пока не загрузился. Обновите страницу.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return status&&(status.textContent='Введите действующий адрес электронной почты.');
    if(!password)return status&&(status.textContent='Введите пароль.');
    authBusy=true;if(button)button.disabled=true;if(status)status.textContent='Проверяем данные…';
    try{const {data,error}=await d.auth.signInWithPassword({email,password});if(error){const m=error.message||'';if(/invalid login credentials/i.test(m))throw new Error('Почта или пароль неверны. Проверьте данные и попробуйте ещё раз.');if(/email not confirmed/i.test(m))throw new Error('Сначала подтвердите адрес электронной почты по ссылке из письма.');throw error;}if(!data?.user)throw new Error('Supabase не вернул пользователя. Попробуйте ещё раз.');try{currentUser=data.user;}catch(_){}window.currentUser=data.user;if(typeof window.initializeApp==='function')await window.initializeApp();if(status)status.textContent='';}
    catch(e){if(status)status.textContent=errorText(e);else notify(errorText(e));}
    finally{authBusy=false;if(button)button.disabled=false;}
  };
  window.signUp = async () => {
    if(authBusy)return;const d=DB(),email=($('authEmail')?.value||'').trim().toLowerCase(),password=$('authPassword')?.value||'',confirm=$('authPasswordConfirm')?.value||'',status=$('authStatus'),button=$('registerBtn');
    if(!d)return status&&(status.textContent='Сервис регистрации пока не загрузился. Обновите страницу.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return status&&(status.textContent='Введите действующий адрес электронной почты.');
    if(password.length<8)return status&&(status.textContent='Пароль должен содержать не менее 8 символов.');
    if(password!==confirm)return status&&(status.textContent='Пароли не совпадают. Повторите ввод.');
    authBusy=true;if(button)button.disabled=true;if(status)status.textContent='Создаём аккаунт…';
    try{
      const {data,error}=await d.auth.signUp({email,password,options:{data:{display_name:'Пользователь'}}});
      if(error){const m=error.message||'';if(/already registered|already been registered|user already registered/i.test(m))throw new Error('Этот адрес уже зарегистрирован. Попробуйте войти.');if(/database error saving new user/i.test(m))throw new Error('Не удалось создать профиль. Серверная ошибка регистрации; сообщите администратору.');throw error;}
      if(data?.session&&data?.user){try{currentUser=data.user;}catch(_){}window.currentUser=data.user;if(status)status.textContent='Аккаунт создан. Открываем РИМ…';if(typeof window.initializeApp==='function')await window.initializeApp();return;}
      if(status){status.textContent='Аккаунт создан. Откройте письмо от Supabase и подтвердите электронную почту. После подтверждения вернитесь сюда и войдите с этой почтой и паролем.';}
      const resend=document.createElement('button');resend.type='button';resend.className='rim-auth-reset';resend.textContent='Отправить письмо ещё раз';resend.onclick=()=>window.rimResendConfirmation(email);status?.appendChild(resend);
    }catch(e){if(status)status.textContent=errorText(e);else notify(errorText(e));}
    finally{authBusy=false;if(button)button.disabled=false;}
  };
  window.rimResendConfirmation = async email => {const d=DB(),status=$('authStatus');try{const {error}=await d.auth.resend({type:'signup',email:String(email||$('authEmail')?.value||'').trim().toLowerCase()});if(error)throw error;if(status)status.textContent='Письмо для подтверждения отправлено повторно. Проверьте входящие и папку «Спам».';}catch(e){if(status)status.textContent=errorText(e);}};
  window.rimResetPassword = async () => {const d=DB(),email=($('authEmail')?.value||'').trim().toLowerCase(),status=$('authStatus');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return status&&(status.textContent='Сначала укажите электронную почту, на которую зарегистрирован аккаунт.');try{const {error}=await d.auth.resetPasswordForEmail(email);if(error)throw error;if(status)status.textContent='Если аккаунт с таким адресом существует, Supabase отправит письмо для восстановления пароля.';}catch(e){if(status)status.textContent=errorText(e);}};

  // -------------------- One Favorites chat; no DOM snapshot/restore --------------------
  let workspaceMode = null;
  let favItems = [];
  function removeWorkspace(){const overlay=$('rimWorkspaceOverlay');overlay?.remove();workspaceMode=null;}
  function mountWorkspace(html){const host=$('chatWindow');if(!host)throw new Error('Окно переписки не найдено.');removeWorkspace();const overlay=document.createElement('section');overlay.id='rimWorkspaceOverlay';overlay.className='rim-workspace-overlay';overlay.innerHTML=html;host.appendChild(overlay);host.classList.add('open','mobile-active');$('sidebar')?.classList.add('mobile-hidden');return overlay;}
  function dbUser(){const d=DB(),u=USER();if(!d||!u)throw new Error('Войдите в аккаунт.');return {d,u};}
  function favoritesRow(){const list=$('chatList');if(!list)return;list.querySelectorAll('#rimFavoritesRow,#rimFavoritesRowStable').forEach(n=>n.remove());const row=document.createElement('button');row.type='button';row.id='rimFavoritesRowStable';row.className='chat-item';row.style.cssText='width:100%;text-align:left';row.innerHTML='<span class="avatar">★</span><span class="chat-item-info"><span class="chat-item-name">Избранное</span><span class="chat-item-preview">Личные заметки и документы</span></span>';row.addEventListener('click',()=>window.openFavorites());list.prepend(row);}
  const priorRenderList=window.renderConversationList;
  if(typeof priorRenderList==='function'&&!window.__RIM_FAVORITES_ROW_OWNED)window.renderConversationList=function(){const result=priorRenderList.apply(this,arguments);favoritesRow();return result;};
  function renderFavoriteItems(){const out=$('rimFavoritesList');if(!out)return;out.innerHTML=favItems.map(x=>`<article class="rim-fav-item"><div class="row"><b class="grow">${esc(x.title||'Сохранённый материал')}</b><button class="action-btn danger-btn" onclick="rimDeleteFavoriteStable('${x.id}')">Удалить</button></div><div class="rim-fav-item-body">${esc(x.body||'')}</div><div class="rim-fav-item-meta">${x.created_at?new Date(x.created_at).toLocaleString('ru-RU'):''} · ${esc(x.item_type||'материал')}</div></article>`).join('')||'<div class="empty-state">Здесь пока пусто. Сохраняйте важные сообщения, заметки и ссылки.</div>';}
  window.openFavorites=async()=>{try{const {d,u}=dbUser();workspaceMode='favorites';const overlay=mountWorkspace(`<header class="rim-workspace-head"><div class="avatar">★</div><div class="grow"><h2>Избранное</h2><small>Личное пространство · синхронизация с аккаунтом</small></div><button class="action-btn" onclick="rimOpenWriter()">✒ Lite Writer</button><button class="primary-btn" onclick="rimAddFavoriteStable()">＋ Добавить</button><button class="icon-btn" onclick="backToChats()" title="Закрыть">×</button></header><main class="rim-fav-scroll"><section class="rim-fav-intro"><b>Ваши сохранённые материалы</b><div class="rim-update-muted" style="margin-top:5px">Заметки, ссылки и важные сообщения доступны только вам.</div></section><div id="rimFavoritesList"><div class="loading">Загрузка…</div></div></main>`);const {data,error}=await d.from('rim_favorite_items').select('id,item_type,title,body,metadata,created_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(300);if($('rimWorkspaceOverlay')!==overlay)return;if(error)throw error;favItems=data||[];renderFavoriteItems();}catch(e){notify('Не удалось открыть Избранное: '+errorText(e));}};
  window.rimAddFavoriteStable=()=>{window.showModal?.(`<h2 class="modal-title">Добавить в Избранное</h2><label class="field-label">Название</label><input id="rimFavTitle" class="field" maxlength="160" placeholder="Например, важная заметка"><label class="field-label" style="margin-top:8px">Текст или ссылка</label><textarea id="rimFavBody" class="field" rows="5" maxlength="20000" placeholder="Введите текст или вставьте ссылку"></textarea><div class="row" style="margin-top:10px"><button class="primary-btn" onclick="rimSaveFavoriteForm()">Сохранить</button><button class="action-btn" onclick="closeModal()">Отмена</button></div>`);};
  window.rimSaveFavoriteForm=async()=>{try{const {d,u}=dbUser(),title=$('rimFavTitle')?.value.trim()||'Заметка',body=$('rimFavBody')?.value.trim();if(!body)return notify('Введите текст или ссылку.');const {error}=await d.from('rim_favorite_items').insert({user_id:u.id,item_type:/^https?:\/\//i.test(body)?'link':'text',title:title.slice(0,160),body:body.slice(0,20000),metadata:{}});if(error)throw error;window.closeModal?.();await window.openFavorites();}catch(e){notify('Не удалось сохранить: '+errorText(e));}};
  window.rimDeleteFavoriteStable=async id=>{try{const {d,u}=dbUser();if(!confirm('Удалить этот материал из Избранного?'))return;const {error}=await d.from('rim_favorite_items').delete().eq('id',id).eq('user_id',u.id);if(error)throw error;await window.openFavorites();}catch(e){notify(errorText(e));}};
  window.backToChats=()=>{removeWorkspace();$('chatWindow')?.classList.remove('mobile-active');$('sidebar')?.classList.remove('mobile-hidden');};

  // -------------------- Lite Writer: document workspace with a real rich-text editor --------------------
  const writer={docs:[],activeId:null,quill:null,timer:null,saving:null,loaded:false,loading:false};
  function loadQuill(){return new Promise((resolve,reject)=>{if(window.Quill)return resolve(window.Quill);let link=document.querySelector('link[data-rim-quill]');if(!link){link=document.createElement('link');link.rel='stylesheet';link.href='https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';link.dataset.rimQuill='1';document.head.appendChild(link);}let script=document.querySelector('script[data-rim-quill]');if(script){script.addEventListener('load',()=>resolve(window.Quill),{once:true});script.addEventListener('error',()=>reject(new Error('Не удалось загрузить редактор. Проверьте подключение к интернету.')),{once:true});return;}script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js';script.dataset.rimQuill='1';script.onload=()=>window.Quill?resolve(window.Quill):reject(new Error('Редактор не инициализировался.'));script.onerror=()=>reject(new Error('Не удалось загрузить редактор. Проверьте подключение к интернету.'));document.head.appendChild(script);});}
  function cleanWriterHtml(input){const doc=new DOMParser().parseFromString(String(input||''),'text/html');const allowed=new Set(['P','DIV','BR','B','STRONG','I','EM','U','S','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','A','PRE','CODE','SPAN']);const walk=node=>{[...node.childNodes].forEach(child=>{if(child.nodeType===1){if(!allowed.has(child.tagName)){child.replaceWith(...child.childNodes);return;}[...child.attributes].forEach(a=>{if(child.tagName==='A'&&a.name==='href'){try{const u=new URL(a.value,location.href);if(!['http:','https:','mailto:'].includes(u.protocol))child.removeAttribute('href');else child.setAttribute('href',u.href);}catch(_){child.removeAttribute('href');}}else if(a.name==='class'&&/^ql-(align|indent|size|direction|font)-[a-z0-9-]+(?:\s+ql-(align|indent|size|direction|font)-[a-z0-9-]+)*$/i.test(a.value)){/* preserve Quill formatting class */}else if(a.name==='style'&&/^(?:color|background-color):\s*(?:#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|[a-z]{3,20});?$/i.test(a.value.trim())){/* preserve safe text color */}else child.removeAttribute(a.name);});walk(child);}else if(child.nodeType!==3)child.remove();});};walk(doc.body);return doc.body.innerHTML;}
  function writerCount(){const text=writer.quill?.getText?.()||'';const words=(text.trim().match(/\S+/g)||[]).length;const n=$('rimWriterCount');if(n)n.textContent=`${words} слов · ${text.length} символов`;}
  function writerStatus(text){const n=$('rimWriterStatus');if(n)n.textContent=text;}
  function writerSchedule(){if(writer.loading)return;if(writer.timer)clearTimeout(writer.timer);writerStatus('Есть несохранённые изменения');writer.timer=setTimeout(()=>window.rimSaveDocument(),1000);}
  async function writerSave(){if(!writer.quill||!$('rimWriterTitle'))return;const {d,u}=dbUser();const content=cleanWriterHtml(writer.quill.root.innerHTML);const title=($('rimWriterTitle').value||'Без названия').trim().slice(0,160)||'Без названия';const id=writer.activeId;const payload={user_id:u.id,title,content,folder:'Основное',updated_at:new Date().toISOString()};writerStatus('Сохраняем…');const promise=id?d.from('rim_writer_documents').update(payload).eq('id',id).eq('user_id',u.id).select('id,title,content,folder,updated_at,created_at').single():d.from('rim_writer_documents').insert(payload).select('id,title,content,folder,updated_at,created_at').single();writer.saving=promise;const {data,error}=await promise;if(error){writerStatus('Ошибка сохранения: '+error.message);throw error;}if(!id&&writer.activeId===null)writer.activeId=data.id;const idx=writer.docs.findIndex(x=>x.id===data.id);if(idx>=0)writer.docs[idx]=data;else writer.docs.unshift(data);renderWriterDocs();writerStatus('Сохранено в '+new Date().toLocaleTimeString('ru-RU'));writer.saving=null;return data;}
  window.rimSaveDocument=async()=>{try{if(writer.timer){clearTimeout(writer.timer);writer.timer=null;}await writerSave();}catch(e){notify('Lite Writer: '+errorText(e));}};
  function renderWriterDocs(){const out=$('rimWriterDocs');if(!out)return;out.innerHTML=writer.docs.map(d=>`<button type="button" class="rim-writer-doc ${d.id===writer.activeId?'active':''}" onclick="rimSelectDocument('${d.id}')"><b>${esc(d.title||'Без названия')}</b><small>${d.updated_at?new Date(d.updated_at).toLocaleDateString('ru-RU'):''}</small></button>`).join('')||'<div class="rim-update-muted" style="padding:10px">Документов пока нет. Создайте первый документ.</div>';}
  async function writerSelect(id){if(writer.timer){clearTimeout(writer.timer);writer.timer=null;await writerSave();}else if(writer.activeId!==null)await writerSave();const doc=writer.docs.find(x=>x.id===id);if(!doc)return;writer.activeId=id;$('rimWriterTitle').value=doc.title||'';writer.loading=true;writer.quill.setContents([]);writer.quill.clipboard.dangerouslyPasteHTML(cleanWriterHtml(doc.content||''));writer.loading=false;writerCount();writerStatus('Документ открыт');renderWriterDocs();}
  window.rimSelectDocument=async id=>{try{await writerSelect(id);}catch(e){notify(errorText(e));}};
  window.rimNewDocument=async()=>{try{if(writer.timer){clearTimeout(writer.timer);writer.timer=null;await writerSave();}else if(writer.activeId!==null)await writerSave();writer.activeId=null;$('rimWriterTitle').value='';writer.loading=true;writer.quill.setContents([]);writer.loading=false;writerCount();writerStatus('Новый документ');renderWriterDocs();$('rimWriterTitle')?.focus();}catch(e){notify(errorText(e));}};
  window.rimWriterToggleDocs=()=>{$('rimWriterShell')?.classList.toggle('docs-open');};
  window.rimWriterToggleToolbar=()=>{$('rimWriterShell')?.classList.toggle('tools-open');};
  window.rimFormat=(command,value)=>{if(!writer.quill)return;writer.quill.focus();if(command==='formatBlock'){const v=String(value||'P').toLowerCase();writer.quill.format('header',v==='h1'?1:v==='h2'?2:v==='h3'?3:false);}else if(command==='insertUnorderedList')writer.quill.format('list','bullet');else if(command==='insertOrderedList')writer.quill.format('list','ordered');else if(command==='strikeThrough')writer.quill.format('strike',true);else if(command==='removeFormat')writer.quill.removeFormat(writer.quill.getSelection()?.index||0,writer.quill.getSelection()?.length||0);else writer.quill.format(command,true);writerSchedule();};
  window.rimInsertLink=()=>{const url=prompt('Адрес ссылки (https://...)');if(!url)return;try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw new Error();writer.quill?.format('link',u.href);writerSchedule();}catch(_){notify('Укажите корректную ссылку http:// или https://.');}};
  window.rimWriterBack=async()=>{try{if(writer.timer){clearTimeout(writer.timer);writer.timer=null;await writerSave();}else if(writer.activeId!==null)await writerSave();await window.openFavorites();}catch(e){notify(errorText(e));}};
  window.rimOpenWriter=async()=>{try{
    workspaceMode='writer';const {d,u}=dbUser();const {data,error}=await d.from('rim_writer_documents').select('id,title,content,folder,updated_at,created_at').eq('user_id',u.id).order('updated_at',{ascending:false}).limit(300);if(error)throw error;writer.docs=data||[];writer.activeId=writer.docs[0]?.id||null;
    const overlay=mountWorkspace(`<header class="rim-workspace-head"><button class="icon-btn" onclick="rimWriterBack()" title="Назад">‹</button><button class="action-btn rim-writer-mobile-docs" onclick="rimWriterToggleDocs()">Документы</button><button class="icon-btn" onclick="rimWriterToggleToolbar()" title="Показать инструменты" aria-label="Показать инструменты">⋯</button><div class="grow"><h2>Lite Writer</h2></div><button class="action-btn" onclick="rimNewDocument()">＋ Новый</button><button class="primary-btn" onclick="rimSaveDocument()">Сохранить</button></header><div class="rim-writer-shell" id="rimWriterShell"><aside class="rim-writer-docs" id="rimWriterDocs"></aside><main class="rim-writer-main"><div class="rim-writer-titlebar"><input id="rimWriterTitle" maxlength="160" placeholder="Название документа"><span class="rim-writer-state" id="rimWriterStatus">Открываем…</span></div><div id="rimWriterToolbar" class="rim-writer-toolbar"><span class="ql-formats"><select class="ql-header"><option selected></option><option value="1"></option><option value="2"></option><option value="3"></option></select><select class="ql-font"></select></span><span class="ql-formats"><button class="ql-bold"></button><button class="ql-italic"></button><button class="ql-underline"></button><button class="ql-strike"></button></span><span class="ql-formats"><select class="ql-color"></select><select class="ql-background"></select></span><span class="ql-formats"><button class="ql-list" value="ordered"></button><button class="ql-list" value="bullet"></button><button class="ql-indent" value="-1"></button><button class="ql-indent" value="+1"></button></span><span class="ql-formats"><select class="ql-align"></select><button class="ql-blockquote"></button><button class="ql-code-block"></button></span><span class="ql-formats"><button class="ql-link"></button><button class="ql-clean"></button></span></div><div class="rim-writer-paper-wrap"><div class="rim-writer-paper"><div id="rimWriterEditor"></div></div></div><footer class="rim-writer-footer"><span>Автосохранение включено</span><span id="rimWriterCount">0 слов · 0 символов</span></footer></main></div>`);
    await loadQuill();if($('rimWorkspaceOverlay')!==overlay)return;writer.quill=new window.Quill('#rimWriterEditor',{theme:'snow',modules:{toolbar:'#rimWriterToolbar'},placeholder:'Начните писать…'});writer.quill.on('text-change',()=>{writerCount();writerSchedule();});$('rimWriterTitle').addEventListener('input',writerSchedule);if(writer.activeId){const doc=writer.docs[0];$('rimWriterTitle').value=doc.title||'';writer.loading=true;writer.quill.clipboard.dangerouslyPasteHTML(cleanWriterHtml(doc.content||''));writer.loading=false;}writerCount();writerStatus('Готов к работе');renderWriterDocs();
  }catch(e){notify('Не удалось открыть Lite Writer: '+errorText(e));}};

  // -------------------- Chat opening: preserve the real chat DOM --------------------
  // A newer selection invalidates every remaining continuation of an older open.
  // This does not cancel an already-issued Supabase request; it prevents stale UI writes.
  let conversationOpenGeneration=0;
  if(window.__RIM_OPEN_CONVERSATION_OWNED||typeof window.__RIM_MODULAR_OPEN_IMPL==='function'){/* Stage B: modular owns open */}else window.openConversation=async id=>{
    const generation=++conversationOpenGeneration;
    const navigationToken=window.rimBeginConversationNavigation?.(id)||null;
    const isCurrent=()=>generation===conversationOpenGeneration&&(!navigationToken||window.rimIsConversationNavigationCurrent?.(navigationToken)!==false);
    const d=DB(),u=USER(),host=$('chatWindow');if(!id||!d||!u||!host)return notify('Не удалось открыть переписку: нет ID чата или активной сессии.');
    try{
      if(writer.quill&&workspaceMode==='writer'){if(writer.timer){clearTimeout(writer.timer);writer.timer=null;await writerSave();}else if(writer.activeId!==null)await writerSave();}
      if(!isCurrent())return;
      removeWorkspace();
      let chat=CHATS().find(c=>String(c.id)===String(id));
      if(!chat){
        if(typeof window.rimResolveConversationForOpen==='function'){
          chat=await window.rimResolveConversationForOpen(id,u.id);
        }else{
          // Compatibility fallback for deployments where the ES module has not booted.
          const [m,c]=await Promise.all([d.from('conversation_members').select('conversation_id').eq('conversation_id',id).eq('user_id',u.id).maybeSingle(),d.from('conversations').select('*').eq('id',id).maybeSingle()]);
          if(m.error)throw m.error;if(c.error)throw c.error;if(!m.data||!c.data)throw new Error('Переписка не найдена или нет доступа к ней.');chat=c.data;
        }
        if(!isCurrent())return;
        const rows=CHATS();if(!rows.some(row=>String(row.id)===String(chat.id))){try{conversations.unshift(chat);}catch(_){window.conversations=(window.conversations||[]).concat(chat);}}
      }
      if(!isCurrent())return;
      if(typeof window.rimCommitConversationSelection==='function'){if(!window.rimCommitConversationSelection(navigationToken,chat))return;}else{try{activeConversation=chat;}catch(_){}window.activeConversation=chat;try{replyTarget=null;}catch(_){}window.replyTarget=null;window.cancelReply?.();}
      if(!window.__RIM_CONVERSATION_SHELL_OWNED){
        const title=$('chatHeadName'),status=$('chatHeadStatus'),avatar=$('chatHeadAvatar');if(title)title.textContent=chat.title||(chat.type==='direct'?'Личная переписка':'Групповая беседа');if(status)status.textContent=chat.type==='group'?'Групповая беседа':'Личная переписка';if(avatar&&!avatar.querySelector?.('img'))avatar.textContent=chat.type==='group'?'♧':'♙';
      }
      host.classList.add('open','mobile-active');$('sidebar')?.classList.add('mobile-hidden');window.renderConversationList?.();
      if(typeof window.rimLoadMessagesStable==='function')await window.rimLoadMessagesStable();else if(typeof window.loadMessages==='function')await window.loadMessages();else throw new Error('Не найден загрузчик сообщений.');
      if(!isCurrent())return;
      if(typeof window.subscribeToMessages==='function')window.subscribeToMessages();else if(typeof subscribeToMessages==='function')subscribeToMessages();
      // The stable timeline loader already marks the active conversation read.
      // Avoid the previous duplicate read-cursor write here.
      if(!window.__RIM_CONVERSATION_SHELL_OWNED){$('rimGroupSettingsButton')?.remove();if(chat.type==='group'){const head=document.querySelector('#chatWindow .chat-head');if(head){const b=document.createElement('button');b.id='rimGroupSettingsButton';b.className='icon-btn';b.title='Настройки группы';b.textContent='⚙';b.onclick=()=>window.rimOpenGroupSettings?.(chat.id);head.appendChild(b);}}
      if(chat.avatar_path&&chat.type==='group'){const {data:s}=await d.storage.from('avatars').createSignedUrl(chat.avatar_path,1800);if(!isCurrent())return;if(s?.signedUrl&&avatar)avatar.innerHTML=`<img src="${esc(s.signedUrl)}" alt="Аватар группы" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}}
      if(!isCurrent())return;
      window.rimTrackEvent?.('conversation_open',{conversation_id:id,type:chat.type})?.catch?.(()=>{});
    }catch(e){if(!isCurrent())return;console.error('RIM openConversation:',e);notify('Не удалось открыть чат: '+errorText(e));}
  };

  // -------------------- Forward with optional hidden sender --------------------
  if(window.__RIM_FORWARD_OWNED){/* modular owns forward */}else window.rimForwardChoose=id=>{const chats=CHATS().filter(c=>String(c.id)!==String((window.activeConversation||{}).id));window.showModal?.(`<h2 class="modal-title">Переслать сообщение</h2><label class="rim-forward-hide"><input type="checkbox" id="rimForwardHideSender"> Скрыть имя исходного отправителя</label><div class="rim-update-muted">Получатель увидит текст и вложения. При включённой опции вместо имени будет показано «Пересланное сообщение».</div>${chats.map(c=>`<button class="rim-search-result-card" style="width:100%;color:var(--text)" onclick="rimForwardMessage('${id}','${c.id}')"><span class="grow"><b>${esc(c.title||(c.type==='direct'?'Личная переписка':'Группа'))}</b><small class="rim-update-muted">${c.type==='group'?'Групповая беседа':'Личный чат'}</small></span><span>›</span></button>`).join('')||'<div class="empty-state">Нет других переписок.</div>'}`);};
  if(window.__RIM_FORWARD_OWNED){/* Stage B: modular ForwardMessageService owns forward+attachments */}else window.rimDoForward=async(id,conversationId,hideSender=false)=>{
    const {d,u}=dbUser(),m=MESSAGES().find(x=>String(x.id)===String(id));if(!m)throw new Error('Исходное сообщение не найдено.');
    const {data:member,error:me}=await d.from('conversation_members').select('conversation_id').eq('conversation_id',conversationId).eq('user_id',u.id).maybeSingle();if(me)throw me;if(!member)throw new Error('Нет доступа к выбранному чату.');
    const payload={conversation_id:conversationId,sender_id:u.id,body:m.body||'',sticker_id:m.sticker_id||null,forwarded_from_user_id:m.forwarded_from_user_id||m.sender_id,forwarded_from_message_id:m.forwarded_from_message_id||m.id,forwarded_hide_sender:!!hideSender};const copied=[];
    const ext=name=>{const x=String(name||'file').split('.').pop().toLowerCase();return /^[a-z0-9]{1,8}$/.test(x)?x:'bin';};
    if(m.image_path){const target=u.id+'/'+conversationId+'/'+crypto.randomUUID()+'.'+ext(m.image_path);const {error}=await d.storage.from('chat-files').copy(m.image_path,target);if(error)throw error;payload.image_path=target;copied.push(target);}
    const {data:created,error:insertError}=await d.from('chat_messages').insert(payload).select('id').single();if(insertError){if(copied.length)await d.storage.from('chat-files').remove(copied);throw insertError;}
    const {data:attachments,error:attError}=await d.from('chat_message_attachments').select('*').eq('message_id',m.id);if(attError){await d.from('chat_messages').delete().eq('id',created.id);if(copied.length)await d.storage.from('chat-files').remove(copied);throw attError;}
    for(const a of attachments||[]){const target=u.id+'/'+conversationId+'/'+crypto.randomUUID()+'.'+ext(a.file_name);const {error:copyError}=await d.storage.from('chat-files').copy(a.storage_path,target);if(copyError){await d.from('chat_messages').delete().eq('id',created.id);if(copied.length)await d.storage.from('chat-files').remove(copied);throw copyError;}copied.push(target);const {error:metaError}=await d.from('chat_message_attachments').insert({message_id:created.id,storage_path:target,file_name:a.file_name,mime_type:a.mime_type,media_kind:a.media_kind,byte_size:a.byte_size,duration_seconds:a.duration_seconds,width:a.width,height:a.height});if(metaError){await d.from('chat_messages').delete().eq('id',created.id);await d.storage.from('chat-files').remove(copied);throw metaError;}}
    return created.id;
  };
  if(window.__RIM_FORWARD_OWNED){/* modular owns forward */}else window.rimForwardMessage=async(id,targetId)=>{try{const hide=$('rimForwardHideSender')?.checked===true;await window.rimDoForward(id,targetId,hide);window.closeModal?.();notify('Сообщение переслано'+(hide?' без имени отправителя.':'.'));if(String((window.activeConversation||{}).id)===String(targetId))await window.rimLoadMessagesStable?.();}catch(e){notify('Не удалось переслать: '+errorText(e));}};

  // Render anonymous-forward labels after the existing message renderer has completed.
  const oldRenderMessages=window.renderMessages;
  if(typeof oldRenderMessages==='function'&&!window.__RIM_MESSAGE_DECORATIONS_OWNED)window.renderMessages=async function(){await oldRenderMessages.apply(this,arguments);const rows=MESSAGES();for(const m of rows){if(!m.forwarded_from_message_id)continue;const el=document.querySelector(`#messages .message[data-id="${CSS.escape(m.id)}"]`);if(!el)continue;let label=el.querySelector('.rim-forward-source');if(m.forwarded_hide_sender){if(!label){label=document.createElement('div');label.className='rim-forward-source';el.insertBefore(label,el.firstChild);}label.textContent='Пересланное сообщение';}}};

  // Channel comments stay inside each post but remain collapsed until the label is tapped.
  window.rimToggleChannelComments=button=>{const panel=button?.nextElementSibling;if(!panel?.classList.contains('rim-cf-comments'))return;const open=panel.classList.toggle('open');button.setAttribute('aria-expanded',String(open));};

  // Remove old Favorites rows and keep exactly one ordinary chat row.
  favoritesRow();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',favoritesRow,{once:true});
  console.info('[RIM] modular navigation, auth, Favorites, Lite Writer and forwarding runtime ready');
})();
