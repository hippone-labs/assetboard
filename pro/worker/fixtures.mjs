// Prints the licence strings pro/desktop/License.swift's --test-license checks, signed with the test key (pro/tests/fixtures):
// `node pro/worker/fixtures.mjs`. Paste the output into testLicense() when the format changes.
import {readFileSync} from 'node:fs';
import {importPrivateKey,sign,b64url,payloadText} from './license.mjs';
const key=await importPrivateKey(JSON.parse(readFileSync(new URL('../tests/fixtures/license-test-key.json',import.meta.url),'utf8')).privateKeyPkcs8);
const raw=async object=>{const payload=b64url(new TextEncoder().encode(JSON.stringify(object)));return `ASB1.${payload}.${b64url(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(`ASB1.${payload}`)))}`;};
console.log('valid:   '+await sign({id:'K3Q7NVHM',iss:'2026-10-01',upd:'2027-10-01'},key));
console.log('old:     '+await sign({id:'K3Q7NVHM',iss:'2025-01-01',upd:'2026-01-01'},key));
console.log('team:    '+await raw({v:1,id:'K3Q7NVHM',plan:'team',iss:'2026-10-01',upd:'2027-10-01'}));
console.log('future:  '+await raw({v:1,id:'K3Q7NVHM',plan:'pro',iss:'2099-01-01',upd:'2100-01-01'}));
console.log('v2:      '+await raw({v:2,id:'K3Q7NVHM',plan:'pro',iss:'2026-10-01',upd:'2027-10-01'}));
