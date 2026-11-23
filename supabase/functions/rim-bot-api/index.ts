import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 try{
  const raw=await req.text();if(new TextEncoder().encode(raw).length>16384)return json({error:"request_too_large"},413);let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return json({error:"invalid_json"},400)}
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(token.length<32||token.length>256)return json({error:"unauthorized"},401);
  const {data:bot,error}=await db.from("rim_bots").select("id,bot_user_id,username,display_name,description,commands,is_active").eq("token_hash",await digest(token)).maybeSingle();
  if(error||!bot||!bot.is_active)return json({error:"unauthorized"},401);
  const method=String(body.method||"");
  const limit=method==="getUpdates"?120:method==="sendMessage"?30:60;
  const allowed=await db.rpc("rim_bot_check_rate_limit",{p_bot_id:bot.id,p_limit:limit,p_window_seconds:60});
  if(allowed.error)throw new Error("bot_rate_limit_unavailable");if(allowed.data!==true)return json({error:"rate_limited"},429);
  if(method==="getMe")return json({ok:true,result:{id:bot.id,is_bot:true,username:bot.username,first_name:bot.display_name,description:bot.description}});
  if(method==="getUpdates"){
   const offset=Math.max(0,Number(body.offset||0));const limit=Math.min(100,Math.max(1,Number(body.limit||50)));
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(limit))return json({error:"invalid_offset_or_limit"},400);
   if(offset>0){const ack=await db.rpc("rim_bot_ack_updates",{p_bot_id:bot.id,p_through_id:offset-1});if(ack.error)throw new Error("bot_update_ack_failed")}
   const result=await db.rpc("rim_bot_fetch_updates",{p_bot_id:bot.id,p_offset:offset,p_limit:limit});if(result.error)throw new Error("bot_updates_fetch_failed");
   return json({ok:true,result:(result.data||[]).map((row:any)=>row.payload)});
  }
  if(method==="sendMessage"){
   const chatId=String(body.chat_id||"");const text=String(body.text||"");if(!/^[0-9a-f-]{36}$/i.test(chatId)||!text.trim()||text.length>4096)return json({error:"invalid_chat_or_text"},400);
   const result=await db.rpc("rim_bot_send_message",{p_bot_id:bot.id,p_chat_id:chatId,p_text:text});if(result.error)return json({error:"message_send_failed"},403);
   return json({ok:true,result:{message_id:result.data,chat:{id:chatId},from:{id:bot.id,is_bot:true,username:bot.username},text}});
  }
  if(method==="setMyCommands"){
   const commands=body.commands;if(!Array.isArray(commands)||commands.length>100||commands.some((x:any)=>!x||!/^[a-z0-9_]{1,32}$/.test(String(x.command||""))||String(x.description||"").length>256))return json({error:"invalid_commands"},400);
   const result=await db.from("rim_bots").update({commands,updated_at:new Date().toISOString()}).eq("id",bot.id);if(result.error)throw new Error("bot_commands_save_failed");return json({ok:true,result:true});
  }
  return json({error:"method_not_found"},404);
 }catch(error){console.error("rim-bot-api",error instanceof Error?error.message:"unknown");return json({error:"bot_api_failed"},500)}
});
