import fs from 'node:fs';
// Only read the existing public source-link settings. No credential or permission change.
// An access failure is fatal: never silently use an obsolete link.
const decode=v=>'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'booleanValue'in v?v.booleanValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null;
async function main(){
 const result=await fetch('https://firestore.googleapis.com/v1/projects/oma-opa-game/databases/(default)/documents/settings/forecastSources',{signal:AbortSignal.timeout(30000)});
 if(result.status===404){console.log('Memakai sumber bawaan repository; belum ada penggantian sumber tim.');return;}
 if(!result.ok)throw Error('Akun penarikan belum dapat membaca pengaturan sumber tim.');
 const doc=await result.json(),config=decode(doc.fields.config),s=config?.sources?.find(s=>s.key==='orders');
 if(config?.schemaVersion!==1||!s||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(s.url))throw Error('Pengaturan sumber pesanan tidak valid.');
 const original=JSON.parse(fs.readFileSync('forecast/data-sources.json','utf8'));
 original.sources=original.sources.map(x=>x.key==='orders'?{...x,url:s.url,tab:s.tab||x.tab,startRow:s.startRow||x.startRow}:x);
 fs.mkdirSync('.pcs-temp',{recursive:true});fs.writeFileSync('.pcs-temp/data-sources.json',JSON.stringify(original));
 console.log('Sumber pesanan tim berhasil dibaca.');
}
main().catch(()=>{console.error('Pengaturan sumber tim belum terbaca. Pembaruan dihentikan agar tidak memakai link lama.');process.exitCode=1;});
