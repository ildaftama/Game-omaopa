import { pathToFileURL } from 'node:url';
import {createEsbClient} from './esb-client.mjs';
const PROJECT = 'oma-opa-game';
export function validDate(s) {
  const d = new Date(s + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}
export function normalize(rows, date) {
  if (!Array.isArray(rows)) throw Error('Format laporan ESB tidak sesuai.');
  const seen = new Set();
  return rows.map(r => {
    if (!r || typeof r.branchCode !== 'string' || !r.branchCode || typeof r.branchName !== 'string' || r.salesDate !== date || !Array.isArray(r.payments) || seen.has(r.branchCode)) throw Error('Identitas outlet atau tanggal laporan tidak sesuai.');
    seen.add(r.branchCode);
    let amount = 0, count = 0;
    for (const p of r.payments) {
      const a = Number(p.paymentAmount), c = Number(p.paymentCount);
      if (!Number.isFinite(a) || !Number.isSafeInteger(c) || c < 0) throw Error('Nilai pembayaran tidak valid.');
      amount += a; count += c;
    }
    return { branchCode:r.branchCode, outlet:r.branchName, totalPayment:Math.round(amount*100)/100, paymentCount:count };
  }).sort((a,b)=>a.branchCode.localeCompare(b.branchCode));
}
function field(v) {
  if (v === null) return {nullValue:null};
  if (typeof v === 'string') return {stringValue:v};
  if (typeof v === 'number') return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if (Array.isArray(v)) return {arrayValue:{values:v.map(field)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,field(x)]))}};
}
export function firebaseFailure(status,body={}) {
  const code=body.error?.message;
  const messages={INVALID_LOGIN_CREDENTIALS:'Email atau kata sandi akun penarikan belum cocok.',INVALID_PASSWORD:'Kata sandi akun penarikan belum cocok.',EMAIL_NOT_FOUND:'Akun penarikan belum ditemukan.',USER_DISABLED:'Akun penarikan dinonaktifkan.',OPERATION_NOT_ALLOWED:'Metode login akun penarikan belum diaktifkan.',TOO_MANY_ATTEMPTS_TRY_LATER:'Percobaan login dibatasi; jangan mengulang dahulu.',API_KEY_INVALID:'Konfigurasi kunci web Firebase belum cocok.'};
  return 'Login Firebase gagal (HTTP '+status+'). '+(messages[code]||'Periksa akses project dan konfigurasi akun.');
}
async function request(url, options={}) {
  let r;try{r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('Koneksi layanan Firebase tidak berhasil.');}
  if (!r.ok) {
    if(url.startsWith('https://identitytoolkit.googleapis.com/')){let body={};try{body=await r.json();}catch{}throw Error(firebaseFailure(r.status,body));}
    throw Error('Penyimpanan Firebase gagal (HTTP '+r.status+').');
  }
  return r.json();
}
export function createSyncSession(env=process.env) {
  for (const key of ['ESB_USERNAME','ESB_PASSWORD','FIREBASE_SYNC_EMAIL','FIREBASE_SYNC_PASSWORD','FIREBASE_WEB_API_KEY']) if (!env[key]) throw Error('Pengaturan integrasi belum lengkap: '+key);
  const client=createEsbClient({username:env.ESB_USERNAME,password:env.ESB_PASSWORD});
  let auth=null, expiresAt=0, closed=false;
  async function sync(date) {
  if(closed)throw Error('Sesi penarikan sudah ditutup.');
  if (!validDate(date)) throw Error('Tanggal harus YYYY-MM-DD dan valid.');
  if(!auth || Date.now()>=expiresAt){
  auth = await request('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:env.FIREBASE_SYNC_EMAIL,password:env.FIREBASE_SYNC_PASSWORD,returnSecureToken:true})});
  if (!auth.idToken) throw Error('Login penyimpanan belum berhasil.');
  expiresAt=Date.now()+Math.max(60,(Number(auth.expiresIn)||3600)-120)*1000;
  console.log('Login Firebase berhasil.');
  }
  const result=await client.report('sales-payment-summary',{salesDate:date});
  const rows = normalize(result,date);
  // Empty results need investigation; preserve an existing report rather than overwrite it.
  if (!rows.length) throw Error('ESB tidak mengembalikan outlet. Data lama dipertahankan.');
  console.log('Laporan ESB berhasil diperiksa.');
  const record = {schemaVersion:1,date,source:'ESB sales-payment-summary',metric:'paymentAmount',syncedAt:new Date().toISOString(),outletCount:rows.length,rows};
  const fields = Object.fromEntries(Object.entries(record).map(([k,v])=>[k,field(v)]));
  await request(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/radarSalesDays/${date}`,{method:'PATCH',headers:{Authorization:'Bearer '+auth.idToken,'Content-Type':'application/json'},body:JSON.stringify({fields})});
  console.log('Selesai: '+date+', '+rows.length+' outlet tersimpan.');
  return record;
  }
  return {sync,close(){closed=true;auth=null;client.close();}};
}
export async function run(date, env=process.env) {
  if (!validDate(date)) throw Error('Tanggal harus YYYY-MM-DD dan valid.');
  const session=createSyncSession(env);
  try{return await session.sync(date);}finally{session.close();}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2]).catch(error=>{console.error(error.message);console.error('Penarikan belum dinyatakan berhasil.');process.exitCode=1;});
}
