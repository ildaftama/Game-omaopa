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
async function request(url, options={}) {
  const r = await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
  if (!r.ok) throw Error('Layanan mengembalikan HTTP '+r.status+'.');
  return r.json();
}
export async function run(date, env=process.env) {
  if (!validDate(date)) throw Error('Tanggal harus YYYY-MM-DD dan valid.');
  for (const key of ['ESB_USERNAME','ESB_PASSWORD','FIREBASE_SYNC_EMAIL','FIREBASE_SYNC_PASSWORD','FIREBASE_WEB_API_KEY']) if (!env[key]) throw Error('Pengaturan integrasi belum lengkap: '+key);
  const client=createEsbClient({username:env.ESB_USERNAME,password:env.ESB_PASSWORD});
  let result;try{result=await client.report('sales-payment-summary',{salesDate:date});}finally{client.close();}
  const rows = normalize(result,date);
  // Empty results need investigation; preserve an existing report rather than overwrite it.
  if (!rows.length) throw Error('ESB tidak mengembalikan outlet. Data lama dipertahankan.');
  const auth = await request('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:env.FIREBASE_SYNC_EMAIL,password:env.FIREBASE_SYNC_PASSWORD,returnSecureToken:true})});
  if (!auth.idToken) throw Error('Login penyimpanan belum berhasil.');
  const record = {schemaVersion:1,date,source:'ESB sales-payment-summary',metric:'paymentAmount',syncedAt:new Date().toISOString(),outletCount:rows.length,rows};
  const fields = Object.fromEntries(Object.entries(record).map(([k,v])=>[k,field(v)]));
  await request(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/radarSalesDays/${date}`,{method:'PATCH',headers:{Authorization:'Bearer '+auth.idToken,'Content-Type':'application/json'},body:JSON.stringify({fields})});
  console.log('Selesai: '+date+', '+rows.length+' outlet tersimpan.');
  return record;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2]).catch(()=>{console.error('Penarikan gagal. Periksa tanggal, secrets, akses ESB dan aturan Firebase. Data belum dinyatakan berhasil.');process.exitCode=1;});
}
