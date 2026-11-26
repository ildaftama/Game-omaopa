// Omzet hari berjalan per jam (owner 2026-11-23): jalur ringan 09-22 WIB.
// Hanya menarik penjualan hari ini lalu menimpa SATU dokumen kecil di Firestore. Tidak melatih
// model, tidak menulis bundle besar, dan tidak menandai hari sebagai selesai.
// Repo publik: log hanya boleh berisi jumlah outlet, tidak boleh angka penjualan.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createEsbClient} from './esb-client.mjs';
import {collect} from './pcs-sales.mjs';
import {signIn,readLiveIntraday,writeLiveIntraday,readSmallDoc,writeSmallDoc} from './pack-forecast-reference.mjs';
import {refreshOffice,OFFICE_KEY} from './office-status.mjs';
import {STOCK_LIVE_KEY,mergeStockLive,pullDailyToday} from './stock-live.mjs';

// Outlet yang gagal terbaca kali ini tetap memakai angka tarikan sebelumnya pada hari yang sama.
export function mergeLive(previous,results,date,asOf){
 const rows=new Map(previous?.date===date&&Array.isArray(previous.rows)?previous.rows.map(r=>[r.id,r]):[]);
 for(const r of results)if(r.complete)rows.set(r.id,{id:r.id,qty:r.qty,...(Number.isFinite(r.netSales)&&r.netVersion===2?{netSales:r.netSales,netVersion:2}:{})});
 return {schemaVersion:1,kind:'intraday-live',date,asOf,expected:results.length,rows:[...rows.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
export function inWindow(now=new Date()){
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',hour12:false}).format(now))%24;
 return hour>=9&&hour<=22;
}
async function main(){
 if(!inWindow()){console.log('Di luar jam 09-22 WIB, tidak ada tarikan.');return;}
 const config=JSON.parse(fs.readFileSync('integration/pcs-branches.json','utf8'));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});let results;
 try{results=await collect(config.branches,[today],client);}finally{client.close();}
 const ok=results.filter(r=>r.complete).length;
 console.log('Omzet sementara terbaca: '+ok+'/'+results.length+' outlet.');
 if(!ok){console.log('::warning::Tidak ada outlet terbaca, data sebelumnya dipertahankan.');return;}
 const {idToken,uid}=await signIn(process.env);
 await writeLiveIntraday(mergeLive(await readLiveIntraday(idToken),results,today,new Date().toISOString()),idToken,uid);
 console.log('Omzet sementara tersimpan.');
 // Stok berjalan: Daily Report hari ini + penjualan kumulatif tarikan ini. Gagal tidak menggagalkan omzet.
 try{
  let daily=null,dailyAt=null;
  try{const office=await readSmallDoc(OFFICE_KEY,idToken);if(office?.dailyFolder){const d=await pullDailyToday(office.dailyFolder);daily=d.daily;dailyAt=new Date().toISOString();console.log('Daily Report hari ini terbaca: '+d.read+'/'+d.tabs+' tab, '+Object.keys(d.daily).length+' outlet berisi.');}}
  catch{console.log('Daily Report hari ini belum terbaca, memakai data tarikan sebelumnya.');}
  const prev=await readSmallDoc(STOCK_LIVE_KEY,idToken);
  await writeSmallDoc(STOCK_LIVE_KEY,mergeStockLive(prev,{date:today,asOf:new Date().toISOString(),results,daily,dailyAt}),idToken,uid);
  console.log('Stok berjalan tersimpan.');
 }catch{console.log('::warning::Stok berjalan belum tersimpan.');}
 try{await refreshOffice({read:k=>readSmallDoc(k,idToken),write:(k,v)=>writeSmallDoc(k,v,idToken,uid)});}catch{console.log('Data Kantor Mini belum diperbarui.');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Tarikan omzet sementara belum berhasil. Isi laporan dan akses tidak dicetak.');process.exitCode=1;});
