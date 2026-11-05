import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createEsbClient} from './esb-client.mjs';
import {dailySalesLedger} from './pcs-sales.mjs';

// Omzet real GROUND-TRUTH langsung dari ledger penjualan ESB (profit-loss/daily-in-month),
// bukan direkonstruksi dari PCS kue x harga acuan. Owner menemukan gap besar (±Rp20 juta/hari)
// antara "Omzet real" Dashboard (PCS-based) dan Net Sales asli ESB pada hari tertentu -- gap
// itu TIDAK bisa dijelaskan oleh kue yang belum terpetakan SKU-nya (sync tetap "complete" untuk
// semua outlet hari itu). Modul ini menghindari masalah itu sepenuhnya: tidak perlu tahu nama
// menu apa pun, cukup jumlah "Penjualan" di ledger (dikurangi "Penjualan - Transfer", yang
// bukan penjualan customer nyata -- lihat dailySalesLedger di pcs-sales.mjs).
function daysInMonth(year,month){return new Date(Date.UTC(year,month,0)).getUTCDate();}

export function monthFromReport(report,year,month,id){
 const n=daysInMonth(year,month),out=[];
 for(let d=1;d<=n;d++){
  const day=String(d).padStart(2,'0'),date=`${year}-${String(month).padStart(2,'0')}-${day}`;
  const r=dailySalesLedger(report,day);
  out.push({id,date,netSales:r.valid?r.total:null,complete:r.valid});
 }
 return out;
}
export async function collectMonths(jobs,client){
 const results=[];let cursor=0;
 async function worker(){while(cursor<jobs.length){const j=jobs[cursor++];
  try{
   const report=await client.report('profit-loss/daily-in-month',{year:String(j.year),month:String(j.month),branchIDs:String(j.branchID),flagShowZeroValue:'true'});
   results.push(...monthFromReport(report,j.year,j.month,j.id));
  }catch(error){results.push({id:j.id,date:`${j.year}-${String(j.month).padStart(2,'0')}`,complete:false,monthFailed:true,reason:String(error.message).match(/HTTP \d{3}/)?.[0]||'unavailable'});}
 }}
 await Promise.all([worker(),worker()]);
 return results;
}
export function mergeNetSales(previous,results){
 const map=new Map((previous?.days||[]).map(r=>[r.date+'|'+r.id,r]));
 for(const r of results)if(r.complete)map.set(r.date+'|'+r.id,{date:r.date,id:r.id,netSales:r.netSales,complete:true});
 return {schemaVersion:1,outletIds:[...new Set([...(previous?.outletIds||[]),...results.map(r=>r.id)])].sort(),updatedAt:new Date().toISOString(),days:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))};
}
async function main(){
 const config=JSON.parse(fs.readFileSync('integration/pcs-branches.json','utf8'));
 const fmt=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 const today=fmt(new Date());
 const [ty,tm,td]=today.split('-').map(Number);
 // Selalu tarik bulan berjalan (laporan sekaligus berisi semua hari bulan itu, termasuk yang
 // terbaru). Awal bulan (tanggal 1-3), tarik juga bulan sebelumnya supaya hari-hari terakhirnya
 // yang baru lengkap tetap ikut diperbarui.
 const months=[{year:ty,month:tm}];
 if(td<=3){const py=tm===1?ty-1:ty,pm=tm===1?12:tm-1;months.push({year:py,month:pm});}
 const jobs=config.branches.flatMap(b=>months.map(m=>({id:b.id,branchID:b.branchID,...m})));
 const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
 let results;
 try{results=await collectMonths(jobs,client);}finally{client.close();}
 const path='forecast/pcs-net-sales.json',previous=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):null;
 const merged=mergeNetSales(previous,results);fs.writeFileSync(path,JSON.stringify(merged));
 const failedMonths=results.filter(r=>r.monthFailed).length;
 console.log('Omzet real (ledger ESB) tersimpan: '+merged.days.length+' hari-outlet. '+(failedMonths?`${failedMonths} bulan-outlet gagal dibaca, data lama dipertahankan.`:'Semua bulan-outlet berhasil.'));
 if(failedMonths)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Rekap omzet real belum berhasil. Isi laporan dan akses tidak dicetak.');process.exitCode=1;});
