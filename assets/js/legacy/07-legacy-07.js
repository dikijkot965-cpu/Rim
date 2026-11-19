
/* RIM reliability patch — session state and navigation cleanup */
(function(){
 'use strict';
 // SIGNED_OUT may happen from another tab or an expired/revoked session.
 db.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT'){
   currentUser=null; currentProfile=null; conversations=[]; activeConversation=null;
   messagesCache=[]; replyTarget=null;
   if(realtimeChannel){db.removeChannel(realtimeChannel);realtimeChannel=null;}
   if(reactionChannel){db.removeChannel(reactionChannel);reactionChannel=null;}
   document.getElementById('app')?.classList.add('hidden');
   document.getElementById('authScreen')?.classList.remove('hidden');
  }
 });
 // The final navigation has exactly one “Ещё” and one “Инструменты” entry.
 const cleanupNav=()=>{
  document.getElementById('tabMore')?.remove();
  document.getElementById('tabLocalSuite')?.remove();
 };
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',cleanupNav,{once:true});
 else cleanupNav();
 const priorFeatureStartupFinal=window.featureStartup;
 if(typeof priorFeatureStartupFinal==='function'&&!window.__rimNavCleanupWrapped){
  window.__rimNavCleanupWrapped=true;
  // Always cleanup obsolete tabs; modular nav owns openMore/openTools handlers only.
  window.featureStartup=async function(){await priorFeatureStartupFinal();cleanupNav();};
 }
})();
