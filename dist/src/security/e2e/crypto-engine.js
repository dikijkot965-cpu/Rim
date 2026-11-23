const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ALGORITHM = 'RIM-E2E-EXPERIMENTAL-PREKEY-v1';

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function stablePublicKey(jwk) {
  return JSON.stringify({ crv:jwk.crv, kty:jwk.kty, x:jwk.x, y:jwk.y });
}
function canonicalContext({ conversationId, senderId, recipientId, messageId }) {
  for (const [key, value] of Object.entries({ conversationId, senderId, recipientId, messageId })) {
    if (!value || String(value).length > 128) throw new Error(`Invalid E2E context: ${key}`);
  }
  return `RIM-E2E-v1|${conversationId}|${senderId}|${recipientId}|${messageId}`;
}

export class RimE2ECryptoEngine {
  constructor({ cryptoRef = globalThis.crypto } = {}) {
    if (!cryptoRef?.subtle || !cryptoRef?.getRandomValues) throw new Error('Web Crypto is required for RIM E2E.');
    this.crypto = cryptoRef;
  }

  async createIdentity() {
    const dhPair = await this.crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, false, ['deriveBits']);
    const signPair = await this.crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, false, ['sign','verify']);
    const publicKey = await this.crypto.subtle.exportKey('jwk', dhPair.publicKey);
    const signPublicKey = await this.crypto.subtle.exportKey('jwk', signPair.publicKey);
    const fingerprintBytes = new Uint8Array(await this.crypto.subtle.digest('SHA-256', encoder.encode(stablePublicKey(publicKey)+'|'+stablePublicKey(signPublicKey))));
    const fingerprint = Array.from(fingerprintBytes, byte => byte.toString(16).padStart(2,'0')).join('').match(/.{1,4}/g).join(' ').toUpperCase();
    return Object.freeze({ privateKey:dhPair.privateKey, publicKey, signPrivateKey:signPair.privateKey, signPublicKey, fingerprint, algorithm:ALGORITHM });
  }

  async createSignedPrekey(identity, keyId = Date.now()) {
    if (!identity?.signPrivateKey) throw new Error('Identity signing key is unavailable.');
    const pair = await this.crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
    const publicKey = await this.crypto.subtle.exportKey('jwk',pair.publicKey);
    const signed = encoder.encode(`RIM-SPK-v1|${keyId}|${stablePublicKey(publicKey)}`);
    const signature = await this.crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.signPrivateKey,signed);
    return Object.freeze({keyId,publicKey,signature:toBase64Url(new Uint8Array(signature)),privateKey:pair.privateKey});
  }

  async verifySignedPrekey(identitySignPublicKey, signedPrekey) {
    if (!signedPrekey?.publicKey || !signedPrekey?.signature) return false;
    const key = await this.crypto.subtle.importKey('jwk',identitySignPublicKey,{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
    const data=encoder.encode(`RIM-SPK-v1|${signedPrekey.keyId}|${stablePublicKey(signedPrekey.publicKey)}`);
    return this.crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,fromBase64Url(signedPrekey.signature),data);
  }

  async createOneTimePrekeys(count=100,startId=1) {
    const total=Math.max(1,Math.min(1000,Math.floor(count)));
    const rows=[];
    for(let i=0;i<total;i++){
      const pair=await this.crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
      rows.push({keyId:startId+i,publicKey:await this.crypto.subtle.exportKey('jwk',pair.publicKey),privateKey:pair.privateKey});
    }
    return rows;
  }

  async importPublicKey(jwk) {
    if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') throw new Error('Invalid RIM E2E public key.');
    return this.crypto.subtle.importKey('jwk', jwk, { name:'ECDH', namedCurve:'P-256' }, true, []);
  }

  async deriveAesKey(privateKey, publicKey, salt, context) {
    const sharedBits = await this.crypto.subtle.deriveBits({ name:'ECDH', public:publicKey }, privateKey, 256);
    const material = await this.crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    return this.crypto.subtle.deriveKey({ name:'HKDF', hash:'SHA-256', salt, info:encoder.encode(`RIM-E2E-v1|${context}`) }, material, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  }

  async encryptFor(plaintext, { recipientPublicKey, conversationId, senderId, recipientId, messageId }) {
    const context = canonicalContext({ conversationId, senderId, recipientId, messageId });
    const recipient = await this.importPublicKey(recipientPublicKey);
    const ephemeral = await this.crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
    const salt = this.crypto.getRandomValues(new Uint8Array(32));
    const iv = this.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveAesKey(ephemeral.privateKey, recipient, salt, context);
    const ciphertext = await this.crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:encoder.encode(context), tagLength:128 }, key, encoder.encode(String(plaintext)));
    return Object.freeze({ v:1, alg:ALGORITHM, epk:await this.crypto.subtle.exportKey('jwk',ephemeral.publicKey), salt:toBase64Url(salt), iv:toBase64Url(iv), ct:toBase64Url(new Uint8Array(ciphertext)) });
  }

  async decrypt(envelope, { recipientPrivateKey, conversationId, senderId, recipientId, messageId }) {
    if (!envelope || envelope.v !== 1 || envelope.alg !== ALGORITHM) throw new Error('Unsupported RIM E2E envelope.');
    const context = canonicalContext({ conversationId, senderId, recipientId, messageId });
    const ephemeral = await this.importPublicKey(envelope.epk);
    const salt=fromBase64Url(envelope.salt), iv=fromBase64Url(envelope.iv), ciphertext=fromBase64Url(envelope.ct);
    if(salt.length!==32||iv.length!==12||ciphertext.length<16||ciphertext.length>65536)throw new Error('Invalid RIM E2E envelope size.');
    const key=await this.deriveAesKey(recipientPrivateKey,ephemeral,salt,context);
    const plaintext=await this.crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context),tagLength:128},key,ciphertext);
    return decoder.decode(plaintext);
  }

  async encryptDirectMessage(plaintext, { senderIdentity, recipientPublicKey, conversationId, senderId, recipientId, messageId }) {
    if(String(senderId)===String(recipientId))throw new Error('Direct E2E requires two distinct users.');
    const [recipientEnvelope,senderEnvelope]=await Promise.all([
      this.encryptFor(plaintext,{recipientPublicKey,conversationId,senderId,recipientId,messageId}),
      this.encryptFor(plaintext,{recipientPublicKey:senderIdentity.publicKey,conversationId,senderId,recipientId:senderId,messageId})
    ]);
    const unsigned={type:'rim.e2e.experimental.v1',v:1,alg:ALGORITHM,envelopes:{[String(recipientId)]:recipientEnvelope,[String(senderId)]:senderEnvelope}};
    const signature=await this.crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},senderIdentity.signPrivateKey,encoder.encode(JSON.stringify(unsigned)));
    return Object.freeze({...unsigned,sig:toBase64Url(new Uint8Array(signature)),signer:senderIdentity.signPublicKey});
  }

  async verifyDirectMessage(payload) {
    if(payload?.type!=='rim.e2e.experimental.v1'||!payload.sig||!payload.signer)return false;
    const key=await this.crypto.subtle.importKey('jwk',payload.signer,{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
    const unsigned={type:payload.type,v:payload.v,alg:payload.alg,envelopes:payload.envelopes};
    return this.crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,fromBase64Url(payload.sig),encoder.encode(JSON.stringify(unsigned)));
  }

  async decryptDirectMessage(payload, { identity, userId, conversationId, senderId, recipientId, messageId }) {
    if(payload?.type!=='rim.e2e.experimental.v1'||payload.v!==1)throw new Error('Message is not a RIM E2E experimental payload.');
    if(!await this.verifyDirectMessage(payload))throw new Error('E2E sender signature is invalid.');
    const envelope=payload.envelopes?.[String(userId)];
    if(!envelope)throw new Error('No E2E envelope exists for this account/device.');
    return this.decrypt(envelope,{recipientPrivateKey:identity.privateKey,conversationId,senderId:String(senderId),recipientId:String(userId),messageId});
  }
}
