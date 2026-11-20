
(function(){
 'use strict';
 const RIM_THEME_KEY='rim_halloween_theme_variant_v2';
 const allowedThemes=['imperial','dark','light','halloween','halloween-imperial'];

 // 1. The "More" page must never contain an advertisement.
 const oldMore=window.openMorePage;
 if(typeof oldMore==='function'){
   if(window.__RIM_NAV_PAGES_OWNED){/* modular owns nav */}else window.openMorePage=function(){
     const result=oldMore.apply(this,arguments);
     const page=document.getElementById('rimFullPage');
     page?.querySelectorAll('.rim-banner,.feature-ad,.feature-advertisement').forEach(n=>n.remove());
     return result;
   };
 }
 // Also remove any old/injected ad nodes if a later render tries to add them.
 function purgeMoreAds(){
   const page=document.getElementById('rimFullPage');
   if(page && /Ещё/.test(page.querySelector('.rim-page-title')?.textContent||'')){
     page.querySelectorAll('.rim-banner,.feature-ad,.feature-advertisement,[data-ad-placement]').forEach(n=>n.remove());
   }
 }
 const adObserver=new MutationObserver(purgeMoreAds);
 if(document.body)adObserver.observe(document.body,{childList:true,subtree:true});

 // 2. Fix the bottom navigation order: Tools must be before More.
 function orderNavigation(){
   const bar=document.querySelector('.tabbar');
   const tools=document.getElementById('tabToolsFull');
   const more=document.getElementById('tabMoreFull');
   if(bar&&tools&&more && tools.parentNode===bar && more.parentNode===bar){
     if(tools.nextElementSibling!==more)bar.insertBefore(tools,more);
   }
 }
 function watchNavigation(){
   orderNavigation();
   const bar=document.querySelector('.tabbar');
   if(bar && !bar.dataset.rimOrderObserver){
     bar.dataset.rimOrderObserver='1';
     new MutationObserver(orderNavigation).observe(bar,{childList:true});
   }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchNavigation,{once:true});
 else watchNavigation();
 const previousStartup=window.featureStartup;
 if(typeof previousStartup==='function'&&!window.__rimNovNavWrapped){
   window.__rimNovNavWrapped=true;
   window.featureStartup=async function(){const r=await previousStartup.apply(this,arguments);watchNavigation();return r;};
 }
 // Keep navigation order even if the app recreates the tabs after auth.
 setTimeout(watchNavigation,500);setTimeout(watchNavigation,1500);setTimeout(watchNavigation,3000);

 // 3. Theme support: the previous code accidentally rejected "halloween"
 // and its applyTheme() reset it to imperial. Keep both Halloween variants.
 const oldApply=window.applyTheme;
 window.applyTheme=function(){
   if(!allowedThemes.includes(currentTheme))currentTheme='imperial';
   document.body.dataset.theme=currentTheme;
   const colors={imperial:'#17130e',dark:'#101216',light:'#f1f2f5',halloween:'#160e20','halloween-imperial':'#100d19'};
   const meta=document.querySelector('meta[name="theme-color"]');
   if(meta)meta.setAttribute('content',colors[currentTheme]||colors.imperial);
 };
 const oldSave=window.saveSettings;
 window.saveSettings=async function(){
   const selected=currentTheme;
   // Existing database CHECK permits "halloween" but not the new imperial variant.
   // Store the imperial variant locally and use the supported DB value for compatibility.
   if(selected==='halloween-imperial'){
     localStorage.setItem(RIM_THEME_KEY,'halloween-imperial');
     currentTheme='halloween';
     try{return await oldSave.apply(this,arguments);}
     finally{currentTheme=selected;window.applyTheme();}
   }
   localStorage.removeItem(RIM_THEME_KEY);
   return oldSave.apply(this,arguments);
 };
 const oldLoad=window.loadSettings;
 if(typeof oldLoad==='function'){
   window.loadSettings=async function(){
     const result=await oldLoad.apply(this,arguments);
     try{
       const saved=localStorage.getItem(RIM_THEME_KEY);
       if(saved==='halloween-imperial' && currentTheme==='halloween')currentTheme=saved;
     }catch(_){}
     window.applyTheme();
     return result;
   };
 }
 window.changeTheme=async function(value){
   if(!allowedThemes.includes(value))return;
   currentTheme=value;
   window.applyTheme();
   const select=document.getElementById('themeSelect');
   if(select)select.value=value;
   const signup=document.getElementById('signupTheme');
   if(signup && [...signup.options].some(o=>o.value===value))signup.value=value;
   await window.saveSettings();
 };
 // Ensure both Halloween themes are selectable in the settings and registration screens.
 function addHalloweenChoices(){
   ['themeSelect','signupTheme'].forEach(id=>{
     const select=document.getElementById(id);if(!select)return;
     if(![...select.options].some(o=>o.value==='halloween-imperial')){
       const option=document.createElement('option');
       option.value='halloween-imperial';option.textContent='⚜ Хэллоуинская имперская';
       select.appendChild(option);
     }
     const classic=[...select.options].find(o=>o.value==='halloween');
     if(classic && classic.textContent!=='🎃 Классический Хэллоуин')classic.textContent='🎃 Классический Хэллоуин';
   });
 }
 const settingsObserver=new MutationObserver(addHalloweenChoices);
 if(document.body)settingsObserver.observe(document.body,{childList:true,subtree:true});
 addHalloweenChoices();
 const previousOpenSettings=window.openSettings;
 if(typeof previousOpenSettings==='function'){
   if(!window.__RIM_SETTINGS_SHELL_OWNED)window.openSettings=function(){const r=previousOpenSettings.apply(this,arguments);addHalloweenChoices();return r;};
 }

 // 4. Channel ad remains available, but its display is constrained to half height by CSS.
 // Re-apply compact class after the ad renderer replaces the banner contents.
 const oldRenderAd=window.rimRenderAdBanner;
 if(typeof oldRenderAd==='function'){
   window.rimRenderAdBanner=async function(){
     const result=await oldRenderAd.apply(this,arguments);
     const host=document.querySelector('#rimFullPage .rim-banner');
     if(host){host.classList.add('rim-banner-compact');host.style.maxHeight='170px';}
     return result;
   };
 }
 // Mark the interface variant so decorative details remain consistent.
 window.rimSetHalloweenVariant=function(variant){
   if(variant==='classic')return window.changeTheme('halloween');
   if(variant==='imperial')return window.changeTheme('halloween-imperial');
 };
})();
