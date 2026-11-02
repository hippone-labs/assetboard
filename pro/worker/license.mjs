// The licence text, shared by the worker (signing) and its tests (verifying). One line: `ASB1.<payload>.<signature>`, payload = base64url
// JSON {v:1, id, plan:'pro', iss, upd} (issue day, updates-until day), signature = Ed25519 over the ASCII of `ASB1.<payload>`.
// The app checks it offline with the public key (pro/desktop/License.swift); nothing personal is inside. Runs on Cloudflare Workers
// and Node 22 alike: WebCrypto only, no dependency.
export const ID_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: it is read aloud and typed
export const ID_PATTERN=/^[A-Z0-9]{8}$/;

export function b64url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unb64url(text){const s=String(text).replace(/-/g,'+').replace(/_/g,'/'),pad=s+'='.repeat((4-s.length%4)%4);const bin=atob(pad);return Uint8Array.from(bin,c=>c.charCodeAt(0));}
const utf8=text=>new TextEncoder().encode(text);

export function newId(random=bytes=>crypto.getRandomValues(bytes)){const bytes=random(new Uint8Array(8));return [...bytes].map(b=>ID_ALPHABET[b%ID_ALPHABET.length]).join('');}
export function display(id){return String(id).replace(/(.{4})(?=.)/g,'$1-');}
export function day(date=new Date()){return date.toISOString().slice(0,10);}
export function isDay(text){if(!/^\d{4}-\d{2}-\d{2}$/.test(text||''))return false;const d=new Date(text+'T00:00:00Z');return !Number.isNaN(d.getTime())&&day(d)===text;}
// Lifetime updates: every licence carries this as its updates-until day, so every build accepts it.
export const LIFETIME='9999-12-31';
export async function importPrivateKey(pkcs8Base64){return crypto.subtle.importKey('pkcs8',unb64url(pkcs8Base64),{name:'Ed25519'},false,['sign']);}
export async function importPublicKey(rawBase64){return crypto.subtle.importKey('raw',unb64url(rawBase64),{name:'Ed25519'},false,['verify']);}

export function payloadText({id,iss,upd}){return JSON.stringify({v:1,id,plan:'pro',iss,upd});}
export async function sign({id,iss,upd},key){
 if(!ID_PATTERN.test(id)||!isDay(iss)||!isDay(upd)||upd<iss)throw new Error('bad licence fields');
 const payload=b64url(utf8(payloadText({id,iss,upd})));
 const signature=await crypto.subtle.sign('Ed25519',key,utf8(`ASB1.${payload}`));
 return `ASB1.${payload}.${b64url(signature)}`;
}
// The payload when the text is ours and intact, else null. The same rules as License.swift, so the tests can hold both to them.
export async function verify(text,key){
 const parts=String(text||'').trim().split('.');
 if(parts.length!==3||parts[0]!=='ASB1'||!parts[1]||!parts[2])return null;
 let signature;try{signature=unb64url(parts[2]);}catch{return null;}
 if(signature.length!==64||!await crypto.subtle.verify('Ed25519',key,signature,utf8(`ASB1.${parts[1]}`)))return null;
 let object;try{object=JSON.parse(new TextDecoder().decode(unb64url(parts[1])));}catch{return null;}
 if(object?.v!==1||object.plan!=='pro'||!ID_PATTERN.test(object.id)||!isDay(object.iss)||!isDay(object.upd)||object.upd<object.iss)return null;
 return {id:object.id,plan:object.plan,iss:object.iss,upd:object.upd};
}
