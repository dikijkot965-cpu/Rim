import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const configuredOwner=Deno.env.get("RIM_OWNER_USER_ID")||"";
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

// Prefer an explicitly configured owner. If no secret is supplied, resolve
// exactly one superadmin from the private role registry. Ambiguous/missing
// ownership fails closed; the function never guesses the first account.
async function resolveOwnerId(){
 if(configuredOwner)return configuredOwner;
 const {data,error}=await db.from("app_user_roles").select("user_id").eq("role","superadmin").limit(2);
 if(error||!Array.isArray(data)||data.length!==1)return "";
 return String(data[0]?.user_id||"");
}
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const digest=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,"0")).join("");
const randomToken=()=>{const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");};

async function provisionBot(ownerId:string){
 const {data:registry,error}=await db.from("rim_system_bot_registry").select("*").eq("bot_key","zladen").single();
 if(error||!registry)throw new Error("zladen_registry_unavailable");
 if(registry.bot_user_id)return registry;
 if(!ownerId)throw new Error("zladen_owner_not_configured_or_ambiguous");
 const username=String(registry.username||"zladen_bot").toLowerCase();
 const password=randomToken();
 const created=await db.auth.admin.createUser({email:"zladen@bots.rim.invalid",password,email_confirm:true,app_metadata:{rim_system_bot:true,rim_bot_owner_id:ownerId},user_metadata:{username,display_name:registry.display_name||"Злыдень"}});
 if(created.error||!created.data.user){console.error("zladen.auth.create.failed",{status:created.error?.status||null,code:created.error?.code||null,message:created.error?.message||"missing_user"});throw new Error("zladen_auth_identity_create_failed");}
 const botUserId=created.data.user.id;
 const profile=await db.from("profiles").upsert({id:botUserId,username,display_name:registry.display_name||"Злыдень",bio:"Системный помощник РИМа"},{onConflict:"id"});
 if(profile.error){await db.auth.admin.deleteUser(botUserId);throw new Error("zladen_profile_create_failed");}
 const botToken=randomToken();
 const botRow=await db.from("rim_bots").insert({owner_id:ownerId,bot_user_id:botUserId,username,display_name:registry.display_name||"Злыдень",description:"Системный помощник РИМа",token_hash:await digest(botToken),commands:[{command:"start",description:"Начать работу"},{command:"help",description:"Список возможностей"}]});
 if(botRow.error){await db.from("profiles").delete().eq("id",botUserId);await db.auth.admin.deleteUser(botUserId);throw new Error("zladen_bot_registry_create_failed");}
 const saved=await db.from("rim_system_bot_registry").update({bot_user_id:botUserId,owner_id:ownerId,updated_at:new Date().toISOString()}).eq("bot_key","zladen").is("bot_user_id",null).select("*").maybeSingle();
 if(saved.error||!saved.data){
  // This request created these exact rows; clean them up if another request
  // won the registry race or the final binding failed.
  try{await db.from("rim_bots").delete().eq("bot_user_id",botUserId);}catch{/* best effort */}
  try{await db.from("profiles").delete().eq("id",botUserId);}catch{/* best effort */}
  try{await db.auth.admin.deleteUser(botUserId);}catch{/* best effort */}
  throw new Error("zladen_provision_race_or_save_failed");
 }
 return saved.data;
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 try{
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return json({error:"unauthorized"},401);
  const {data:auth,error:authError}=await db.auth.getUser(jwt);
  if(authError||!auth.user)return json({error:"unauthorized"},401);
  const ownerId=await resolveOwnerId();
  const raw=await req.text();if(new TextEncoder().encode(raw).length>8192)return json({error:"request_too_large"},413);
  let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return json({error:"invalid_json"},400)}
  const action=String(body.action||"");
  let {data:registry,error:registryError}=await db.from("rim_system_bot_registry").select("*").eq("bot_key","zladen").single();
  if(registryError||!registry)return json({error:"zladen_unavailable"},503);

  if(action==="install"){
   if(!registry.bot_user_id){
    if(!ownerId)return json({error:"zladen_owner_not_configured_or_ambiguous"},503);
    try{registry=await provisionBot(ownerId);}catch(error){console.error("zladen.provision",error instanceof Error?error.message:"unknown");return json({error:"zladen_provision_failed"},503)}
   }
   const result=await db.rpc("rim_zladen_install_for_user",{p_user_id:auth.user.id});
   if(result.error)throw new Error("zladen_install_failed");
   return json({ok:true,result:result.data});
  }
  if(action==="state"){
   const state=String(body.state||"");if(!["active","blocked","unsubscribed"].includes(state))return json({error:"invalid_state"},400);
   const result=await db.rpc("rim_zladen_set_install_state",{p_user_id:auth.user.id,p_state:state});
   if(result.error)throw new Error("zladen_state_update_failed");
   return json({ok:true,result:result.data});
  }
  if(action==="public_profile"){
   return json({ok:true,result:{username:registry.username,display_name:registry.display_name,avatar_path:registry.avatar_path}});
  }
  if(action==="profile"){
   if(!ownerId||auth.user.id!==ownerId)return json({error:"owner_only"},403);
   return json({ok:true,result:{username:registry.username,display_name:registry.display_name,avatar_path:registry.avatar_path}});
  }
  if(action==="owner_update"){
   if(!ownerId||auth.user.id!==ownerId)return json({error:"owner_only"},403);
   const displayName=String(body.display_name??registry.display_name).trim().slice(0,40);
   const username=String(body.username??registry.username).trim().replace(/^@/,"").toLowerCase();
   const avatarPath=body.avatar_path===null?null:String(body.avatar_path??registry.avatar_path??"").trim().slice(0,512)||null;
   if(displayName.length<2||!/^[a-z][a-z0-9_]{3,30}bot$/.test(username))return json({error:"invalid_profile"},400);
   const updated=await db.from("rim_system_bot_registry").update({display_name:displayName,username,avatar_path:avatarPath,owner_id:ownerId,updated_at:new Date().toISOString()}).eq("bot_key","zladen").select("*").single();
   if(updated.error)throw new Error("zladen_profile_update_failed");
   const profile=await db.from("profiles").update({display_name:displayName,username,avatar_path:avatarPath,bio:"Системный помощник РИМа"}).eq("id",registry.bot_user_id);
   if(profile.error)throw new Error("zladen_profile_sync_failed");
   const bot=await db.from("rim_bots").update({display_name:displayName,username,avatar_path:avatarPath,owner_id:ownerId,updated_at:new Date().toISOString()}).eq("bot_user_id",registry.bot_user_id);
   if(bot.error)throw new Error("zladen_bot_sync_failed");
   return json({ok:true,result:{username:updated.data.username,display_name:updated.data.display_name,avatar_path:updated.data.avatar_path}});
  }
  if(action==="provision"){
   if(!ownerId||auth.user.id!==ownerId)return json({error:"owner_only"},403);
   if(registry.bot_user_id)return json({ok:true,result:{provisioned:true,username:registry.username}});
   registry=await provisionBot(ownerId);
   return json({ok:true,result:{provisioned:true,username:registry.username}});
  }
  return json({error:"unsupported_action"},400);
 }catch(error){console.error("rim-zladen",error instanceof Error?error.message:"unknown");return json({error:"zladen_request_failed"},500)}
});
