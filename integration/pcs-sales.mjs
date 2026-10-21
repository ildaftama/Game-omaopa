import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createEsbClient} from './esb-client.mjs';

export const PRODUCTS=['Ogura Cheese','Ogura Chocolate','Malmil Cheese','Malmil Chocolate','Mini Ogura - Cheese','Mini Ogura - Choco','Mini Ogura - Durian','Cisfon - Keju','Cisfon - Ekstra Keju','Cisfon - Butter','Cisfon Lite - Ekstra Keju','Cisfon Lite - Keju'];
export const LABELS=['Ogura Cheese','Ogura Choco','Malmil Cheese','Malmil Choco','Mini Cheese','Mini Choco','Mini Durian','Chiffon Classic Keju','Chiffon Classic Ekstra Keju','Chiffon Butter','Lite Ekstra Keju','Lite Keju'];
export function sku(name){
 let n=String(name).trim().toLowerCase().replace(/\s+/g,' ').replace(/\bcisfon\b/g,'chiffon');
 // Legacy Cisfon labels and current Chiffon labels refer to the same SKU.
 n=n.replace(/^(paket hantaran - )?chiffon\s*-\s*/,(_,prefix='')=>prefix+'chiffon ')
     .replace(/\bchiffon lite\s*-\s*/,'chiffon lite ').replace(/\bextra keju\b/g,'ekstra keju');
 n=n.replace(/\bchiffon (keju|ekstra keju|butter|buttermilk)$/,'chiffon classic $1')
     .replace(/\bchiffon classic butter$/,'chiffon classic buttermilk');
 let m=n.match(/^(?:paket oleh-oleh |paket cemal-cemil )?(ogura|malmil) (cheese|choco|chocolate)$/);
 if(m)return (m[1]==='ogura'?0:2)+(m[2]==='cheese'?0:1);
 m=n.match(/^mini satuan - (cheese|coklat|durian)$/);if(m)return 4+['cheese','coklat','durian'].indexOf(m[1]);
 m=n.match(/^(?:paket hantaran - )?chiffon (classic|lite) (ekstra keju|keju|buttermilk)$/);
 if(m){if(m[1]==='lite')return m[2]==='keju'?11:m[2]==='ekstra keju'?10:null;return m[2]==='keju'?7:m[2]==='ekstra keju'?8:9;}
 return null;
}
export function summarize(rows,{date,branchName}){
 if(!Array.isArray(rows))throw Error('Format rincian ESB tidak sesuai.');
 const qty=PRODUCTS.map(()=>0),free=PRODUCTS.map(()=>0);let unknownCake=0;
 for(const r of rows){
  if(r.salesDate!==date||r.branchName!==branchName)throw Error('Tanggal atau outlet ESB berbeda.');
  if(r.salesType!=='Sales'||r.rowType==='PACKAGE_COMPONENT')continue;
  if(!['ALACARTE','PACKAGE_HEADER'].includes(r.rowType))throw Error('Jenis baris ESB belum dikenali.');
  const p=sku(r.menuName);
  if(p===null){
   // Toppings, packaging and add-ons never create an additional cake.
   if(/^(?:paket .*(?:malmil|ogura|chiffon|cisfon)|(?:malmil|ogura|chiffon|cisfon)\b)/i.test(r.menuName))unknownCake++;
   continue;
  }
  if(!Number.isSafeInteger(r.qty)||r.qty<0||!Number.isFinite(r.total)||!Number.isFinite(r.discountTotal))throw Error('Jumlah produk ESB tidak valid.');
  // Monetary fields classify fully complimentary lines only; never derive PCS from prices.
  if(r.total-r.discountTotal<=0){free[p]+=r.qty;continue;}
  qty[p]+=r.qty;
 }
 if(unknownCake)throw Error('Ada nama menu kue baru yang perlu dipetakan.');
 return {qty,free};
}
export function range(from,to){
 const dates=[];
 for(const s of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Tanggal tidak valid.');
 for(let d=new Date(from+'T00:00:00Z');d<=new Date(to+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){dates.push(d.toISOString().slice(0,10));if(dates.length>62)throw Error('Maksimal 62 hari sekali tarik.');}
 if(!dates.length)throw Error('Rentang tanggal terbalik.');return dates;
}
export function zeroSalesDay(report,day){
 if(!Array.isArray(report?.sales)||!report.sales.length)return false;
 let total=0;
 for(const row of report.sales){
  if(row.hasViewAccess!==true||!Array.isArray(row.details)||row.details.length!==1)return false;
  const periods=row.details[0]?.periods;
  if(!Array.isArray(periods))return false;
  const values=periods.filter(p=>p.key===day);
  if(values.length!==1||!Number.isFinite(values[0].value)||values[0].value<0)return false;
  total+=values[0].value;
 }
 return total===0;
}
export async function collectJobs(jobs,client){
 const results=[],ledgers=new Map();let cursor=0;
 async function verifiedZero(job){
  const key=job.id+'|'+job.date.slice(0,7);
  if(!ledgers.has(key))ledgers.set(key,client.report('profit-loss/daily-in-month',{year:job.date.slice(0,4),month:String(Number(job.date.slice(5,7))),branchIDs:String(job.branchID),flagShowZeroValue:'true'}));
  return zeroSalesDay(await ledgers.get(key),job.date.slice(-2));
 }
 async function worker(){while(cursor<jobs.length){const job=jobs[cursor++];try{
  const report=await client.pages('sales-menu-cogs',{branchID:String(job.branchID),salesDate:job.date,salesMenuCogsType:'Standard',showMenuPackage:'0'});
  if(!report.complete)throw Error('Laporan belum lengkap.');
  if(!report.rows.length){
   if(report.count!==0||!await verifiedZero(job))throw Error('Laporan kosong belum terkonfirmasi.');
   results.push({date:job.date,id:job.id,qty:PRODUCTS.map(()=>0),free:PRODUCTS.map(()=>0),complete:true,verifiedZero:'empty-menu-and-zero-sales-ledger'});
  }else results.push({date:job.date,id:job.id,...summarize(report.rows,job),complete:true});
 }catch(error){results.push({date:job.date,id:job.id,complete:false,reason:/menu kue baru/.test(error.message)?'unmapped-menu':/kosong/.test(error.message)?'empty-unverified':String(error.message).match(/HTTP \d{3}/)?.[0]||'unavailable'});}
 if(results.length%28===0)console.log('Laporan outlet diperiksa: '+results.length+'/'+jobs.length);
 }}
 await Promise.all([worker(),worker()]);return results;
}
export async function collect(branches,dates,client){return collectJobs(dates.flatMap(date=>branches.map(b=>({...b,date}))),client);}
export function mergeSales(previous,results){
 const map=new Map((previous?.days||[]).map(r=>[r.date+'|'+r.id,r]));
 for(const r of results)if(r.complete)map.set(r.date+'|'+r.id,r);
 const failed=[...new Map([...(previous?.failed||[]),...results.filter(r=>!r.complete)].filter(r=>!map.has(r.date+'|'+r.id)).map(r=>[r.date+'|'+r.id,{date:r.date,id:r.id,...(r.reason?{reason:r.reason}:{})}])).values()];
 return {schemaVersion:1,products:PRODUCTS,labels:LABELS,outletIds:[...new Set([...(previous?.outletIds||[]),...results.map(r=>r.id)])].sort(),updatedAt:new Date().toISOString(),days:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),failed,...(previous?.history?{history:previous.history}:{})};
}
async function main(){
 const config=JSON.parse(fs.readFileSync('integration/pcs-branches.json','utf8'));
 const yesterday=new Date(Date.now()-86400000),fmt=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 const to=process.env.DATE_TO||fmt(yesterday),from=process.env.DATE_FROM||fmt(new Date(yesterday.getTime()-6*86400000));
 if(to>fmt(yesterday))throw Error('Hanya tanggal yang sudah selesai boleh ditarik.');
 const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});let results;
 try{results=await collect(config.branches,range(from,to),client);}finally{client.close();}
 const path='forecast/pcs-sales.json',previous=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):null;
 const merged=mergeSales(previous,results);fs.writeFileSync(path,JSON.stringify(merged));
 console.log('PCS terbaca: '+results.filter(r=>r.complete).length+'/'+results.length+'. Data lama yang gagal dibaca dipertahankan.');
 if(results.some(r=>!r.complete))process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Rekap PCS belum berhasil. Isi laporan dan akses tidak dicetak.');process.exitCode=1;});
