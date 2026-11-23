
/* =========================================================
   IMPERIAL MESSENGER — FEATURE PACK
   Adds UI integration for features prepared in Supabase.
   Missing optional tables/buckets are reported without
   preventing the core messenger from starting.
========================================================= */

const IMPERIAL_FEATURES = {
  admin: false,
  memberNumber: null,
  unreadCount: 0,
  notificationCount: 0,
  channelWallpaperUrl: null,
  personalWallpaperUrl: null,
  bulletinRows: [],
  achievementRows: []
};

const IMPERIAL_LANGUAGES = {
  ru: { bulletin:'Доска объявлений', notifications:'Уведомления', achievements:'Достижения', report:'Пожаловаться', pins:'Закреплённое', memberCard:'Имперское удостоверение', wallpaper:'Обои', comments:'Комментарии', save:'Сохранить', close:'Закрыть' },
  be: { bulletin:'Дошка абвестак', notifications:'Апавяшчэнні', achievements:'Дасягненні', report:'Паскардзіцца', pins:'Замацаванае', memberCard:'Імперскае пасведчанне', wallpaper:'Шпалеры', comments:'Каментарыі', save:'Захаваць', close:'Закрыць' },
  uk: { bulletin:'Дошка оголошень', notifications:'Сповіщення', achievements:'Досягнення', report:'Поскаржитися', pins:'Закріплене', memberCard:'Імперське посвідчення', wallpaper:'Шпалери', comments:'Коментарі', save:'Зберегти', close:'Закрити' },
  kk: { bulletin:'Хабарландыру тақтасы', notifications:'Хабарландырулар', achievements:'Жетістіктер', report:'Шағымдану', pins:'Бекітілген', memberCard:'Империялық куәлік', wallpaper:'Түсқағаз', comments:'Пікірлер', save:'Сақтау', close:'Жабу' },
  en: { bulletin:'Bulletin board', notifications:'Notifications', achievements:'Achievements', report:'Report', pins:'Pinned', memberCard:'Imperial ID', wallpaper:'Wallpapers', comments:'Comments', save:'Save', close:'Close' }
};

function ft(key){ return IMPERIAL_LANGUAGES[currentLanguage]?.[key] || IMPERIAL_LANGUAGES.ru[key] || key; }
function isImperator(){ return IMPERIAL_FEATURES.admin === true; }
function featureError(label,error){ console.warn(label,error); toast(label+': '+(error?.message||'не удалось выполнить операцию')); }
function safeFileExt(file){ const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); return /^[a-z0-9]{2,5}$/.test(ext)?ext:'jpg'; }

function injectFeatureStyles(){
 if(document.getElementById('imperialFeatureStyles')) return;
 const style=document.createElement('style'); style.id='imperialFeatureStyles';
 style.textContent=`
 body[data-theme="halloween"]{--bg:#171019;--panel:#241629;--panel2:#35203a;--surface:#43264a;--text:#f5e9f5;--muted:#c0a9c5;--gold:#ff8a32;--gold2:#ffc078;--border:rgba(255,138,50,.28);--mine:#4b2b43;--other:#2a2030;--danger:#f07878;--success:#80bd8b}
 .feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
 .feature-tile{padding:13px 9px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);color:var(--text);text-align:left;min-height:66px}
 .feature-tile b{display:block;color:var(--gold2);margin-bottom:4px}
 .feature-tile small{color:var(--muted)}
 .feature-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:20px;background:var(--danger);color:white;font-size:10px;margin-left:5px}
 .feature-banner{margin:10px 0;padding:10px;border:1px solid var(--border);border-radius:11px;background:var(--panel2);font-size:12px;color:var(--muted)}
 .feature-banner img{display:block;width:100%;max-height:105px;object-fit:cover;border-radius:8px;margin-bottom:7px}
 .feature-ad{position:relative;margin:10px 0;border:1px solid var(--border);border-radius:11px;overflow:hidden;background:#17130e}
 .feature-ad img{display:block;width:100%;max-height:190px;object-fit:cover}
 .feature-ad-caption{position:absolute;left:8px;right:8px;bottom:8px;text-align:center;padding:6px 8px;border-radius:8px;background:#111c;color:#fff;font-size:11px;letter-spacing:.2px;text-shadow:0 1px 2px #000}
 .feature-small{font-size:11px;color:var(--muted)}
 .feature-comment{padding:9px;margin:7px 0;border-radius:9px;background:var(--panel2);border:1px solid var(--border)}
 .feature-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
 .feature-actions button{font-size:11px;padding:6px 8px}
 .feature-unread{width:8px;height:8px;border-radius:50%;background:var(--gold);display:inline-block;margin-left:5px}
 .member-id{border:1px solid var(--gold);border-radius:14px;padding:15px;background:linear-gradient(135deg,var(--panel2),var(--bg));}
 .member-id .serial{font-family:monospace;letter-spacing:2px;color:var(--gold2);font-size:12px}
 .member-id .seal{font-size:34px;float:right}
 .achievement{display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border)}
 .achievement-icon{font-size:25px;width:35px;text-align:center}
 .message-pinned{outline:1px solid var(--gold);}
 .profile-color-preview{width:22px;height:22px;border-radius:50%;border:1px solid var(--border);display:inline-block;vertical-align:middle}
 .rim-premium-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
 .rim-premium-heading{display:flex;align-items:center;gap:10px;margin-bottom:12px}.rim-premium-heading>span{font-size:28px;color:var(--gold2)}.rim-premium-heading h3{margin:0;color:var(--gold2);font-family:'Playfair Display',serif}.rim-premium-heading small,.rim-premium-card small{color:var(--muted)}
 .rim-premium-card{border:1px solid var(--border);border-radius:14px;padding:13px;margin:10px 0;background:var(--panel2)}.rim-premium-card h4{margin:0 0 6px;color:var(--gold2);font-size:16px}.rim-premium-card p{margin:4px 0 8px;color:var(--muted)}.rim-premium-card ul{padding-left:19px;margin:8px 0}.rim-premium-card li{margin:5px 0;font-size:13px}
 .rim-premium-note{padding:12px;border-radius:12px;background:var(--panel);border:1px dashed var(--gold)}.rim-premium-note p{font-size:13px;color:var(--muted);line-height:1.45}.rim-premium-periods{display:flex;gap:6px;flex-wrap:wrap}.rim-premium-periods span{border:1px solid var(--border);border-radius:18px;padding:5px 10px;font-size:12px;color:var(--muted)}
 `;
 document.head.appendChild(style);
}

function injectFeatureNavigation(){
 const bar=document.querySelector('.tabbar');
 if(!bar || document.getElementById('tabMore')) return;
 const btn=document.createElement('button'); btn.className='action-btn'; btn.id='tabMore'; btn.textContent='Ещё'; btn.onclick=()=>openImperialCabinet(); bar.appendChild(btn);
}

function injectFeatureTools(){
 if(document.getElementById('imperialFeatureTools')) return;
 const root=document.createElement('div'); root.id='imperialFeatureTools'; root.style.display='none';
 root.innerHTML=`<input id="featureWallpaperInput" type="file" accept="image/*" hidden><input id="featureChannelWallpaperInput" type="file" accept="image/*" hidden>`;
 document.body.appendChild(root);
 document.getElementById('featureWallpaperInput').addEventListener('change',e=>{if(e.target.files[0])uploadPersonalWallpaper(e.target.files[0]);e.target.value='';});
 document.getElementById('featureChannelWallpaperInput').addEventListener('change',e=>{if(e.target.files[0])uploadChannelWallpaper(e.target.files[0]);e.target.value='';});
}

async function loadImperialRole(){
 const {data,error}=await db.from('app_user_roles').select('role').eq('user_id',currentUser.id).maybeSingle();
 if(error){console.warn('Роль пользователя не загружена:',error.message);return;}
 IMPERIAL_FEATURES.admin=data?.role==='superadmin';
}

async function loadImperialProfileExtras(){
 if(!currentProfile)return;
 const {data,error}=await db.from('profiles').select('name_color,member_number,avatar_path').eq('id',currentUser.id).maybeSingle();
 if(error){console.warn('Дополнительные поля профиля не загружены:',error.message);return;}
 if(data){currentProfile={...currentProfile,...data};IMPERIAL_FEATURES.memberNumber=data.member_number??null;}
}

async function loadNotificationBadge(){
 const {count,error}=await db.from('app_notifications').select('id',{count:'exact',head:true}).eq('user_id',currentUser.id).eq('is_read',false);
 if(!error)IMPERIAL_FEATURES.notificationCount=count||0;
 const more=document.getElementById('tabMore');
 if(more)more.innerHTML='Ещё'+(IMPERIAL_FEATURES.notificationCount?`<span class="feature-count">${IMPERIAL_FEATURES.notificationCount}</span>`:'');
}

let imperialFeatureStartupDone=false;
async function featureStartup(){
 if(imperialFeatureStartupDone)return;imperialFeatureStartupDone=true;
 injectFeatureStyles();injectFeatureNavigation();injectFeatureTools();
 await loadImperialRole();await loadImperialProfileExtras();await loadNotificationBadge();
 // Halloween offer is displayed after the one-time welcome by the final onboarding layer.
}

function showHalloweenWelcomeOnce(){
 if(!currentUser || localStorage.getItem('imperial_halloween_offer_seen_v1'))return;
 localStorage.setItem('imperial_halloween_offer_seen_v1','1');
 showModal(`<h2 class="modal-title">🎃 Особая тема к Хэллоуину</h2><p>Опробуйте хэллоуинскую тему мессенджера в честь приближения праздника!</p><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Пропустить</button><button class="primary-btn" onclick="changeTheme('halloween');closeModal()">Включить тему</button></div>`);
}

function openImperialCabinet(){
 showModal(`<h2 class="modal-title">⚜ Имперский кабинет</h2><p class="muted">Дополнительные разделы и инструменты мессенджера.</p>
 <div class="feature-grid">
 <button class="feature-tile" onclick="openBulletinBoard()"><b>📜 ${ft('bulletin')}</b><small>Объявления и поиск единомышленников</small></button>
 <button class="feature-tile" onclick="openNotifications()"><b>🔔 ${ft('notifications')} ${IMPERIAL_FEATURES.notificationCount?`<span class="feature-count">${IMPERIAL_FEATURES.notificationCount}</span>`:''}</b><small>События мессенджера</small></button>
 <button class="feature-tile" onclick="openAchievements()"><b>🏅 ${ft('achievements')}</b><small>Награды пользователя</small></button>
 <button class="feature-tile" onclick="openMemberCard()"><b>🪪 ${ft('memberCard')}</b><small>Ваш номер участника</small></button>
 <button class="feature-tile" onclick="openPersonalWallpaper()"><b>🖼 ${ft('wallpaper')}</b><small>Персональное оформление чата</small></button>
 <button class="feature-tile" onclick="openReportForm()"><b>⚑ ${ft('report')}</b><small>Сообщить о нарушении</small></button>
 </div>
 ${isImperator()?'<button class="action-btn" style="width:100%" onclick="openModeration()">⚖ Панель Императора</button>':''}
 <button class="primary-btn" style="width:100%;margin-top:10px" onclick="closeModal()">Закрыть</button>`);
}

async function openMemberCard(){
 const {data,error}=await db.from('profiles').select('username,display_name,member_number,created_at,name_color').eq('id',currentUser.id).maybeSingle();
 if(error)return featureError('Не удалось открыть удостоверение',error);
 const p=data||currentProfile||{};
 const created=p.created_at?new Date(p.created_at).toLocaleDateString():'—';
 showModal(`<h2 class="modal-title">🪪 Имперское удостоверение</h2><div class="member-id"><span class="seal">⚜</span><div class="serial">RIM · MEMBER</div><h2 style="color:var(--gold2);margin:12px 0 5px">${esc(p.display_name||p.username||'Участник')}</h2><div>@${esc(p.username||'')}</div><hr style="border-color:var(--border);margin:14px 0"><div class="serial">НОМЕР УЧАСТНИКА</div><div style="font-size:23px;font-weight:bold;margin:5px 0">${p.member_number??'Не присвоен'}</div><div class="feature-small">В системе с ${created}</div><div style="margin-top:14px;color:var(--gold2);font-size:11px;letter-spacing:2px">РУССКИЙ ИМПЕРАТОРСКИЙ МЕССЕНДЖЕР</div></div><button class="primary-btn" style="width:100%;margin-top:12px" onclick="closeModal()">Закрыть</button>`);
}

async function openAchievements(){
 const {data,error}=await db.from('user_achievements').select('awarded_at,achievements(id,code,title,description,icon)').eq('user_id',currentUser.id).order('awarded_at',{ascending:false});
 if(error)return featureError('Не удалось загрузить достижения',error);
 const rows=data||[];
 const html=rows.map(x=>{const a=x.achievements||{};return `<div class="achievement"><div class="achievement-icon">${esc(a.icon||'🏅')}</div><div><b>${esc(a.title||a.code||'Достижение')}</b><div class="feature-small">${esc(a.description||'')} · ${formatDate(x.awarded_at)}</div></div></div>`;}).join('');
 showModal(`<h2 class="modal-title">🏅 Достижения</h2>${html||'<div class="empty-state">Пока нет полученных достижений.</div>'}<button class="primary-btn" style="width:100%;margin-top:12px" onclick="closeModal()">Закрыть</button>`);
}

async function openNotifications(){
 const {data,error}=await db.from('app_notifications').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(60);
 if(error)return featureError('Не удалось загрузить уведомления',error);
 const rows=data||[];
 const html=rows.map(n=>`<div class="feature-comment" style="opacity:${n.is_read?'.65':'1'}"><b>${esc(n.title)}</b><div style="font-size:13px;margin:4px 0">${esc(n.body||'')}</div><div class="feature-small">${formatDate(n.created_at)} ${formatTime(n.created_at)}</div>${!n.is_read?`<div class="feature-actions"><button class="action-btn" onclick="markNotificationRead('${n.id}')">Отметить прочитанным</button></div>`:''}</div>`).join('');
 showModal(`<h2 class="modal-title">🔔 Уведомления</h2>${html||'<div class="empty-state">Новых уведомлений пока нет.</div>'}<button class="action-btn" style="width:100%;margin-top:8px" onclick="markAllNotificationsRead()">Отметить всё прочитанным</button><button class="primary-btn" style="width:100%;margin-top:8px" onclick="closeModal()">Закрыть</button>`);
}

async function markNotificationRead(id){const {error}=await db.from('app_notifications').update({is_read:true}).eq('id',id).eq('user_id',currentUser.id);if(error)return featureError('Ошибка обновления',error);await loadNotificationBadge();openNotifications();}
async function markAllNotificationsRead(){const {error}=await db.from('app_notifications').update({is_read:true}).eq('user_id',currentUser.id);if(error)return featureError('Ошибка обновления',error);await loadNotificationBadge();openNotifications();}

async function openBulletinBoard(){
 const {data,error}=await db.from('bulletin_posts').select('*').order('created_at',{ascending:false}).limit(80);
 if(error)return featureError('Не удалось загрузить доску объявлений',error);
 const rows=data||[];
 const html=rows.map(p=>`<div class="card"><b>${esc(p.title)}</b><div style="white-space:pre-wrap;margin:7px 0">${esc(p.body)}</div><div class="feature-small">${formatDate(p.created_at)} · ${p.status==='approved'?'Опубликовано':p.author_id===currentUser.id?'На модерации':'Статус недоступен'}</div>${p.author_id===currentUser.id||isImperator()?`<div class="feature-actions">${isImperator()&&p.status==='pending'?`<button class="primary-btn" onclick="moderateBulletin('${p.id}','approved')">Одобрить</button><button class="action-btn danger-btn" onclick="moderateBulletin('${p.id}','rejected')">Отклонить</button>`:''}${p.author_id===currentUser.id||isImperator()?`<button class="action-btn danger-btn" onclick="deleteBulletin('${p.id}')">Удалить</button>`:''}</div>`:''}</div>`).join('');
 showModal(`<h2 class="modal-title">📜 Имперская доска объявлений</h2><div class="feature-banner">Запрещены мошеннические объявления. Разрешены приглашения в каналы и поиск людей с общими интересами. Это временная бесплатная возможность — не стоит привыкать к бесплатному сервису.</div><button class="primary-btn" style="width:100%;margin-bottom:10px" onclick="createBulletinPrompt()">＋ Разместить объявление</button>${html||'<div class="empty-state">Объявлений пока нет.</div>'}<button class="action-btn" style="width:100%" onclick="closeModal()">Закрыть</button>`);
}

async function createBulletinPrompt(){
 const title=prompt('Заголовок объявления:');if(!title?.trim())return;
 const body=prompt('Текст объявления:');if(!body?.trim())return;
 const {error}=await db.from('bulletin_posts').insert({author_id:currentUser.id,title:title.trim(),body:body.trim(),status:'pending'});
 if(error)return featureError('Не удалось отправить объявление',error);
 toast('Объявление отправлено на модерацию.');openBulletinBoard();
}
async function moderateBulletin(id,status){if(!isImperator())return toast('Недостаточно прав.');const {error}=await db.from('bulletin_posts').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return featureError('Не удалось изменить статус',error);openBulletinBoard();}
async function deleteBulletin(id){if(!confirm('Удалить объявление?'))return;const {error}=await db.from('bulletin_posts').delete().eq('id',id);if(error)return featureError('Не удалось удалить объявление',error);openBulletinBoard();}

function openReportForm(prefill={}){
 showModal(`<h2 class="modal-title">⚑ Жалоба</h2><label class="field-label">На кого жалоба (username)</label><input class="field" id="reportUsername" value="${esc(prefill.username||'')}" placeholder="username"><label class="field-label">Причина</label><select class="field" id="reportReason"><option value="spam">Спам</option><option value="harassment">Оскорбления или травля</option><option value="scam">Мошенничество</option><option value="inappropriate">Недопустимый контент</option><option value="other">Другое</option></select><label class="field-label">Подробности</label><textarea class="field" id="reportDetails" rows="4" placeholder="Опиши проблему"></textarea><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Отмена</button><button class="primary-btn" onclick="submitReport()">Отправить</button></div>`);
}
async function submitReport(){
 const username=document.getElementById('reportUsername').value.trim().replace(/^@/,'');const reason=document.getElementById('reportReason').value;const details=document.getElementById('reportDetails').value.trim();
 if(!details)return toast('Добавь подробности жалобы.');
 if(!username)return toast('Укажи username пользователя, на которого подаёшь жалобу.');
 let target=null;if(username){const {data}=await db.from('profiles').select('id').eq('username',username).maybeSingle();if(!data)return toast('Пользователь не найден.');target=data.id;}
 const payload={reporter_id:currentUser.id,reported_user_id:target,reason,details};
 const {error}=await db.from('user_reports').insert(payload);
 if(error)return featureError('Не удалось отправить жалобу',error);
 closeModal();toast('Жалоба отправлена модераторам.');
}

async function openModeration(){
 if(!isImperator())return toast('Недостаточно прав.');
 const [{data:reports,error:rErr},{data:posts,error:pErr}]=await Promise.all([
  db.from('user_reports').select('*').order('created_at',{ascending:false}).limit(50),
  db.from('bulletin_posts').select('*').eq('status','pending').order('created_at',{ascending:false}).limit(50)
 ]);
 if(rErr)return featureError('Не удалось загрузить жалобы',rErr);if(pErr)return featureError('Не удалось загрузить объявления',pErr);
 const rh=(reports||[]).map(r=>`<div class="feature-comment"><b>${esc(r.reason)}</b><div>${esc(r.details||'')}</div><div class="feature-small">${formatDate(r.created_at)} · ${esc(r.status)}</div><button class="action-btn" onclick="resolveReport('${r.id}')">Закрыть жалобу</button></div>`).join('');
 const ph=(posts||[]).map(p=>`<div class="feature-comment"><b>${esc(p.title)}</b><div>${esc(p.body)}</div><div class="feature-actions"><button class="primary-btn" onclick="moderateBulletin('${p.id}','approved')">Одобрить</button><button class="action-btn danger-btn" onclick="moderateBulletin('${p.id}','rejected')">Отклонить</button></div></div>`).join('');
 showModal(`<h2 class="modal-title">⚖ Панель Императора</h2><h3>Жалобы</h3>${rh||'<p class="muted">Нет жалоб.</p>'}<h3>Объявления на проверке</h3>${ph||'<p class="muted">Нет объявлений.</p>'}<button class="primary-btn" style="width:100%;margin-top:10px" onclick="closeModal()">Закрыть</button>`);
}
async function resolveReport(id){if(!isImperator())return;const {error}=await db.from('user_reports').update({status:'resolved'}).eq('id',id);if(error)return featureError('Не удалось закрыть жалобу',error);openModeration();}

async function openPersonalWallpaper(){
 const {data,error}=await db.from('user_wallpaper_settings').select('*').eq('user_id',currentUser.id).maybeSingle();
 if(error)return featureError('Не удалось загрузить настройки обоев',error);
 const p=data||{};
 showModal(`<h2 class="modal-title">🖼 Персональные обои</h2><p class="muted">Персональные обои видны только тебе. Если отключить общие обои канала, будет использоваться твой собственный фон.</p><div class="settings-row"><span>Использовать общие обои канала</span><input type="checkbox" id="sharedWallpaperToggle" ${p.shared_wallpaper_enabled!==false?'checked':''}></div><div class="feature-small">${p.personal_wallpaper_path?'Персональные обои загружены.':'Персональные обои не установлены.'}</div><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button><button class="primary-btn" onclick="saveWallpaperPreference()">Сохранить</button></div><button class="action-btn" style="width:100%;margin-top:8px" onclick="document.getElementById('featureWallpaperInput').click()">Загрузить свои обои</button>${p.personal_wallpaper_path?'<button class="action-btn danger-btn" style="width:100%;margin-top:8px" onclick="removePersonalWallpaper()">Удалить персональные обои</button>':''}`);
}
async function saveWallpaperPreference(){const enabled=document.getElementById('sharedWallpaperToggle').checked;const {error}=await db.from('user_wallpaper_settings').upsert({user_id:currentUser.id,shared_wallpaper_enabled:enabled,updated_at:new Date().toISOString()});if(error)return featureError('Не удалось сохранить настройку',error);toast('Настройка сохранена.');closeModal();}
async function uploadPersonalWallpaper(file){if(file.size>8*1024*1024)return toast('Максимальный размер обоев — 8 МБ.');const path=currentUser.id+'/wallpaper-'+crypto.randomUUID()+'.'+safeFileExt(file);const {error:upErr}=await db.storage.from('chat-files').upload(path,file,{upsert:false});if(upErr)return featureError('Не удалось загрузить обои',upErr);const {error}=await db.from('user_wallpaper_settings').upsert({user_id:currentUser.id,personal_wallpaper_path:path,updated_at:new Date().toISOString()});if(error)return featureError('Файл загружен, но настройки не сохранены',error);toast('Персональные обои сохранены.');openPersonalWallpaper();}
async function removePersonalWallpaper(){const {error}=await db.from('user_wallpaper_settings').upsert({user_id:currentUser.id,personal_wallpaper_path:null,updated_at:new Date().toISOString()});if(error)return featureError('Не удалось удалить настройку',error);toast('Персональные обои удалены.');openPersonalWallpaper();}

async function uploadChannelWallpaper(file){if(!currentChannel)return toast('Сначала открой канал.');if(currentChannel.owner_id!==currentUser.id&&!isImperator())return toast('Менять обои канала может только владелец.');if(file.size>8*1024*1024)return toast('Максимальный размер — 8 МБ.');const path=currentUser.id+'/channels/'+currentChannel.id+'/'+crypto.randomUUID()+'.'+safeFileExt(file);const {error:upErr}=await db.storage.from('chat-files').upload(path,file,{upsert:false});if(upErr)return featureError('Не удалось загрузить обои канала',upErr);const {error}=await db.from('channel_wallpapers').upsert({channel_id:currentChannel.id,wallpaper_path:path,updated_by:currentUser.id,updated_at:new Date().toISOString()});if(error)return featureError('Не удалось сохранить обои канала',error);toast('Общие обои канала обновлены.');openChannel(currentChannel.id);}

async function pinMessage(messageId){if(!activeConversation)return;const {error}=await db.from('message_pins').upsert({user_id:currentUser.id,conversation_id:activeConversation.id,message_id:messageId},{onConflict:'user_id,message_id'});if(error)return featureError('Не удалось закрепить сообщение',error);toast('Сообщение сохранено в закреплённом.');}
async function unpinMessage(messageId){const {error}=await db.from('message_pins').delete().eq('user_id',currentUser.id).eq('message_id',messageId);if(error)return featureError('Не удалось убрать закрепление',error);toast('Закрепление удалено.');}
async function openPinnedMessages(){if(!activeConversation)return;const {data,error}=await db.from('message_pins').select('message_id,created_at,chat_messages(id,body,sticker_id,created_at)').eq('user_id',currentUser.id).eq('conversation_id',activeConversation.id).order('created_at',{ascending:false});if(error)return featureError('Не удалось загрузить закреплённое',error);const html=(data||[]).map(x=>`<div class="feature-comment"><div>${esc(x.chat_messages?.body||x.chat_messages?.sticker_id||'Вложение')}</div><div class="feature-actions"><button class="action-btn" onclick="jumpToMessage('${x.message_id}')">Перейти</button><button class="action-btn danger-btn" onclick="unpinMessage('${x.message_id}');openPinnedMessages()">Убрать</button></div></div>`).join('');showModal(`<h2 class="modal-title">📌 Закреплённые сообщения</h2>${html||'<div class="empty-state">Нет закреплённых сообщений.</div>'}<button class="primary-btn" style="width:100%" onclick="closeModal()">Закрыть</button>`);}
function jumpToMessage(id){closeModal();const el=document.querySelector(`[data-id="${CSS.escape(id)}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('message-pinned');setTimeout(()=>el.classList.remove('message-pinned'),1800);}else toast('Сообщение не загружено в текущем списке.');}

async function markConversationRead(){if(typeof window.markConversationRead==='function'&&window.markConversationRead!==markConversationRead)return window.markConversationRead();if(!activeConversation||!messagesCache.length)return;const last=messagesCache[messagesCache.length-1];const {error}=await db.from('conversation_read_state').upsert({user_id:currentUser.id,conversation_id:activeConversation.id,last_read_message_id:last.id,last_read_at:last.created_at||new Date().toISOString()},{onConflict:'user_id,conversation_id'});if(error)console.warn('Не удалось отметить переписку прочитанной:',error.message);}

async function loadChannelComments(postId){const {data,error}=await db.from('channel_post_comments').select('*').eq('post_id',postId).order('created_at',{ascending:true}).limit(100);if(error)return `<div class="feature-small">Комментарии временно недоступны.</div>`;const rows=data||[];const profiles=await getProfiles(rows.map(x=>x.author_id));return rows.map(c=>`<div class="feature-comment"><b>${esc(profiles[c.author_id]?.display_name||profiles[c.author_id]?.username||'Участник')}</b><div>${esc(c.body)}</div><div class="feature-small">${formatDate(c.created_at)} ${formatTime(c.created_at)}</div><button class="action-btn" onclick="openReportForm({commentId:'${c.id}',channelId:'${currentChannel.id}'})">⚑ Пожаловаться</button></div>`).join('')||'<div class="feature-small">Комментариев пока нет.</div>';}
async function addChannelComment(postId){const channel=currentChannel,user=currentUser,body=prompt('Текст комментария:');if(!body?.trim()||!channel?.id||!user?.id)return;if(typeof window.__rimCanPerformPlaintextChannelOperation!=='function'||!(await window.__rimCanPerformPlaintextChannelOperation('comment',channel)))return;if(String(currentUser?.id||'')!==String(user.id)||String(currentChannel?.id||'')!==String(channel.id))return toast('Операция отменена: аккаунт или канал изменился.');const {error}=await db.from('channel_post_comments').insert({post_id:postId,channel_id:channel.id,author_id:user.id,body:body.trim()});if(error)return featureError('Не удалось добавить комментарий',error);toast('Комментарий опубликован.');openChannel(channel.id);}

async function updateProfileColor(color){if(!/^#[0-9a-fA-F]{6}$/.test(color))return toast('Неверный цвет.');const {data,error}=await db.from('profiles').update({name_color:color}).eq('id',currentUser.id).select().single();if(error)return featureError('Не удалось изменить цвет имени',error);currentProfile={...currentProfile,...data};toast('Цвет имени изменён.');}

async function updateChannelUsername(channelId,username){const value=username.trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(value))return toast('Username: 3–24 символа, латинские буквы, цифры и _.');if(!currentChannel||currentChannel.id!==channelId||(currentChannel.owner_id!==currentUser.id&&!isImperator()))return toast('Недостаточно прав.');const {error}=await db.from('channels').update({username:value}).eq('id',channelId);if(error)return featureError('Не удалось изменить username канала',error);toast('Username канала сохранён.');openChannel(channelId);}

async function editChannel(){if(!currentChannel||currentChannel.owner_id!==currentUser.id&&!isImperator())return toast('Недостаточно прав.');const title=prompt('Название канала:',currentChannel.title);if(title===null||!title.trim())return;const description=prompt('Описание:',currentChannel.description||'');if(description===null)return;const {error}=await db.from('channels').update({title:title.trim(),description}).eq('id',currentChannel.id);if(error)return featureError('Не удалось изменить канал',error);toast('Канал обновлён.');openChannel(currentChannel.id);}
async function deleteChannel(){if(!currentChannel||currentChannel.owner_id!==currentUser.id&&!isImperator())return toast('Недостаточно прав.');if(!confirm('Удалить канал и его публикации?'))return;const id=currentChannel.id;const {error}=await db.from('channels').delete().eq('id',id);if(error)return featureError('Не удалось удалить канал',error);currentChannel=null;closeModal();await loadChannels();toast('Канал удалён.');}

async function editChannelPost(postId,oldBody){if(!currentChannel||(currentChannel.owner_id!==currentUser.id&&!isImperator()))return toast('Недостаточно прав.');const body=prompt('Изменить публикацию:',oldBody||'');if(body===null||!body.trim())return;const {error}=await db.from('channel_posts').update({body:body.trim(),edited_at:new Date().toISOString()}).eq('id',postId);if(error)return featureError('Не удалось изменить публикацию',error);openChannel(currentChannel.id);}
async function deleteChannelPost(postId){if(!currentChannel||(currentChannel.owner_id!==currentUser.id&&!isImperator()))return toast('Недостаточно прав.');if(!confirm('Удалить публикацию?'))return;const {error}=await db.from('channel_posts').delete().eq('id',postId);if(error)return featureError('Не удалось удалить публикацию',error);openChannel(currentChannel.id);}

async function createChannelEnhanced(){
 const title=prompt('Название канала:');if(!title?.trim())return;
 const description=prompt('Описание канала:')||'';
 const username=prompt('Короткий username канала (латиница, цифры, _), можно оставить пустым:')||'';
 if(username.trim()&&!/^[a-zA-Z0-9_]{3,24}$/.test(username.trim()))return toast('Username должен содержать 3–24 символа: латиница, цифры, _.');
 const isPublic=confirm('Сделать канал публичным?');
 const payload={title:title.trim(),description,owner_id:currentUser.id,is_public:isPublic};if(username.trim())payload.username=username.trim().toLowerCase();
 const {data,error}=await db.from('channels').insert(payload).select().single();if(error)return featureError('Ошибка создания канала',error);
 const {error:memberError}=await db.from('channel_members').upsert({channel_id:data.id,user_id:currentUser.id,role:'admin'});
 if(memberError)console.warn('Канал создан, но запись владельца в участниках не добавлена:',memberError.message);
 await loadChannels();toast('Канал создан.');openChannel(data.id);
}

async function subscribePushLocally(){
 if(!('Notification' in window))return toast('Этот браузер не поддерживает уведомления.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')return toast('Разрешение на уведомления не предоставлено.');
 const {error}=await db.from('notification_preferences').upsert({user_id:currentUser.id,push_enabled:true,updated_at:new Date().toISOString()});
 if(error)return featureError('Не удалось сохранить настройку',error);
 toast('Разрешение включено. Для настоящих push-уведомлений нужна серверная отправка и VAPID-ключи.');
}

async function openNotificationSettings(){
 const {data,error}=await db.from('notification_preferences').select('*').eq('user_id',currentUser.id).maybeSingle();if(error)return featureError('Не удалось загрузить настройки',error);const p=data||{};
 const fields=[['messages_enabled','Личные сообщения'],['channel_posts_enabled','Публикации каналов'],['comments_enabled','Комментарии'],['reactions_enabled','Реакции'],['announcements_enabled','Объявления']];
 showModal(`<h2 class="modal-title">Настройки уведомлений</h2>${fields.map(([k,label])=>`<div class="settings-row"><span>${label}</span><input type="checkbox" id="np_${k}" ${p[k]!==false?'checked':''}></div>`).join('')}<div class="feature-small">Push на телефон требует отдельной серверной отправки.</div><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Отмена</button><button class="primary-btn" onclick="saveNotificationSettings()">Сохранить</button></div><button class="action-btn" style="width:100%;margin-top:8px" onclick="subscribePushLocally()">Разрешить уведомления браузера</button>`);
}
async function saveNotificationSettings(){const keys=['messages_enabled','channel_posts_enabled','comments_enabled','reactions_enabled','announcements_enabled'];const payload={user_id:currentUser.id,updated_at:new Date().toISOString()};keys.forEach(k=>payload[k]=document.getElementById('np_'+k).checked);const {error}=await db.from('notification_preferences').upsert(payload);if(error)return featureError('Не удалось сохранить настройки',error);toast('Настройки уведомлений сохранены.');closeModal();}

// Preserve original app initialization, then load the additional features.
const originalInitializeApp = initializeApp;
initializeApp = async function(){
 await originalInitializeApp();
 if(currentUser){
  try{await featureStartup();}catch(error){console.error('Feature startup:',error);}
 }
};

// Theme and language extensions.
const originalApplyTheme = applyTheme;
applyTheme = function(){
 if(!['imperial','dark','light','halloween'].includes(currentTheme))currentTheme='imperial';
 document.body.dataset.theme=currentTheme;
 const colors={imperial:'#17130e',dark:'#101216',light:'#f1f2f5',halloween:'#171019'};
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[currentTheme]);
};
const originalOpenSettings = openSettings;
openSettings = function(){
 showModal(`<h2 class="modal-title">Настройки</h2><div class="settings-row"><span>Оформление</span><select id="themeSelect" onchange="changeTheme(this.value)"><option value="imperial" ${currentTheme==='imperial'?'selected':''}>Имперская</option><option value="dark" ${currentTheme==='dark'?'selected':''}>Тёмная</option><option value="light" ${currentTheme==='light'?'selected':''}>Светлая</option><option value="halloween" ${currentTheme==='halloween'?'selected':''}>Хэллоуинская 🎃</option></select></div><div class="settings-row"><span>Язык</span><select id="languageSelect" onchange="changeLanguage(this.value)"><option value="ru" ${currentLanguage==='ru'?'selected':''}>Русский</option><option value="be" ${currentLanguage==='be'?'selected':''}>Беларуская</option><option value="pl" ${currentLanguage==='pl'?'selected':''}>Polski</option><option value="fi" ${currentLanguage==='fi'?'selected':''}>Suomi</option><option value="zh" disabled>中文 — в разработке</option><option value="en" ${currentLanguage==='en'?'selected':''}>English</option></select></div><div class="settings-row"><span>Уведомления</span><button class="action-btn" onclick="openNotificationSettings()">Настроить</button></div><button class="primary-btn" style="width:100%;margin-top:12px" onclick="closeModal()">Готово</button>`);
};
changeTheme = async function(value){if(!['imperial','dark','light','halloween'].includes(value))return;currentTheme=value;applyTheme();await saveSettings();};
changeLanguage = async function(value){if(!['ru','be','pl','fi','en'].includes(value))return;currentLanguage=value;applyLanguage();await saveSettings();};

// Profile: includes member number, display colour, correct avatar_path/avatar_url handling.
openProfile = async function(){
 const {data,error}=await db.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();if(error)return featureError('Не удалось загрузить профиль',error);currentProfile={...currentProfile,...(data||{})};
 const p=currentProfile||{};let avatar=p.avatar_url||'';
 if(p.avatar_path){const {data:signed}=await db.storage.from('avatars').createSignedUrl(p.avatar_path,3600);if(signed?.signedUrl)avatar=signed.signedUrl;}
 showModal(`<h2 class="modal-title">Мой профиль</h2><div class="profile-block"><div class="avatar profile-avatar">${avatar?`<img src="${esc(avatar)}">`:esc(initials(p.display_name||p.username))}</div><div><strong>${esc(p.display_name||'Пользователь')}</strong><div class="muted">@${esc(p.username||'')}</div><div class="feature-small">${isImperator()?'⚜ Император':`Участник № ${p.member_number??'—'}`}</div></div></div><label class="field-label">Отображаемое имя</label><input class="field" id="editDisplayName" value="${esc(p.display_name||'')}"><label class="field-label">Username</label><input class="field" id="editUsername" value="${esc(p.username||'')}"><label class="field-label">О себе</label><textarea class="field" id="editBio" rows="3">${esc(p.bio||'')}</textarea><label class="field-label">Цвет имени</label><div class="row"><input type="color" id="editNameColor" value="${/^#[0-9a-fA-F]{6}$/.test(p.name_color||'')?p.name_color:'#c9a45d'}"><span class="feature-small">Цвет будет отображаться рядом с твоими сообщениями.</span></div><label class="field-label">Аватар</label><input class="field" type="file" id="avatarFile" accept="image/*"><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button><button class="primary-btn" onclick="saveProfileEnhanced()">Сохранить</button></div><button class="action-btn" style="width:100%;margin-top:8px" onclick="openMemberCard()">Открыть удостоверение</button><button class="action-btn danger-btn" style="width:100%;margin-top:8px" onclick="signOut()">Выйти из аккаунта</button>`);
};
async function saveProfileEnhanced(){
 const display_name=document.getElementById('editDisplayName').value.trim();const username=document.getElementById('editUsername').value.trim().toLowerCase();const bio=document.getElementById('editBio').value.trim();const name_color=document.getElementById('editNameColor').value;const file=document.getElementById('avatarFile').files[0];
 if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))return toast('Username должен содержать 3–24 символа: латиница, цифры, _.');
 const patch={display_name,username,bio,name_color};
 if(file){if(file.size>3*1024*1024)return toast('Аватар должен быть не больше 3 МБ.');const path=currentUser.id+'/'+crypto.randomUUID()+'.'+safeFileExt(file);const {error:upErr}=await db.storage.from('avatars').upload(path,file,{upsert:false});if(upErr)return featureError('Ошибка загрузки аватара',upErr);patch.avatar_path=path;}
 const {data,error}=await db.from('profiles').update(patch).eq('id',currentUser.id).select().single();if(error)return featureError('Ошибка сохранения профиля',error);currentProfile={...currentProfile,...data};closeModal();toast('Профиль сохранён.');await loadConversations();
}

// Add display name instead of generic 

// Replace generic direct-chat labels when peer metadata is available.
const originalConversationTitle=conversationTitle;
conversationTitle=function(chat){
 if(chat.title)return chat.title;
 if(chat.type==='direct'&&chat.other_profile)return chat.other_profile.display_name||chat.other_profile.username||'Личная переписка';
 return chat.type==='direct'?'Личная переписка':'Групповая беседа';
};
const originalGetProfiles=getProfiles;
getProfiles=async function(ids){
 const unique=[...new Set(ids.filter(Boolean))];
 if(!unique.length)return {};
 const {data}=await db.from('profiles').select('id,username,display_name,avatar_url,avatar_path,name_color,member_number').in('id',unique);
 const result={};await Promise.all((data||[]).map(async p=>{if(p.avatar_path){const {data:signed}=await db.storage.from('avatars').createSignedUrl(p.avatar_path,1800);if(signed?.signedUrl)p.avatar_display_url=signed.signedUrl;}result[p.id]=p;}));return result;
};

// Message renderer extension: pin controls and complaint shortcut.
const baseRenderMessages=renderMessages;
if(window.__RIM_MESSAGE_DECORATIONS_OWNED||window.__RIM_MESSAGE_LIST_RENDERER_OWNED){
  // Modular renderMessages wrap + decorations own post-render chrome.
}else renderMessages=async function(){
 await baseRenderMessages();
 document.querySelectorAll('.message[data-id]').forEach(el=>{
  const id=el.dataset.id;const actions=el.querySelector('.message-actions');
  if(!actions||actions.querySelector('[data-pin-action]'))return;
  const pin=document.createElement('button');pin.textContent='📌';pin.title='Сохранить в закреплённом';pin.dataset.pinAction='1';pin.onclick=()=>pinMessage(id);actions.appendChild(pin);
  if(!el.classList.contains('mine')){const report=document.createElement('button');report.textContent='⚑';report.title='Пожаловаться';report.onclick=async()=>{const m=messagesCache.find(x=>x.id===id);const ps=await getProfiles(m?[m.sender_id]:[]);openReportForm({username:ps[m?.sender_id]?.username||''});};actions.appendChild(report);}
 });
 await markConversationRead();
};

// Open chat: add a pinned-message shortcut.
// Skip when modular conversation shell owns chrome (__RIM_CONVERSATION_SHELL_OWNED).
const baseOpenConversation=openConversation;
if(window.__RIM_OPEN_CONVERSATION_OWNED||typeof window.__RIM_MODULAR_OPEN_IMPL==='function'){
  // Modular open + afterOpen already mark read and shell/pinned chrome.
}else openConversation=async function(id){
 await baseOpenConversation(id);await markConversationRead();
 if(window.__RIM_CONVERSATION_SHELL_OWNED)return;
 const head=document.querySelector('.chat-head');
 if(head&&!document.getElementById('pinnedShortcut')){const b=document.createElement('button');b.id='pinnedShortcut';b.className='icon-btn';b.textContent='📌';b.title='Закреплённые';b.onclick=openPinnedMessages;head.appendChild(b);}
};

// Enhanced channel creation and management.
createChannel=createChannelEnhanced;
if(window.__RIM_CHANNEL_FEED_OWNED){/* modular channel feed owns openChannel */}else openChannel=async function(id){
 const {data:channel,error}=await db.from('channels').select('*').eq('id',id).single();
 if(error)return featureError('Не удалось открыть канал',error);
 currentChannel=channel;
 const {data:posts,error:postError}=await db.from('channel_posts').select('*').eq('channel_id',id).order('created_at',{ascending:false}).limit(100);
 if(postError)return featureError('Не удалось загрузить публикации',postError);
 const canManage=channel.owner_id===currentUser.id||isImperator();
 const pref=await db.from('user_wallpaper_settings').select('shared_wallpaper_enabled').eq('user_id',currentUser.id).maybeSingle();
 const wallpaper=await db.from('channel_wallpapers').select('wallpaper_path').eq('channel_id',id).maybeSingle();
 let wallpaperHtml='';
 if(wallpaper.data?.wallpaper_path&&pref.data?.shared_wallpaper_enabled!==false){const {data:s}=await db.storage.from('chat-files').createSignedUrl(wallpaper.data.wallpaper_path,3600);if(s?.signedUrl)wallpaperHtml=`<div class="feature-banner"><img src="${esc(s.signedUrl)}" alt="Обои канала">Общие обои канала</div>`;}
 const postParts=[];
  const postIds=(posts||[]).map(p=>p.id);
  let commentsByPost={};
  if(postIds.length){
   const {data:commentRows,error:commentError}=await db.from('channel_post_comments').select('*').in('post_id',postIds).order('created_at',{ascending:true});
   if(commentError)console.warn('Комментарии не загружены:',commentError.message);
   const commentProfiles=await getProfiles((commentRows||[]).map(c=>c.author_id));
   (commentRows||[]).forEach(c=>{(commentsByPost[c.post_id] ||= []).push(c);});
   window.__channelCommentProfiles=commentProfiles;
  }
  for(const p of posts||[]){
   const comments=(commentsByPost[p.id]||[]).map(c=>`<div class="feature-comment"><b>${esc(window.__channelCommentProfiles?.[c.author_id]?.display_name||window.__channelCommentProfiles?.[c.author_id]?.username||'Участник')}</b><div>${esc(c.body)}</div><div class="feature-small">${formatDate(c.created_at)} ${formatTime(c.created_at)}</div><button class="action-btn" onclick="openReportForm({commentId:'${c.id}',channelId:'${currentChannel.id}'})">⚑ Пожаловаться</button></div>`).join('')||'<div class="feature-small">Комментариев пока нет.</div>';
   const editBody=JSON.stringify(p.body||'').replace(/</g,'\\u003c').replace(/'/g,'\\u0027');
   postParts.push(`<div class="card"><div style="white-space:pre-wrap">${esc(p.body||'')}</div><div class="muted" style="font-size:10px;margin-top:8px">${formatDate(p.created_at)} ${formatTime(p.created_at)} ${p.edited_at?'· изменено':''}</div><div class="row" style="margin-top:7px"><button class="action-btn" onclick="reactToPost('${p.id}','👍')">👍</button><button class="action-btn" onclick="reactToPost('${p.id}','❤️')">❤️</button><button class="action-btn" onclick="addChannelComment('${p.id}')">💬 Комментировать</button>${canManage?`<button class="action-btn" onclick='editChannelPost("${p.id}",${editBody})'>Изменить</button><button class="action-btn danger-btn" onclick="deleteChannelPost('${p.id}')">Удалить</button>`:''}</div><div style="margin-top:8px"><b class="feature-small">Комментарии</b>${comments}</div></div>`);
  }
 const postsHtml=postParts.join('');
 showModal(`<h2 class="modal-title">${esc(channel.title)}</h2><p class="muted">${esc(channel.description||'')}</p><div class="feature-small">${channel.username?'@'+esc(channel.username):'Без username'} · ${channel.is_public?'Публичный':'Закрытый'}</div>${wallpaperHtml}${canManage?`<div class="feature-actions"><button class="action-btn" onclick="editChannel()">✎ Редактировать</button><button class="action-btn" onclick="document.getElementById('featureChannelWallpaperInput').click()">🖼 Обои</button><button class="action-btn danger-btn" onclick="deleteChannel()">Удалить канал</button></div><button class="action-btn" style="width:100%;margin-top:7px" onclick="promptChannelUsername()">Изменить @username</button><textarea class="field" id="channelPostText" rows="3" placeholder="Новая публикация" style="margin-top:10px"></textarea><button class="primary-btn" style="width:100%;margin:8px 0" onclick="publishChannelPost()">Опубликовать</button>`:''}<h3>Публикации</h3><div style="max-height:48vh;overflow:auto">${postsHtml||'Публикаций пока нет.'}</div>${(posts||[]).length?`<div class="feature-ad"><img src="assets/images/image-18f99e7f725387ec.webp" alt="Заправка с надписью Нет и точка"><div class="feature-ad-caption">Здесь могла бы быть ваша реклама @imperator</div></div>`:''}<button class="action-btn" style="width:100%;margin-top:10px" onclick="closeModal()">Закрыть</button>`);
};
function promptChannelUsername(){if(!currentChannel)return;const value=prompt('Username канала (3–24 символа):',currentChannel.username||'');if(value!==null)updateChannelUsername(currentChannel.id,value);}

// Add feature shortcuts to chat information.
const oldOpenChatInfo=openChatInfo;
openChatInfo=async function(){
 if(window.__RIM_CHAT_INFO_OWNED){
  return typeof oldOpenChatInfo==='function'?oldOpenChatInfo():undefined;
 }
 if(!activeConversation)return;await oldOpenChatInfo();
 const modal=document.querySelector('#modalRoot .modal');
 if(modal&&!modal.querySelector('#chatFeatureActions')){const box=document.createElement('div');box.id='chatFeatureActions';box.innerHTML='<button class="action-btn" style="width:100%;margin-top:8px" onclick="openPinnedMessages()">📌 Закреплённые сообщения</button><button class="action-btn" style="width:100%;margin-top:8px" onclick="openPersonalWallpaper()">🖼 Мои обои</button>';modal.appendChild(box);}
};

// Load extended settings from the database.
const oldLoadSettings=loadSettings;
loadSettings=async function(){
 await oldLoadSettings();
 const {data}=await db.from('user_settings').select('theme,language').eq('user_id',currentUser.id).maybeSingle();
 if(data){if(['imperial','dark','light','halloween'].includes(data.theme))currentTheme=data.theme;if(['ru','be','pl','fi','en'].includes(data.language))currentLanguage=data.language;}
 applyTheme();
};

// Make feature navigation available after startup.
setTimeout(()=>{if(currentUser){featureStartup().catch(e=>console.error('Feature startup:',e));}},1200);


// Direct-peer resolution is owned by the modular ConversationListController.

// Colour the author's name using the profile's selected colour.
const featureRenderMessages=renderMessages;
renderMessages=async function(){
 await featureRenderMessages();
 try{
  const ids=messagesCache.map(m=>m.sender_id);
  const profiles=await getProfiles(ids);
  document.querySelectorAll('.message[data-id]').forEach(el=>{
   const message=messagesCache.find(m=>m.id===el.dataset.id);
   const author=el.querySelector('.message-author');
   const color=message&&profiles[message.sender_id]?.name_color;
   if(author&&/^#[0-9a-fA-F]{6}$/.test(color||''))author.style.color=color;
  });
 }catch(e){console.warn('Цвета имён не применены:',e.message);}
};

// Apply the user's personal wallpaper to the message canvas.
async function applyPersonalWallpaper(){
 try{
  const {data,error}=await db.from('user_wallpaper_settings').select('personal_wallpaper_path').eq('user_id',currentUser.id).maybeSingle();
  if(error||!data?.personal_wallpaper_path)return;
  const {data:signed}=await db.storage.from('chat-files').createSignedUrl(data.personal_wallpaper_path,3600);
  if(signed?.signedUrl){const box=document.getElementById('messages');box.style.backgroundImage=`linear-gradient(#17130e99,#17130e99),url("${signed.signedUrl}")`;box.style.backgroundSize='cover';box.style.backgroundPosition='center';}
 }catch(e){console.warn('Персональные обои не применены:',e.message);}
}
const priorFeatureStartup=featureStartup;
featureStartup=async function(){await priorFeatureStartup();await applyPersonalWallpaper();};


// Unread counters are owned by src/application/conversation-state-controller.js.

async function openMyMusic(){
 const {data,error}=await db.from('music_tracks').select('*').eq('user_id',currentUser.id).order('title');
 if(error)return featureError('Не удалось загрузить личную музыку',error);
 let html='';
 for(const t of data||[]){const {data:s}=await db.storage.from('music-library').createSignedUrl(t.file_path,3600);if(s?.signedUrl)html+=`<div class="feature-comment"><b>${esc(t.title)}</b><audio controls preload="none" src="${esc(s.signedUrl)}" style="width:100%;margin-top:7px"></audio></div>`;}
 showModal(`<h2 class="modal-title">🎵 Моя музыка</h2>${html||'<div class="empty-state">У тебя пока нет загруженных треков.</div>'}<button class="primary-btn" style="width:100%" onclick="closeModal();showSection('music')">Перейти к музыкальной библиотеке</button><button class="action-btn" style="width:100%;margin-top:8px" onclick="closeModal()">Закрыть</button>`);
}
const previousOpenProfile=openProfile;
openProfile=async function(){await previousOpenProfile();const modal=document.querySelector('#modalRoot .modal');if(modal&&!modal.querySelector('#myMusicShortcut')){const b=document.createElement('button');b.id='myMusicShortcut';b.className='action-btn';b.style.width='100%';b.style.marginTop='8px';b.textContent='🎵 Мои треки';b.onclick=openMyMusic;modal.appendChild(b);}};


/* =========================================================
   FINAL INTEGRATION FIXES
========================================================= */
const _renderConversationListFinal=renderConversationList;
renderConversationList=function(){
 _renderConversationListFinal();
 for(const c of conversations||[]){
  if(c.type!=='direct'||!c.other_profile)continue;
  const item=[...document.querySelectorAll('.chat-item')].find(x=>x.getAttribute('onclick')===`openConversation('${c.id}')`);
  const avatar=item?.querySelector('.avatar');
  const url=c.other_profile.avatar_display_url||c.other_profile.avatar_url;
  if(avatar&&url)avatar.innerHTML=`<img src="${esc(url)}" alt="Аватар" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
 }
};
const _openConversationFinal=openConversation;
openConversation=async function(id){
 await _openConversationFinal(id);
 const c=conversations.find(x=>x.id===id);
 if(c?.type==='direct'&&c.other_profile){
  const url=c.other_profile.avatar_display_url||c.other_profile.avatar_url;
  const av=document.getElementById('chatHeadAvatar');
  if(av&&url)av.innerHTML=`<img src="${esc(url)}" alt="Аватар" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
 }
};
async function findUserByName(username){
 const {data,error}=await db.from('profiles').select('id,username,display_name,bio,avatar_url,avatar_path,name_color,member_number').eq('username',username).maybeSingle();
 if(error||!data){toast('Пользователь не найден.');return;}
 let avatar=data.avatar_url||'';
 if(data.avatar_path){const {data:signed}=await db.storage.from('avatars').createSignedUrl(data.avatar_path,3600);if(signed?.signedUrl)avatar=signed.signedUrl;}
 const p={...data,avatar_url:avatar};
 showModal(`<h2 class="modal-title">Профиль пользователя</h2><div class="profile-block"><div class="avatar profile-avatar">${avatar?`<img src="${esc(avatar)}" alt="Аватар">`:esc(initials(p.display_name||p.username))}</div><div><strong style="${/^#[0-9a-fA-F]{6}$/.test(p.name_color||'')?`color:${p.name_color}`:''}">${esc(p.display_name||'Пользователь')}</strong><div class="muted">@${esc(p.username||'')}</div><div class="feature-small">${p.member_number?'Участник № '+p.member_number:''}</div></div></div><p>${esc(p.bio||'Пользователь пока не добавил описание.')}</p><div class="modal-actions"><button class="action-btn" onclick="closeModal()">Закрыть</button><button class="primary-btn" onclick="closeModal();startChatWith('${p.id}')">Написать</button></div><button class="action-btn danger-btn" style="width:100%;margin-top:8px" onclick="closeModal();openReportForm({username:'${esc(p.username||'')}'} )">Пожаловаться</button>`);
}
// Keep the profile shortcut and preserve the full user profile implementation above.
function showBrowserNotice(title,body){
 try{if(document.hidden&&'Notification'in window&&Notification.permission==='granted')new Notification(title,{body,icon:'/icons/icon-192.png'});}catch(e){console.warn('Browser notification:',e);}
}


/* Registration preferences: keep the selected language and theme even when email confirmation is required. */
const _signUpBeforePreferences=signUp;
signUp=async function(){
 const prefs={language:document.getElementById('signupLanguage')?.value||'ru',theme:document.getElementById('signupTheme')?.value||'imperial'};
 localStorage.setItem('imperial_signup_preferences_v1',JSON.stringify(prefs));
 await _signUpBeforePreferences();
 if(currentUser)await applyPendingSignupPreferences();
};
const _signInBeforePreferences=signIn;
signIn=async function(){
 await _signInBeforePreferences();
 if(currentUser)await applyPendingSignupPreferences();
};
async function applyPendingSignupPreferences(){
 let prefs;try{prefs=JSON.parse(localStorage.getItem('imperial_signup_preferences_v1')||'null');}catch(_){prefs=null;}
 if(!prefs)return;
 if(!['ru','be','pl','fi','en'].includes(prefs.language))prefs.language='ru';
 if(!['imperial','dark','light','halloween'].includes(prefs.theme))prefs.theme='imperial';
 const {error}=await db.from('user_settings').upsert({user_id:currentUser.id,language:prefs.language,theme:prefs.theme,updated_at:new Date().toISOString()});
 if(error){console.warn('Не удалось сохранить начальные настройки:',error.message);return;}
 currentLanguage=prefs.language;currentTheme=prefs.theme;applyLanguage();applyTheme();localStorage.removeItem('imperial_signup_preferences_v1');
}



/* =========================================================
   RELEASE REPAIR: runtime integration + public profile music
========================================================= */
// Preserve the Halloween theme when loading saved settings.
const _loadSettingsRelease = loadSettings;
loadSettings = async function(){
  const {data,error}=await db.from('user_settings').select('*').eq('user_id',currentUser.id).maybeSingle();
  if(error) console.warn('Settings:',error.message);
  if(data){
    currentTheme=['imperial','dark','light','halloween'].includes(data.theme)?data.theme:'imperial';
    currentLanguage=['ru','be','pl','fi','en'].includes(data.language)?data.language:'ru';
  }
  applyTheme(); applyLanguage();
};

// Public profile music: only public tracks are shown to visitors; own profile can manage tracks.
async function renderPublicProfileMusic(userId, isOwn=false){
  const q=db.from('music_tracks').select('id,user_id,title,artist,file_path,visibility,sort_order,created_at')
    .eq('user_id',userId).order('sort_order',{ascending:true}).order('created_at',{ascending:true});
  if(!isOwn) q.eq('visibility','public');
  const {data,error}=await q;
  if(error){console.warn('Profile music:',error.message);return `<section class="profile-music"><h3>${uiText('profileMusic')}</h3><p class="muted">${uiText('musicUnavailable')}</p></section>`;}
  let rows='';
  for(const t of data||[]){
    let url='';
    const {data:signed}=await db.storage.from('music-library').createSignedUrl(t.file_path,3600);
    if(signed?.signedUrl) url=signed.signedUrl;
    if(!url) continue;
    rows+=`<div class="feature-comment" data-profile-track="${esc(t.id)}"><b>${esc(t.title)}</b>${t.artist?`<div class="feature-small">${esc(t.artist)}</div>`:''}<audio controls preload="none" src="${esc(url)}" style="width:100%;margin-top:7px"></audio>${isOwn?`<div class="feature-actions"><button class="action-btn" onclick="toggleTrackVisibility('${esc(t.id)}','${t.visibility==='public'?'private':'public'}')">${t.visibility==='public'?uiText('makePrivate'):uiText('makePublic')}</button><button class="action-btn danger-btn" onclick="deleteProfileTrack('${esc(t.id)}','${esc(t.file_path)}')">${uiText('delete')}</button></div>`:''}</div>`;
  }
  return `<section class="profile-music"><h3>🎵 ${uiText('profileMusic')}</h3>${rows||`<p class="muted">${isOwn?uiText('noTracks'):uiText('noPublicTracks')}</p>`}</section>`;
}
async function toggleTrackVisibility(id,visibility){
  if(!['public','private'].includes(visibility))return;
  const {error}=await db.from('music_tracks').update({visibility}).eq('id',id).eq('user_id',currentUser.id);
  if(error)return featureError(uiText('musicUpdateError'),error);
  toast(uiText(visibility==='public'?'trackPublic':'trackPrivate'));
  openProfile();
}
async function deleteProfileTrack(id,path){
  if(!confirm(uiText('confirmDeleteTrack')))return;
  const {error:dbError}=await db.from('music_tracks').delete().eq('id',id).eq('user_id',currentUser.id);
  if(dbError)return featureError(uiText('musicDeleteError'),dbError);
  const {error:storageError}=await db.storage.from('music-library').remove([path]);
  if(storageError)console.warn('Track file cleanup:',storageError.message);
  openProfile();
}

// Replace visitor profile renderer with the same profile data plus public music.
findUserByName = async function(username){
  const clean=String(username||'').replace(/^@/,'').trim();
  const {data,error}=await db.from('profiles').select('id,username,display_name,bio,avatar_url,avatar_path,name_color,member_number').eq('username',clean).maybeSingle();
  if(error||!data){toast(uiText('userNotFound'));return;}
  let avatar=data.avatar_url||'';
  if(data.avatar_path){const {data:signed}=await db.storage.from('avatars').createSignedUrl(data.avatar_path,3600);if(signed?.signedUrl)avatar=signed.signedUrl;}
  const p={...data,avatar_url:avatar};
  const music=await renderPublicProfileMusic(p.id,false);
  showModal(`<h2 class="modal-title">${uiText('userProfile')}</h2><div class="profile-block"><div class="avatar profile-avatar">${avatar?`<img src="${esc(avatar)}" alt="">`:esc(initials(p.display_name||p.username))}</div><div><strong style="${/^#[0-9a-fA-F]{6}$/.test(p.name_color||'')?`color:${p.name_color}`:''}">${esc(p.display_name||uiText('user'))}</strong><div class="muted">@${esc(p.username||'')}</div><div class="feature-small">${p.member_number?uiText('memberNo')+' '+p.member_number:''}</div></div></div><p>${esc(p.bio||uiText('noBio'))}</p>${music}<div class="modal-actions"><button class="action-btn" onclick="closeModal()">${uiText('close')}</button><button class="primary-btn" onclick="closeModal();startChatWith('${p.id}')">${uiText('write')}</button></div><button class="action-btn danger-btn" style="width:100%;margin-top:8px" onclick="closeModal();openReportForm({username:'${esc(p.username||'')}'} )">${uiText('report')}</button>`);
};

// Append public/private management to the owner profile without changing its visual theme.
const _openProfileRelease = openProfile;
openProfile = async function(){
  await _openProfileRelease();
  const modal=document.querySelector('#modalRoot .modal');
  if(!modal||modal.querySelector('#ownerProfileMusic'))return;
  const host=document.createElement('div');host.id='ownerProfileMusic';host.innerHTML=await renderPublicProfileMusic(currentUser.id,true);
  const anchor=modal.querySelector('#myMusicShortcut');
  if(anchor)anchor.insertAdjacentElement('beforebegin',host);else modal.appendChild(host);
};

/* Five-language UI dictionary. Only interface phrases are translated;
   profile names, usernames, channel names, message bodies and track titles are data and remain untouched. */
const UI_I18N={
ru:{profileMusic:'Музыка в профиле',musicUnavailable:'Музыка временно недоступна.',noTracks:'У тебя пока нет добавленных треков.',noPublicTracks:'Публичных треков пока нет.',makePrivate:'Сделать личным',makePublic:'Сделать публичным',delete:'Удалить',musicUpdateError:'Не удалось изменить доступ',trackPublic:'Трек теперь публичный.',trackPrivate:'Трек теперь личный.',confirmDeleteTrack:'Удалить композицию из профиля?',musicDeleteError:'Не удалось удалить трек',userNotFound:'Пользователь не найден.',userProfile:'Профиль пользователя',user:'Пользователь',memberNo:'Участник №',noBio:'Пользователь пока не добавил описание.',close:'Закрыть',write:'Написать',report:'Пожаловаться',chats:'Чаты',channels:'Каналы',music:'Музыка',search:'Поиск...',message:'Сообщение...',settings:'Настройки',profile:'Профиль',login:'Войти',register:'Регистрация',email:'Электронная почта',password:'Пароль',private:'Только я',public:'Для всех пользователей',theme:'Оформление',language:'Язык',save:'Сохранить',cancel:'Отмена',createChannel:'Создать канал',publish:'Опубликовать',send:'Отправить',notifications:'Уведомления',achievements:'Достижения',bulletin:'Доска объявлений',wallpaper:'Обои',pinned:'Закреплённые сообщения',memberCard:'Имперское удостоверение',comments:'Комментарии',upload:'Загрузить',chooseFile:'Выбрать файл',name:'Имя',username:'Имя пользователя',about:'О себе',avatar:'Аватар',description:'Описание',edit:'Изменить',remove:'Убрать',yes:'Да',no:'Нет',loading:'Загрузка...',noMessages:'Сообщений пока нет.',noChannels:'Каналов пока нет.',noNotifications:'Уведомлений пока нет.',noAchievements:'Достижений пока нет.',publicAccess:'Публичный доступ',privateAccess:'Личный доступ'},
be:{profileMusic:'Музыка ў профілі',musicUnavailable:'Музыка часова недаступная.',noTracks:'Пакуль няма дададзеных трэкаў.',noPublicTracks:'Публічных трэкаў пакуль няма.',makePrivate:'Зрабіць асабістым',makePublic:'Зрабіць публічным',delete:'Выдаліць',musicUpdateError:'Не ўдалося змяніць доступ',trackPublic:'Трэк цяпер публічны.',trackPrivate:'Трэк цяпер асабісты.',confirmDeleteTrack:'Выдаліць кампазіцыю з профілю?',musicDeleteError:'Не ўдалося выдаліць трэк',userNotFound:'Карыстальнік не знойдзены.',userProfile:'Профіль карыстальніка',user:'Карыстальнік',memberNo:'Удзельнік №',noBio:'Карыстальнік пакуль не дадаў апісанне.',close:'Закрыць',write:'Напісаць',report:'Паскардзіцца',chats:'Чаты',channels:'Каналы',music:'Музыка',search:'Пошук...',message:'Паведамленне...',settings:'Налады',profile:'Профіль',login:'Увайсці',register:'Рэгістрацыя',email:'Электронная пошта',password:'Пароль',private:'Толькі я',public:'Для ўсіх карыстальнікаў',theme:'Афармленне',language:'Мова',save:'Захаваць',cancel:'Скасаваць',createChannel:'Стварыць канал',publish:'Апублікаваць',send:'Адправіць',notifications:'Апавяшчэнні',achievements:'Дасягненні',bulletin:'Дошка абвестак',wallpaper:'Шпалеры',pinned:'Замацаваныя паведамленні',memberCard:'Імперскае пасведчанне',comments:'Каментарыі',upload:'Загрузіць',chooseFile:'Выбраць файл',name:'Імя',username:'Імя карыстальніка',about:'Пра сябе',avatar:'Аватар',description:'Апісанне',edit:'Змяніць',remove:'Выдаліць',yes:'Так',no:'Не',loading:'Загрузка...',noMessages:'Паведамленняў пакуль няма.',noChannels:'Каналаў пакуль няма.',noNotifications:'Апавяшчэнняў пакуль няма.',noAchievements:'Дасягненняў пакуль няма.',publicAccess:'Публічны доступ',privateAccess:'Асабісты доступ'},
uk:{profileMusic:'Музика у профілі',musicUnavailable:'Музика тимчасово недоступна.',noTracks:'Поки що немає доданих треків.',noPublicTracks:'Публічних треків поки немає.',makePrivate:'Зробити приватним',makePublic:'Зробити публічним',delete:'Видалити',musicUpdateError:'Не вдалося змінити доступ',trackPublic:'Трек тепер публічний.',trackPrivate:'Трек тепер приватний.',confirmDeleteTrack:'Видалити композицію з профілю?',musicDeleteError:'Не вдалося видалити трек',userNotFound:'Користувача не знайдено.',userProfile:'Профіль користувача',user:'Користувач',memberNo:'Учасник №',noBio:'Користувач ще не додав опис.',close:'Закрити',write:'Написати',report:'Поскаржитися',chats:'Чати',channels:'Канали',music:'Музика',search:'Пошук...',message:'Повідомлення...',settings:'Налаштування',profile:'Профіль',login:'Увійти',register:'Реєстрація',email:'Електронна пошта',password:'Пароль',private:'Лише я',public:'Для всіх користувачів',theme:'Оформлення',language:'Мова',save:'Зберегти',cancel:'Скасувати',createChannel:'Створити канал',publish:'Опублікувати',send:'Надіслати',notifications:'Сповіщення',achievements:'Досягнення',bulletin:'Дошка оголошень',wallpaper:'Шпалери',pinned:'Закріплені повідомлення',memberCard:'Імперське посвідчення',comments:'Коментарі',upload:'Завантажити',chooseFile:'Вибрати файл',name:'Ім’я',username:'Ім’я користувача',about:'Про себе',avatar:'Аватар',description:'Опис',edit:'Змінити',remove:'Прибрати',yes:'Так',no:'Ні',loading:'Завантаження...',noMessages:'Повідомлень поки немає.',noChannels:'Каналів поки немає.',noNotifications:'Сповіщень поки немає.',noAchievements:'Досягнень поки немає.',publicAccess:'Публічний доступ',privateAccess:'Особистий доступ'},
kk:{profileMusic:'Профильдегі музыка',musicUnavailable:'Музыка уақытша қолжетімсіз.',noTracks:'Әзірге тректер қосылмаған.',noPublicTracks:'Әзірге ашық тректер жоқ.',makePrivate:'Жеке ету',makePublic:'Барлығына ашу',delete:'Жою',musicUpdateError:'Қолжетімділікті өзгерту мүмкін болмады',trackPublic:'Трек енді ашық.',trackPrivate:'Трек енді жеке.',confirmDeleteTrack:'Бұл композицияны профильден жоясыз ба?',musicDeleteError:'Тректі жою мүмкін болмады',userNotFound:'Пайдаланушы табылмады.',userProfile:'Пайдаланушы профилі',user:'Пайдаланушы',memberNo:'Қатысушы №',noBio:'Пайдаланушы әзірге сипаттама қоспады.',close:'Жабу',write:'Жазу',report:'Шағымдану',chats:'Чаттар',channels:'Арналар',music:'Музыка',search:'Іздеу...',message:'Хабарлама...',settings:'Баптаулар',profile:'Профиль',login:'Кіру',register:'Тіркелу',email:'Электрондық пошта',password:'Құпиясөз',private:'Тек мен',public:'Барлық пайдаланушыларға',theme:'Безендіру',language:'Тіл',save:'Сақтау',cancel:'Болдырмау',createChannel:'Арна құру',publish:'Жариялау',send:'Жіберу',notifications:'Хабарландырулар',achievements:'Жетістіктер',bulletin:'Хабарландыру тақтасы',wallpaper:'Түсқағаз',pinned:'Бекітілген хабарламалар',memberCard:'Империялық куәлік',comments:'Пікірлер',upload:'Жүктеу',chooseFile:'Файл таңдау',name:'Аты',username:'Пайдаланушы аты',about:'Өзі туралы',avatar:'Аватар',description:'Сипаттама',edit:'Өзгерту',remove:'Алып тастау',yes:'Иә',no:'Жоқ',loading:'Жүктелуде...',noMessages:'Әзірге хабарлама жоқ.',noChannels:'Әзірге арна жоқ.',noNotifications:'Әзірге хабарландыру жоқ.',noAchievements:'Әзірге жетістік жоқ.',publicAccess:'Ашық қолжетімділік',privateAccess:'Жеке қолжетімділік'},
en:{profileMusic:'Profile music',musicUnavailable:'Music is temporarily unavailable.',noTracks:'You have not added any tracks yet.',noPublicTracks:'No public tracks yet.',makePrivate:'Make private',makePublic:'Make public',delete:'Delete',musicUpdateError:'Could not change access',trackPublic:'Track is now public.',trackPrivate:'Track is now private.',confirmDeleteTrack:'Remove this track from your profile?',musicDeleteError:'Could not delete track',userNotFound:'User not found.',userProfile:'User profile',user:'User',memberNo:'Member #',noBio:'This user has not added a description yet.',close:'Close',write:'Message',report:'Report',chats:'Chats',channels:'Channels',music:'Music',search:'Search...',message:'Message...',settings:'Settings',profile:'Profile',login:'Log in',register:'Sign up',email:'Email',password:'Password',private:'Only me',public:'Everyone',theme:'Theme',language:'Language',save:'Save',cancel:'Cancel',createChannel:'Create channel',publish:'Publish',send:'Send',notifications:'Notifications',achievements:'Achievements',bulletin:'Bulletin board',wallpaper:'Wallpaper',pinned:'Pinned messages',memberCard:'Imperial ID',comments:'Comments',upload:'Upload',chooseFile:'Choose file',name:'Name',username:'Username',about:'About',avatar:'Avatar',description:'Description',edit:'Edit',remove:'Remove',yes:'Yes',no:'No',loading:'Loading...',noMessages:'No messages yet.',noChannels:'No channels yet.',noNotifications:'No notifications yet.',noAchievements:'No achievements yet.',publicAccess:'Public access',privateAccess:'Private access'}
};
function uiText(key){return UI_I18N[currentLanguage]?.[key]||UI_I18N.ru[key]||key;}

// Translate only known interface labels. Names, handles, channel titles, messages and track metadata are never transformed.
const UI_PHRASES={
'Чаты':'chats','Каналы':'channels','Музыка':'music','Поиск...':'search','Сообщение...':'message','Настройки':'settings','Профиль':'profile','Войти':'login','Регистрация':'register','Электронная почта':'email','Пароль':'password','Только я':'private','Для всех пользователей':'public','Оформление':'theme','Язык':'language','Сохранить':'save','Отмена':'cancel','＋ Создать канал':'createChannel','Создать канал':'createChannel','Опубликовать':'publish','Отправить':'send','Уведомления':'notifications','Достижения':'achievements','Доска объявлений':'bulletin','Обои':'wallpaper','📌 Закреплённые сообщения':'pinned','Имперское удостоверение':'memberCard','Комментарии':'comments','Загрузить трек':'upload','Файл':'chooseFile','Отображаемое имя':'name','Имя пользователя':'username','О себе':'about','Аватар':'avatar','Описание':'description','Изменить':'edit','Убрать':'remove','Загрузка переписок...':'loading','Сообщений пока нет.':'noMessages','Каналов пока нет.':'noChannels','Уведомлений пока нет.':'noNotifications','Достижений пока нет.':'noAchievements'
};
function applyLanguage(){
  document.documentElement.lang=currentLanguage==='kk'?'kk':currentLanguage;
  document.getElementById('tabChats')&&(document.getElementById('tabChats').textContent=uiText('chats'));
  document.getElementById('tabChannels')&&(document.getElementById('tabChannels').textContent=uiText('channels'));
  document.getElementById('tabMusic')&&(document.getElementById('tabMusic').textContent=uiText('music'));
  const search=document.getElementById('chatSearch');if(search)search.placeholder=uiText('search');
  const message=document.getElementById('messageInput');if(message)message.placeholder=uiText('message');
  translateInterface(document.body);
}
function translateInterface(root){
  if(!root||!currentLanguage)return;
  const dict=UI_I18N[currentLanguage]||UI_I18N.ru;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,[data-user-content],.chat-message,.message-body,.channel-title,.chat-item-name,.profile-user-name,.track-title,.user-generated'))continue;
    const raw=node.nodeValue;const trimmed=raw.trim();
    if(UI_PHRASES[trimmed]){const key=UI_PHRASES[trimmed];const translated=dict[key]||UI_I18N.ru[key];if(translated)node.nodeValue=raw.replace(trimmed,translated);}
  }
  root.querySelectorAll('[placeholder]').forEach(el=>{const key=UI_PHRASES[el.getAttribute('placeholder')];if(key&&dict[key])el.setAttribute('placeholder',dict[key]);});
  root.querySelectorAll('[title]').forEach(el=>{const key=UI_PHRASES[el.getAttribute('title')];if(key&&dict[key])el.setAttribute('title',dict[key]);});
}
const _applyLanguageRelease=applyLanguage;
applyLanguage=function(){_applyLanguageRelease();};
let _translationObserver=null;
function startTranslationObserver(){
  if(_translationObserver||!document.body)return;
  _translationObserver=new MutationObserver(records=>{for(const r of records){for(const n of r.addedNodes){if(n.nodeType===Node.ELEMENT_NODE)translateInterface(n);else if(n.nodeType===Node.TEXT_NODE)translateInterface(n.parentElement);}}});
  _translationObserver.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startTranslationObserver,{once:true});else startTranslationObserver();

// Keep user-generated strings intact: only interface labels are translated. Channel names, handles and message content are not localized.

