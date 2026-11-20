/* RIM FINAL NAVIGATION REPAIR — independent from Supabase startup */
(function(){
 'use strict';
 const BAR='.tabbar';
 let observer=null;
 function makeButton(id,label,handler){
   let el=document.getElementById(id);
   if(!el){el=document.createElement('button');el.type='button';el.id=id;el.className='action-btn';el.textContent=label;}
   el.onclick=handler;
   return el;
 }
 function install(){
   const bar=document.querySelector(BAR);
   if(!bar)return false;
   // Remove only obsolete duplicate controls; preserve the original three tabs.
   document.getElementById('tabMore')?.remove();
   document.getElementById('tabLocalSuite')?.remove();
   const tools=makeButton('tabToolsFull','Инструменты',function(){
     if(typeof window.openToolsPage==='function')window.openToolsPage();
     else if(typeof window.openTools==='function')window.openTools();
     else console.warn('[RIM nav] openToolsPage is not available yet');
   });
   const more=makeButton('tabMoreFull','Ещё',function(){
     if(typeof window.openMorePage==='function')window.openMorePage();
     else if(typeof window.openImperialCabinet==='function')window.openImperialCabinet();
     else console.warn('[RIM nav] openMorePage is not available yet');
   });
   // insertBefore is idempotent and does not depend on the tab creation order.
   if(tools.parentNode!==bar)bar.appendChild(tools);
   if(more.parentNode!==bar)bar.appendChild(more);
   if(tools.nextElementSibling!==more)bar.insertBefore(tools,more);
   return true;
 }
 function start(){
   install();
   if(!observer && document.documentElement){
     observer=new MutationObserver(function(){install();});
     observer.observe(document.documentElement,{childList:true,subtree:true});
   }
   // Catch tabbar replacement by the app after login / session restoration.
   [0,100,400,1000,2000,4000].forEach(ms=>setTimeout(install,ms));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
 window.addEventListener('load',install);
 // Never override initializeApp: the original authentication and data-loading flow remains intact.
 const style=document.createElement('style');
 style.id='rim-final-navigation-repair';
 style.textContent=`
  .tabbar #tabToolsFull,.tabbar #tabMoreFull{display:flex!important;visibility:visible!important;opacity:1!important;position:relative!important;flex:1 1 0!important;min-width:0!important;white-space:nowrap!important;order:initial!important;}
  .tabbar #tabToolsFull{order:4!important}
  .tabbar #tabMoreFull{order:5!important}
  #rimFullPage .rim-banner img,.rim-fullpage .rim-banner img{max-height:125px!important;height:auto!important;object-fit:contain!important}
  #rimFullPage .rim-banner,.rim-fullpage .rim-banner{max-height:165px!important;overflow:hidden!important}
 `;
 (document.head||document.documentElement).appendChild(style);
})();
