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
 if(manifest.jobs.length>30||!manifest.jobs.length)throw Error('Batas sampel terlampaui.');
 const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
 const results=[];const payments=[];
 try{
  for(const j of manifest.jobs){
   if(!Number.isSafeInteger(j.branchID)||!/^2025-01-(01|15|31)$/.test(j.salesDate))throw Error('Sampel tidak valid.');
   try{
    const report=await client.pages('sales-menu-cogs',{branchID:String(j.branchID),salesDate:j.salesDate,salesType:'Sales',salesMenuCogsType:'Standard',showMenuPackage:'1'});
    results.push({...j,complete:true,count:report.count,groups:summarize(report.rows,j.salesDate,j.branchName)});
   }catch{results.push({...j,complete:false});}
  }
  for(const date of [...new Set(manifest.jobs.map(j=>j.salesDate))]){
   payments.push({date,rows:await client.report('sales-payment-summary',{salesDate:date})});
  }
 }finally{client.close();}
 fs.mkdirSync('private-net-sales',{recursive:true});
 fs.writeFileSync('private-net-sales/sample.encrypted.json',JSON.stringify(seal({requestId:manifest.requestId,results,payments},manifest.publicKey)));
 console.log('Sampel selesai: '+results.filter(r=>r.complete).length+'/'+results.length+'. Hasil hanya disimpan terenkripsi.');
 if(results.some(r=>!r.complete))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(()=>{console.error('Pencocokan belum selesai; isi laporan tidak dicetak.');process.exitCode=1;});
