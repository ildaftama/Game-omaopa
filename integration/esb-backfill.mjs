import {run,validDate} from './esb-sync.mjs';
import {pathToFileURL} from 'node:url';
export function range(from,to){
 if(!validDate(from)||!validDate(to)||from>to)throw Error('Rentang tanggal tidak valid.');
 const list=[];for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000)list.push(new Date(t).toISOString().slice(0,10));
 if(list.length>93)throw Error('Maksimal 93 hari dalam satu penarikan.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(to>=today)throw Error('Gunakan tanggal yang sudah selesai.');return list;
}
export async function backfill(from,to,env=process.env,sync=run){
 const dates=range(from,to),failed=[];let saved=0;
 if(sync===run)for(const key of ['ESB_USERNAME','ESB_PASSWORD','FIREBASE_SYNC_EMAIL','FIREBASE_SYNC_PASSWORD','FIREBASE_WEB_API_KEY'])if(!env[key])throw Error('Pengaturan integrasi belum lengkap.');
 for(const date of dates){try{await sync(date,env);saved++;}catch{failed.push(date);console.error('Belum tersimpan: '+date+'. Data lama tetap dipertahankan.');}}
 console.log('Hasil penarikan: '+saved+'/'+dates.length+' hari tersimpan.');
 if(failed.length)throw Error('Ada tanggal yang belum berhasil. Jalankan ulang rentang tersebut setelah pengaturan diperbaiki.');
 return {saved,total:dates.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)backfill(process.argv[2],process.argv[3]).catch(()=>{console.error('Penarikan historis belum lengkap. Periksa tanggal, akses dan pengaturan layanan.');process.exitCode=1;});
