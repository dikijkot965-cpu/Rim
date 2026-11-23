import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
const token=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 try{
  const authHeader=req.headers.get("authorization")||"";const jwt=authHeader.replace(/^Bearer\s+/i,"");if(!jwt)return json({error:"unauthorized"},401);
  const {data:auth,error:authError}=await db.auth.getUser(jwt);if(authError||!auth.user)return json({error:"unauthorized"},401);
  const ownerId=auth.user.id;const raw=await req.text();if(new TextEncoder().encode(raw).length>8192)return json({error:"request_too_large"},413);
  let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return json({error:"invalid_json"},400)}
  const action=String(body.action||"");
  if(action==="list"){
   const {data,error}=await db.from("rim_bots").select("id,username,display_name,description,is_active,commands,created_at").eq("owner_id",ownerId).order("created_at",{ascending:false});
   if(error)throw new Error("bot_list_failed");return json({bots:data||[]});
  }
  if(action==="create"){
   const username=String(body.username||"").trim().toLowerCase();const name=String(body.display_name||"").trim().slice(0,40);const description=String(body.description||"").trim().slice(0,512);
   if(!/^[a-z][a-z0-9_]{2,18}bot$/.test(username))return json({error:"username_must_be_4_to_31_chars_and_end_in_bot"},400);
   if(name.length<2)return json({error:"display_name_too_short"},400);
   const {count:ownedCount,error:countError}=await db.from("rim_bots").select("id",{count:"exact",head:true}).eq("owner_id",ownerId);if(countError)throw new Error("bot_quota_check_failed");if((ownedCount||0)>=10)return json({error:"bot_limit_reached"},429);
   const {data:exists}=await db.from("rim_bots").select("id").eq("username",username).maybeSingle();if(exists)return json({error:"username_taken"},409);
   const botId=crypto.randomUUID();const botToken=token();const botEmail=`${botId}@bots.rim.invalid`;const password=token()+token();
   const created=await db.auth.admin.createUser({email:botEmail,password,email_confirm:true,app_metadata:{rim_bot:true,rim_bot_owner_id:ownerId},user_metadata:{display_name:name,username}});
   if(created.error||!created.data.user)throw new Error("bot_identity_creation_failed");
   const botUserId=created.data.user.id;
   const profile=await db.from("profiles").update({username,display_name:name,bio:description}).eq("id",botUserId).select("id").maybeSingle();
   if(profile.error||!profile.data){await db.auth.admin.deleteUser(botUserId);if(profile.error?.code==="23505")return json({error:"username_taken"},409);throw new Error("bot_profile_creation_failed")}
   const inserted=await db.from("rim_bots").insert({id:botId,owner_id:ownerId,bot_user_id:botUserId,username,display_name:name,description,token_hash:await digest(botToken)});
   if(inserted.error){await db.from("profiles").delete().eq("id",botUserId);await db.auth.admin.deleteUser(botUserId);if(inserted.error.code==="23505")return json({error:"username_taken"},409);throw new Error("bot_record_creation_failed")}
   return json({bot:{id:botId,username,display_name:name,description,is_active:true},token:botToken,token_warning:"This token is shown once. Store it securely and never publish it."},201);
  }
  if(action==="revoke"){
   const id=String(body.bot_id||"");const {data:bot,error}=await db.from("rim_bots").select("id,bot_user_id").eq("id",id).eq("owner_id",ownerId).maybeSingle();
   if(error||!bot)return json({error:"bot_not_found"},404);
   const updated=await db.from("rim_bots").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",id);if(updated.error)throw new Error("bot_revoke_failed");
   await db.auth.admin.updateUserById(bot.bot_user_id,{ban_duration:"876000h"});
   return json({revoked:true});
  }
  if(action==="rotate_token"){
   const id=String(body.bot_id||"");const botToken=token();const updated=await db.from("rim_bots").update({token_hash:await digest(botToken),updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",ownerId).eq("is_active",true).select("id").maybeSingle();
   if(updated.error)throw new Error("bot_token_rotation_failed");if(!updated.data)return json({error:"bot_not_found"},404);return json({token:botToken,token_warning:"Previous token is now invalid. This token is shown once."});
  }
  return json({error:"unsupported_action"},400);
 }catch(error){console.error("rim-bot-manage",error instanceof Error?error.message:"unknown");return json({error:"bot_management_failed"},500)}
});
