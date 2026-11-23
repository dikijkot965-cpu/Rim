import http from 'node:http';
import crypto from 'node:crypto';
import ivm from 'isolated-vm';
import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RIM_RUNTIME_SHARED_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const instance = process.env.RIM_RUNTIME_INSTANCE || 'rim-runtime-1';
const port = Number(process.env.PORT || 8787);
const pollMs = Math.max(500, Number(process.env.RIM_POLL_INTERVAL_MS || 1200));
const memoryMb = Math.min(128, Math.max(16, Number(process.env.RIM_BOT_MEMORY_MB || 64)));
const timeoutMs = Math.min(5000, Math.max(250, Number(process.env.RIM_BOT_TIMEOUT_MS || 1500)));
let busy = false;
const lastHeartbeats = new Map();
const runtimes = new Map();
const safeEqual = (a,b) => { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); };
const reply = (res,status,data) => { res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data)); };

async function log(bot, level, event, message, metadata={}) {
  await db.from('rim_bot_runtime_logs').insert({bot_id:bot.id,owner_id:bot.owner_id,level,event,message:String(message||'').slice(0,4000),metadata}).then(({error})=>{if(error)console.error('runtime-log-write-failed',error.message)});
}
async function sendMessage(botId, chatId, text) {
  if (typeof chatId!=='string' || !/^[0-9a-f-]{36}$/i.test(chatId)) throw new Error('Invalid chat_id');
  if (typeof text!=='string' || !text.trim() || text.length>4096) throw new Error('Text must be 1..4096 characters');
  const limit=await db.rpc('rim_bot_check_rate_limit',{p_bot_id:botId,p_limit:30,p_window_seconds:60});
  if(limit.error||limit.data!==true) throw new Error('Bot send rate limit reached');
  const {data,error}=await db.rpc('rim_bot_send_message',{p_bot_id:botId,p_chat_id:chatId,p_text:text});
  if(error) throw new Error('Message rejected: bot must be a member of the conversation');
  return {message_id:data,chat:{id:chatId}};
}
async function getBotRuntime(bot, project, files) {
  const entry=project.entry_file || 'index.js';
  const source=files.find(f=>f.path===entry)?.content;
  if(typeof source!=='string') throw new Error(`Entry file ${entry} not found`);
  const digest=crypto.createHash('sha256').update(source).digest('hex');
  const current=runtimes.get(bot.id);
  if(current?.digest===digest) return current;
  if(current) { current.isolate.dispose(); runtimes.delete(bot.id); }
  const isolate=new ivm.Isolate({memoryLimit:memoryMb});
  try {
    const context=await isolate.createContext();
    const logRef=new ivm.Reference((...args)=>log(bot,'info','bot_log',args.map(v=>String(v).slice(0,1000)).join(' '),{}));
    const sendRef=new ivm.Reference((chatId,text)=>sendMessage(bot.id,String(chatId),String(text)));
    const commandRef=new ivm.Reference(async commands=>{
      if(!Array.isArray(commands)||commands.length>100) throw new Error('Invalid commands');
      const {error}=await db.from('rim_bots').update({commands,updated_at:new Date().toISOString()}).eq('id',bot.id);
      if(error) throw new Error('Could not save bot commands');
      return true;
    });
    await context.global.set('__sendMessage',sendRef);
    await context.global.set('__rimLog',logRef);
    await context.global.set('__setCommands',commandRef);
    await context.eval(`globalThis.RIM = Object.freeze({
      onMessage: fn => { if(typeof fn!=='function') throw new TypeError('handler must be a function'); globalThis.__rimHandler=fn; },
      sendMessage: (chatId,text) => __sendMessage.apply(undefined,[chatId,text],{arguments:{copy:true},result:{promise:true,copy:true}}),
      setMyCommands: commands => __setCommands.apply(undefined,[commands],{arguments:{copy:true},result:{promise:true,copy:true}}),
      log: (...args) => __rimLog.applyIgnored(undefined,args,{arguments:{copy:true}})
    });`,{timeout:timeoutMs});
    await context.eval(source,{timeout:timeoutMs,filename:entry});
    const runtime={isolate,context,digest,projectVersion:project.runtime_version||0};
    runtimes.set(bot.id,runtime);
    return runtime;
  } catch(error) { isolate.dispose(); throw error; }
}
async function executeBot(bot, project, files, update) {
  const runtime=await getBotRuntime(bot,project,files);
  await runtime.context.global.set('__rimEvent',new ivm.ExternalCopy(update).copyInto());
  let timer;
  try {
    const execution=runtime.context.eval(`(async()=>{ if(typeof globalThis.__rimHandler!=='function') throw new Error('Register a handler with RIM.onMessage(fn)'); await globalThis.__rimHandler(globalThis.__rimEvent); return true; })()`,{timeout:timeoutMs,promise:true});
    return await Promise.race([execution,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Bot execution timed out')),timeoutMs);})]);
  } catch(error) { runtime.isolate.dispose(); runtimes.delete(bot.id); throw error; }
  finally { clearTimeout(timer); }
}
async function tick() {
  if(busy)return;busy=true;
  try {
    const {data:bots,error}=await db.from('rim_bots').select('id,owner_id,bot_user_id,is_active').eq('is_active',true).limit(8);
    if(error)throw error;
    for(const bot of bots||[]) {
      const {data:runtimeState}=await db.from('rim_bot_runtime_state').select('desired_state,actual_state').eq('bot_id',bot.id).maybeSingle();
      if(runtimeState?.desired_state!=='running') { const old=runtimes.get(bot.id); if(old){old.isolate.dispose();runtimes.delete(bot.id);} continue; }
      const {data:project}=await db.from('rim_bot_projects').select('id,entry_file,runtime_version').eq('bot_id',bot.id).maybeSingle();
      if(!project)continue;
      const {data:files}=await db.from('rim_bot_project_files').select('path,content').eq('project_id',project.id);
      if(!files?.length)continue;
      let hadError=false;
      const {data:updates}=await db.from('rim_bot_updates').select('id,payload').eq('bot_id',bot.id).is('consumed_at',null).order('id',{ascending:true}).limit(10);
      for(const update of updates||[]) {
        try {
          await executeBot(bot,project,files,update.payload);
          await db.from('rim_bot_updates').update({consumed_at:new Date().toISOString()}).eq('id',update.id).eq('bot_id',bot.id);
        } catch(error) {
          hadError=true;
          await log(bot,'error','update_failed',error?.message||'Bot execution failed',{update_id:update.id});
          await db.from('rim_bot_updates').update({consumed_at:new Date().toISOString()}).eq('id',update.id).eq('bot_id',bot.id);
        }
      }
      const now=Date.now();
      if(hadError || runtimeState?.actual_state!=='running' || now-(lastHeartbeats.get(bot.id)||0)>30000){
        const iso=new Date(now).toISOString();
        await db.from('rim_bot_runtime_state').upsert({bot_id:bot.id,owner_id:bot.owner_id,desired_state:'running',actual_state:hadError?'error':'running',runtime_instance:instance,heartbeat_at:iso,last_error_code:hadError?'BOT_UPDATE_FAILED':null,updated_at:iso},{onConflict:'bot_id'});
        lastHeartbeats.set(bot.id,now);
      }
    }
    for (const [botId,runtime] of runtimes) { if (!(bots||[]).some(b=>b.id===botId && b.is_active)) { runtime.isolate.dispose(); runtimes.delete(botId); lastHeartbeats.delete(botId); } }
  } catch(error){console.error('runtime-tick-failed',error?.message||error)} finally {busy=false;}
}
const server=http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return reply(res,200,{ok:true,instance});
  if(req.method!=='POST'||req.url!=='/admin/stop')return reply(res,404,{error:'not_found'});
  if(!safeEqual(req.headers.authorization?.replace(/^Bearer\s+/i,''),process.env.RIM_RUNTIME_SHARED_SECRET))return reply(res,401,{error:'unauthorized'});
  server.close(()=>{ for(const runtime of runtimes.values()) runtime.isolate.dispose(); runtimes.clear(); process.exit(0); });return reply(res,202,{ok:true,stopping:true});
});
server.listen(port,'0.0.0.0',()=>console.log(`RIM bot runtime ${instance} listening on ${port}`));
setInterval(tick,pollMs);tick();
