// Makes the signing key pair once: `node pro/worker/keygen.mjs`. The private key goes into the worker's secret
// (`wrangler secret put LICENSE_PRIVATE_KEY`, paste the PKCS#8 line), the public key into pro/desktop/License.swift (ProLicense.publicKeyBase64) and
// nowhere else; neither is written to disk here. Losing the private key means every later licence needs a new app version.
import {generateKeyPairSync} from 'node:crypto';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pkcs8=privateKey.export({type:'pkcs8',format:'der'}),spki=publicKey.export({type:'spki',format:'der'});
const raw=spki.subarray(spki.length-32); // the last 32 bytes of the SPKI encoding are the raw Ed25519 public key
const b64url=buf=>buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
console.log('LICENSE_PRIVATE_KEY (worker secret, PKCS#8, base64url):\n'+b64url(pkcs8)+'\n');
console.log('ProLicense.publicKeyBase64 (pro/desktop/License.swift, raw 32 bytes, base64):\n'+raw.toString('base64')+'\n');
console.log('publicKey (tests, raw 32 bytes, base64url):\n'+b64url(raw));
