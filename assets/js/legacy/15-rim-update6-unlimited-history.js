
/* RIM UPDATE-6: unbounded message history with keyset pagination.
   Loads the newest page first; older history is fetched only when scrolling upward.
   The 50-row page size is NOT a conversation history cap. */
(()=>{
 'use strict';
 const PAGE_SIZE=50;
 let historyScope=null;
 let historyLoading=false;
 let historyHasMore=true;
 let historyScrollBound=false;
 let refreshSequence=0;
 const getBox=()=>document.getElementById('messages');
 const getTopicId=()=>typeof window.rimGetActiveTopicId==='function'?window.rimGetActiveTopicId():null;
 const getScope=()=>`${activeConversation?.id||''}:${getTopicId()||'*'}`;
 const setCache=rows=>{messagesCache=rows;window.messagesCache=rows;};
 const sortRows=rows=>rows.sort((a,b)=>{
  const t=String(a.created_at||'').localeCompare(String(b.created_at||''));
  return t||String(a.id||'').localeCompare(String(b.id||''));
 });
 const makeQuery=()=>{
  let q=db.from('chat_messages').select('*').eq('conversation_id',activeConversation.id);
  const topicId=getTopicId();
  if(topicId)q=q.eq('topic_id',topicId);
  return q;
 };
 async function fetchNewest(){
  let q=makeQuery().order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
  const {data,error}=await q;
  if(error)throw error;
  return (data||[]).reverse();
 }
 async function fetchOlder(oldest){
  let q=makeQuery().or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
  const {data,error}=await q;
  if(error)throw error;
  return (data||[]).reverse();
 }
 async function loadOlder(){
  const box=getBox();
  if(!box||historyLoading||!historyHasMore||!messagesCache?.length||!activeConversation)return;
  historyLoading=true;
  const oldHeight=box.scrollHeight,oldTop=box.scrollTop;
  const oldest=messagesCache[0];
  try{
   const rows=await fetchOlder(oldest);
   if(getScope()!==historyScope)return;
   if(!rows.length){historyHasMore=false;return;}
   const known=new Set(messagesCache.map(m=>m.id));
   const merged=rows.filter(m=>!known.has(m.id));
   if(!merged.length){historyHasMore=rows.length===PAGE_SIZE;return;}
   setCache(sortRows([...merged,...messagesCache]));
   await window.renderMessages();
   const newHeight=box.scrollHeight;
   box.scrollTop=oldTop+(newHeight-oldHeight);
   if(rows.length<PAGE_SIZE)historyHasMore=false;
  }catch(e){
   console.error('[RIM history] Older messages failed:',e);
   if(typeof toast==='function')toast('Не удалось загрузить более старые сообщения: '+(e.message||e));
  }finally{historyLoading=false;}
 }
 function bindHistoryScroll(){
  const box=getBox();if(!box||historyScrollBound)return;
  historyScrollBound=true;
  box.addEventListener('scroll',()=>{
   if(box.scrollTop<120)loadOlder();
  },{passive:true});
 }
 const previousLoad=window.loadMessages;
 if(window.__RIM_MESSAGE_TIMELINE_OWNED){/* modular */}else window.loadMessages=async function(){
  if(!activeConversation)return;
  const box=getBox();if(!box)return;
  const scope=getScope();
  const isNewScope=scope!==historyScope;
  const seq=++refreshSequence;
  if(isNewScope){
   historyScope=scope;historyHasMore=true;historyLoading=false;
   setCache([]);
   box.innerHTML='<div class="loading">Загрузка сообщений...</div>';
  }
  try{
   const newest=await fetchNewest();
   if(seq!==refreshSequence||scope!==getScope())return;
   const existing=isNewScope?[]:(messagesCache||[]);
   const byId=new Map(existing.map(m=>[m.id,m]));
   newest.forEach(m=>byId.set(m.id,m));
   setCache(sortRows([...byId.values()]));
   historyHasMore=newest.length===PAGE_SIZE || (!isNewScope && historyHasMore);
   if(newest.length<PAGE_SIZE && isNewScope)historyHasMore=false;
   await window.renderMessages();
   bindHistoryScroll();
   if(isNewScope)box.scrollTop=box.scrollHeight;
  }catch(e){
   console.error('[RIM history] Message load failed:',e);
   if(isNewScope)box.innerHTML='<div class="notice">Не удалось загрузить сообщения: '+String(e.message||e).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</div>';
   else if(typeof toast==='function')toast('Не удалось обновить сообщения: '+(e.message||e));
  }
 };
 // Refreshing a chat should retain already loaded older pages. A conversation/topic switch resets it.
 window.rimLoadOlderMessages=loadOlder;
 document.addEventListener('DOMContentLoaded',bindHistoryScroll);
 bindHistoryScroll();
 console.info('[RIM UPDATE-6] unlimited paginated history enabled');
})();

