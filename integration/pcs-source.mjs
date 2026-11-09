import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
// Only read the existing public source-link settings. No credential or permission change.
// Link SEMUA sumber (bukan cuma pesanan) diambil dari halaman Pengaturan web
// (settings/forecastSources), supaya ganti sheet cukup lewat web. Link pesanan tetap wajib
// valid (dulu satu-satunya yang dipakai -- jangan diam-diam pakai link lama); sumber lain
// yang isinya tidak valid jatuh ke bawaan repository per sumber, tidak menggagalkan run.
const decode=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'doubleValue'in v?Number(v.doubleValue):'booleanValue'in v?v.booleanValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null;
const SHEET=/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+(?:\/|$)/;
const TEXT_FIELDS=['tab','wasteTab','lostTabPrefix'];
export function mergeSources(original,config){
 if(config?.schemaVersion!==1||!Array.isArray(config.sources))throw Error('Pengaturan sumber tidak valid.');
 const orders=config.sources.find(s=>s.key==='orders');
 if(!orders||!SHEET.test(orders.url))throw Error('Pengaturan sumber pesanan tidak valid.');
 const used=[];
 const sources=original.sources.map(x=>{
  const s=config.sources.find(c=>c.key===x.key);
  if(!s||!SHEET.test(s.url||''))return x;
  const next={...x,url:s.url};
  for(const k of TEXT_FIELDS)if(typeof s[k]==='string'&&s[k].trim()&&s[k].length<=100)next[k]=s[k].trim();
  if(Number.isInteger(s.startRow)&&s.startRow>0)next.startRow=s.startRow;
  if(next.url!==x.url||TEXT_FIELDS.some(k=>next[k]!==x[k])||next.startRow!==x.startRow)used.push(x.key);
  return next;
 });
 return {merged:{...original,sources},changed:used};
}
async function main(){
 const result=await fetch('https://firestore.googleapis.com/v1/projects/oma-opa-game/databases/(default)/documents/settings/forecastSources',{signal:AbortSignal.timeout(30000)});
 if(result.status===404){console.log('Memakai sumber bawaan repository; belum ada penggantian sumber tim.');return;}
 if(!result.ok)throw Error('Akun penarikan belum dapat membaca pengaturan sumber tim.');
 const doc=await result.json(),config=decode(doc.fields.config);
 const original=JSON.parse(fs.readFileSync('forecast/data-sources.json','utf8'));
 const {merged,changed}=mergeSources(original,config);
 fs.mkdirSync('.pcs-temp',{recursive:true});fs.writeFileSync('.pcs-temp/data-sources.json',JSON.stringify(merged));
 console.log('Pengaturan sumber tim terbaca'+(changed.length?' (berbeda dari bawaan: '+changed.join(', ')+').':'.'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(()=>{console.error('Pengaturan sumber tim belum terbaca. Pembaruan dihentikan agar tidak memakai link lama.');process.exitCode=1;});
}
