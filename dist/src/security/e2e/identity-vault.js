import { RimE2ECryptoEngine } from './crypto-engine.js';

const DB_NAME = 'rim-e2e-identity-v2';
const STORE_NAME = 'identities';
function requestResult(request) { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB request failed.'));}); }

/** Local device key vault. CryptoKeys are structured-cloned into IndexedDB; no private key is uploaded. */
export class RimE2EIdentityVault {
  constructor({indexedDBRef=globalThis.indexedDB,cryptoRef=globalThis.crypto}={}) {
    if(!indexedDBRef?.open)throw new Error('IndexedDB is unavailable for E2E key storage.');
    this.indexedDB=indexedDBRef;this.crypto=cryptoRef;this.engine=new RimE2ECryptoEngine({cryptoRef});this.dbPromise=null;
  }
  open(){
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      const request=this.indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'userId'});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open E2E key vault.'));
      request.onblocked=()=>reject(new Error('E2E key vault upgrade is blocked by another open tab.'));
    });return this.dbPromise;
  }
  async get(userId){if(!userId)throw new Error('userId is required.');const db=await this.open();const tx=db.transaction(STORE_NAME,'readonly');return (await requestResult(tx.objectStore(STORE_NAME).get(String(userId))))||null;}
  async getOrCreate(userId,{oneTimePrekeyCount=100}={}){
    if(!userId)throw new Error('userId is required.');
    const existing=await this.get(userId);
    if(existing?.privateKey&&existing?.publicKey&&existing?.signPrivateKey&&existing?.signedPrekey?.privateKey)return existing;
    const identity=await this.engine.createIdentity();
    const signedPrekey=await this.engine.createSignedPrekey(identity,1);
    const oneTimePrekeys=await this.engine.createOneTimePrekeys(oneTimePrekeyCount,1);
    const row={userId:String(userId),deviceId:this.crypto.randomUUID(),...identity,signedPrekey,oneTimePrekeys,createdAt:new Date().toISOString()};
    const db=await this.open();
    await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not persist E2E identity.'));tx.onabort=()=>reject(tx.error||new Error('E2E identity transaction aborted.'));});
    return row;
  }
  async consumeOneTimePrekey(userId,keyId){
    const row=await this.get(userId);if(!row)return null;
    const key=row.oneTimePrekeys?.find(item=>Number(item.keyId)===Number(keyId));if(!key)return null;
    row.oneTimePrekeys=row.oneTimePrekeys.filter(item=>Number(item.keyId)!==Number(keyId));
    const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not update E2E prekeys.'));tx.onabort=()=>reject(tx.error||new Error('E2E prekey transaction aborted.'));});
    return key;
  }
  async remove(userId){if(!userId)return false;const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).delete(String(userId));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not remove E2E identity.'));tx.onabort=()=>reject(tx.error||new Error('E2E identity removal aborted.'));});return true;}
  close(){this.dbPromise?.then(db=>db.close()).catch(()=>{});this.dbPromise=null;}
}
