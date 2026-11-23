import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const encoder=new TextEncoder();
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("invalid_object");return v as Record<string,unknown>}
function str(v:unknown,n:string,max=400000):string{if(typeof v!=="string"||!v||v.length>max)throw new Error("invalid_"+n);return v}
function dec(v:string):Uint8Array{const x=v.replaceAll("-","+").replaceAll("_","/");const p=x+"=".repeat((4-x.length%4)%4);const b=atob(p);return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function hash(v:string):Promise<string>{const b=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(v)));return [...b].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function user(req:Request){const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!jwt)throw new Error("unauthorized");const {data,error}=await db.auth.getUser(jwt);if(error||!data.user)throw new Error("unauthorized");return data.user}
function status(m:string){if(m==="unauthorized")return 401;if(m==="owner_mismatch"||m.includes("signature_invalid")||m==="secondary_device_requires_link_approval")return 403;if(m.includes("not_found")||m.includes("expired")||m==="identity_not_found")return 404;if(m==="device_limit_reached")return 409;return 400}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return json({error:"method_not_allowed"},405);
 try{
  const u=await user(req);const actor=u.id;const raw=await req.text();if(encoder.encode(raw).length>500000)return json({error:"request_too_large"},413);
  const body=obj(JSON.parse(raw));const action=str(body.action,"action",48);
  if(body.userId!==undefined&&String(body.userId)!==actor)return json({error:"owner_mismatch"},403);
  if(action==="begin"){
   const address=str(body.address,"address",32),x=str(body.x25519PublicKey,"x25519_public_key",64),kem=str(body.kemPublicKey,"kem_public_key",2048);
   if(dec(address).length!==16||dec(x).length!==32||dec(kem).length!==1184)throw new Error("invalid_device_link_public_keys");
   const {data,error}=await db.rpc("rim_e2e_relay_begin_device_link",{p_user_id:actor,p_address:address,p_x25519_public_key:x,p_kem_public_key:kem});
   if(error)throw new Error(error.message||"device_link_begin_failed");
   return json({result:{deviceId:Number(data.device_id),expiresAt:Number(data.expires_at)}});
  }
  if(["request","status"].includes(action)){
   const address=str(body.address,"address",32);
   const {data,error}=await db.rpc("rim_e2e_relay_get_device_link_request",{p_user_id:actor,p_address:address});
   if(error)throw new Error(error.message||"device_link_request_not_found");
   const row=obj(data);
   if(action==="request")return json({result:{deviceId:Number(row.device_id),address:String(row.address),x25519PublicKey:String(row.x25519_public_key),kemPublicKey:String(row.kem_public_key),expiresAt:Number(row.expires_at),state:String(row.state)}});
   return json({result:{deviceId:Number(row.device_id),state:String(row.state),envelope:row.envelope?String(row.envelope):null,expiresAt:Number(row.expires_at)}});
  }
  if(action==="approve"){
   const address=str(body.address,"address",32),envelope=str(body.envelope,"envelope",400000),token=str(body.linkToken,"link_token",256),signature=str(body.signature,"signature",128);
   const {data:rd,error:re}=await db.rpc("rim_e2e_relay_get_device_link_request",{p_user_id:actor,p_address:address});if(re)throw new Error(re.message||"device_link_request_not_found");
   const request=obj(rd);if(String(request.state)!=="pending")throw new Error("device_link_request_expired");
   const {data:ir,error:ie}=await db.from("rim_e2e_relay_identities").select("identity").eq("user_id",actor).eq("identity_type","aci").maybeSingle();
   if(ie||!ir?.identity)throw new Error("identity_not_found");
   const identity=obj(ir.identity),pub=dec(str(identity.ed25519PublicKey,"identity_public_key",64));if(pub.length!==32)throw new Error("invalid_identity_public_key");
   const expires=Number(request.expires_at),envHash=await hash(envelope);
   const challenge=encoder.encode(["RIM-E2E-DEVICE-LINK-APPROVAL-V1",actor,address,String(Number(request.device_id)),String(expires),token,envHash].join("\n"));
   const key=await crypto.subtle.importKey("raw",pub,{name:"Ed25519"},false,["verify"]);
   if(!await crypto.subtle.verify({name:"Ed25519"},key,dec(signature),challenge))return json({error:"device_link_primary_signature_invalid"},403);
   const {data,error}=await db.rpc("rim_e2e_relay_approve_device_link",{p_user_id:actor,p_address:address,p_envelope:envelope,p_link_token_hash:await hash(token),p_approval_signature:signature});
   if(error)throw new Error(error.message||"device_link_approval_failed");
   return json({result:{approved:true,deviceId:Number(data.device_id)}});
  }
  if(action==="register"){
   const device=obj(body.device),deviceId=Number(device.deviceId),token=str(body.linkToken,"link_token",256);
   if(!Number.isInteger(deviceId)||deviceId<2||deviceId>5)throw new Error("invalid_device_id");
   const {data,error}=await db.rpc("rim_e2e_relay_register_linked_device",{p_user_id:actor,p_requested_device_id:deviceId,p_device_type:String(device.deviceType||"web"),p_encrypted_device_name:typeof device.encryptedDeviceName==="string"?device.encryptedDeviceName:null,p_link_token_hash:await hash(token)});
   if(error)throw new Error(error.message||"linked_device_registration_failed");
   return json({result:Number(data)});
  }
  return json({error:"unsupported_action"},400);
 }catch(error){const m=error instanceof Error?error.message:"device_link_failed";console.error("rim-e2e-device-link",m);return json({error:m},status(m));}
});
