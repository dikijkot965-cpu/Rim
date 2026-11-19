
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
// -------------------- User active sessions in Settings --------------------
  const baseOpenSettings=window.openSettings;
  if(typeof baseOpenSettings==='function')window.openSettings=function(){baseOpenSettings.apply(this,arguments);const modal=$('modalRoot')?.querySelector('.modal');if(!modal||$('rimIdConnectionsCard'))return;const apps=document.createElement('section');apps.id='rimIdConnectionsCard';apps.className='rim-update-card';apps.innerHTML='<h3 style="margin-top:0">Подключённые приложения РИМ ID</h3><p class="rim-update-muted">Здесь можно посмотреть, какие приложения получили доступ к аккаунту, и отозвать доступ.</p><div id="rimIdConnectionsList"></div><button class="action-btn" style="margin-top:8px" onclick="rimIdConnectionsLoad()">Обновить</button>';modal.appendChild(apps);window.rimIdConnectionsLoad();};

  async function rimIdConnectionsRequest(method='GET',body=null){const d=DB(),{data:s,error}=await d.auth.getSession();if(error||!s?.session?.access_token)throw new Error('Нет активной сессии.');const headers={'Authorization':'Bearer '+s.session.access_token,'apikey':publishableKey};if(body)headers['Content-Type']='application/json';const r=await fetch(supabaseUrl+'/functions/v1/rim-id-connections',{method,headers,body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({error:'invalid_response'}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j;}
  window.rimIdConnectionsLoad=async()=>{const out=$('rimIdConnectionsList');if(!out)return;out.innerHTML='<div class="rim-update-muted">Загружаем подключения…</div>';try{const r=await rimIdConnectionsRequest();const grouped=new Map();for(const x of r.connections||[]){const v=grouped.get(x.client_id)||{...x,count:0};v.count++;if(x.last_used_at&&(!v.last_used_at||x.last_used_at>v.last_used_at))v.last_used_at=x.last_used_at;grouped.set(x.client_id,v);}out.innerHTML=[...grouped.values()].map(x=>`<div class="rim-group-member"><div><b>${esc(x.client_name)}</b><div class="rim-update-muted">Разрешения: ${esc((x.scopes||[]).join(', '))}</div><div class="rim-update-muted">Последнее использование: ${when(x.last_used_at)} · Токенов: ${x.count}</div></div><button class="action-btn danger-btn" onclick="rimIdRevokeConnection('${esc(x.client_id)}')">Отключить</button></div>`).join('')||'<div class="empty-state">Нет подключённых приложений РИМ ID.</div>';}catch(e){out.innerHTML=`<div class="notice">${esc(errText(e))}</div>`;}};
  window.rimIdRevokeConnection=async clientId=>{if(!confirm('Отключить это приложение от аккаунта РИМа?'))return;try{const r=await rimIdConnectionsRequest('POST',{client_id:clientId});say(`Отозвано токенов: ${r.revoked}`);await window.rimIdConnectionsLoad();}catch(e){say(errText(e));}};
})();

