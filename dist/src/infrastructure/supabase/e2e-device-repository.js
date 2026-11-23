import { RimE2ECryptoEngine } from '../../security/e2e/crypto-engine.js';

/** Publishes public device material only. Private CryptoKeys remain in IndexedDB. */
export class E2EDeviceRepository {
  constructor({client,identityVault,cryptoRef=globalThis.crypto,clock=()=>new Date()}={}) {
    this.client=client;this.vault=identityVault;this.crypto=cryptoRef;this.clock=clock;this.engine=new RimE2ECryptoEngine({cryptoRef});
  }
  async registerCurrentDevice(userId,label='Устройство') {
    const identity=await this.vault.getOrCreate(userId);
    const device={id:identity.deviceId,user_id:userId,device_label:String(label).slice(0,80),identity_dh_public:identity.publicKey,identity_sign_public:identity.signPublicKey,fingerprint:identity.fingerprint,algorithm_suite:'RIM-E2E-EXPERIMENTAL-1',status:'active',last_seen_at:this.clock().toISOString()};
    const saved=await this.client.from('rim_e2e_devices').upsert(device,{onConflict:'id'});
    if(saved.error)throw saved.error;
    const signed=identity.signedPrekey;
    const spk=await this.client.from('rim_e2e_signed_prekeys').upsert({device_id:identity.deviceId,key_id:signed.keyId,public_key:signed.publicKey,signature:signed.signature,expires_at:new Date(this.clock().getTime()+7*86400000).toISOString()},{onConflict:'device_id'});
    if(spk.error)throw spk.error;
    const keys=(identity.oneTimePrekeys||[]).map(key=>({device_id:identity.deviceId,key_id:key.keyId,public_key:key.publicKey}));
    if(keys.length){const inserted=await this.client.from('rim_e2e_one_time_prekeys').upsert(keys,{onConflict:'device_id,key_id',ignoreDuplicates:true});if(inserted.error)throw inserted.error;}
    return {deviceId:identity.deviceId,fingerprint:identity.fingerprint,oneTimePrekeys:keys.length};
  }
  async claimBundle(targetUserId,deviceId=null) {
    const {data,error}=await this.client.rpc('rim_e2e_claim_prekey_bundle',{p_target_user:targetUserId,p_device_id:deviceId});
    if(error)throw error;
    if(!data)return null;
    const verified=await this.engine.verifySignedPrekey(data.identity_sign_public,{keyId:data.signed_prekey.key_id,publicKey:data.signed_prekey.public_key,signature:data.signed_prekey.signature});
    if(!verified)throw new Error('The recipient signed prekey signature is invalid.');
    return {...data,signatureVerified:true};
  }
}
