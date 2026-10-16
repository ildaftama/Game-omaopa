import {pathToFileURL} from 'node:url';
import {run} from './esb-sync.mjs';

// Compute the completed business day in Jakarta, regardless of runner timezone.
export function previousJakartaDate(now=new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Waktu penarikan tidak valid.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  return new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)-1)).toISOString().slice(0,10);
}
export async function runDaily({now=new Date(),sync=run}={}) {
  const date=previousJakartaDate(now);
  console.log('Penarikan harian untuk '+date+' (hari sebelumnya, WIB).');
  return sync(date);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  runDaily().catch(error=>{console.error(error.message);console.error('Pembaruan harian belum berhasil. Data lama dipertahankan.');process.exitCode=1;});
}
