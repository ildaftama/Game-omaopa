import fs from 'node:fs';
import {createEsbClient} from './esb-client.mjs';
import {seal} from './esb-private-review.mjs';
import {pathToFileURL} from 'node:url';

// Keep each row type separate until reconciled against the original Net Sales report.
export function summarize(rows,date,branchName){
 const groups={};
 for(const r of rows){
  if(r.salesDate!==date||r.branchName!==branchName||r.salesType!=='Sales')throw Error('Identitas laporan berbeda.');
  if(!['total','discountTotal','qty'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])))throw Error('Angka laporan tidak valid.');
  if(typeof r.rowType!=='string'||!r.rowType)throw Error('Jenis baris tidak tersedia.');
  const g=groups[r.rowType]??={rows:0,total:0,discount:0,qty:0};
  g.rows++;g.total+=r.total;g.discount+=r.discountTotal;g.qty+=r.qty;
 }
 return groups;
}
async function run(){
 const manifest=JSON.parse(fs.readFileSync(new URL('./esb-net-sales-request.json',import.meta.url),'utf8'));
 if(manifest.mode==='retail-net-2025'){
  if(manifest.branches.length!==30||new Set(manifest.branches.map(b=>b.branchID)).size!==30||manifest.branches.some(b=>!Number.isSafeInteger(b.branchID)||b.branchID<2||b.branchID>31))throw Error('Cakupan outlet tidak valid.');
  const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
  const jobs=manifest.branches.flatMap(b=>Array.from({length:12},(_,m)=>({...b,year:'2025',month:m+1})));const results=[];let cursor=0;
  function checkpoint(){fs.mkdirSync('private-net-sales',{recursive:true});fs.writeFileSync('private-net-sales/retail-2025.encrypted.json',JSON.stringify(seal({requestId:manifest.requestId,results},manifest.publicKey)));}
  async function worker(){while(cursor<jobs.length){const j=jobs[cursor++];try{
   const report=await client.report('profit-loss/daily-in-month',{year:j.year,month:String(j.month),branchIDs:String(j.branchID),flagShowZeroValue:'true'});
   if(!report.summaries?.netSales||!Array.isArray(report.sales))throw Error('Format tidak lengkap.');
   results.push({...j,complete:true,netSales:report.summaries.netSales,sales:report.sales,discounts:report.discounts,headers:report.dynamicHeaders});
  }catch(error){results.push({...j,complete:false,error:String(error.message).match(/HTTP \d{3}/)?.[0]||'unavailable'});}
  if(results.length%30===0){checkpoint();console.log('Laporan bulan-outlet diperiksa: '+results.length+'/'+jobs.length);}
  }}
  try{await Promise.all([worker(),worker()]);}finally{client.close();checkpoint();}
  console.log('Lengkap: '+results.filter(r=>r.complete).length+'/'+jobs.length+'. Hasil terenkripsi.');
  if(results.some(r=>!r.complete))process.exitCode=1;
  return;
 }
 if(manifest.jobs.length>30||!manifest.jobs.length)throw Error('Batas sampel terlampaui.');
 const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
 const results=[];const payments=[];const profitLoss=[];
 try{
  for(const j of manifest.jobs){
   if(!Number.isSafeInteger(j.branchID)||!/^2025-01-(01|15|31)$/.test(j.salesDate))throw Error('Sampel tidak valid.');
   try{
    const report=await client.pages('sales-menu-cogs',{branchID:String(j.branchID),salesDate:j.salesDate,salesType:'Sales',salesMenuCogsType:'Standard',showMenuPackage:'1'});
    results.push({...j,complete:true,count:report.count,groups:summarize(report.rows,j.salesDate,j.branchName)});
   }catch{results.push({...j,complete:false});}
  }
  for(let day=0;day<365;day++){
   const date=new Date(Date.UTC(2025,0,1+day)).toISOString().slice(0,10);
   payments.push({date,rows:await client.report('sales-payment-summary',{salesDate:date})});
  }
  try{profitLoss.push({branchID:31,month:1,report:await client.report('profit-loss/daily-in-month',{year:'2025',month:'1',branchIDs:'31',flagShowZeroValue:'true'})});}
  catch(error){profitLoss.push({branchID:31,month:1,error:String(error.message).match(/HTTP \d{3}/)?.[0]||'unavailable'});}
 }finally{client.close();}
 fs.mkdirSync('private-net-sales',{recursive:true});
 fs.writeFileSync('private-net-sales/sample.encrypted.json',JSON.stringify(seal({requestId:manifest.requestId,results,payments,profitLoss},manifest.publicKey)));
 console.log('Sampel selesai: '+results.filter(r=>r.complete).length+'/'+results.length+'. Hasil hanya disimpan terenkripsi.');
 if(results.some(r=>!r.complete))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(()=>{console.error('Pencocokan belum selesai; isi laporan tidak dicetak.');process.exitCode=1;});
