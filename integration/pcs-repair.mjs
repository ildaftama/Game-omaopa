import fs from 'node:fs';
import {collectJobs,mergeSales} from './pcs-sales.mjs';
import {createEsbClient} from './esb-client.mjs';
const path='forecast/pcs-sales.json',previous=JSON.parse(fs.readFileSync(path,'utf8'));
const branches=new Map(JSON.parse(fs.readFileSync('integration/pcs-branches.json','utf8')).branches.map(b=>[b.id,b]));
const valid=new Set(previous.days.map(r=>r.date+'|'+r.id)),targets=new Map((previous.failed||[]).map(r=>[r.date+'|'+r.id,r]));
const through=previous.days.map(r=>r.date).sort().at(-1);
for(let d=new Date('2025-01-01T00:00:00Z');d.toISOString().slice(0,10)<=through;d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);for(const id of branches.keys())if(!valid.has(date+'|'+id))targets.set(date+'|'+id,{date,id});}
const jobs=[...targets.values()].map(r=>{const b=branches.get(r.id);if(!b||!/^202[56]-\d{2}-\d{2}$/.test(r.date))throw Error('Target pemeriksaan tidak valid.');return {...b,date:r.date};});
if(jobs.length>2000)throw Error('Jumlah pemeriksaan di luar batas.');
const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
let results;try{
 results=await collectJobs(jobs,client);
 // Aggregate menu labels/counts only; no receipt numbers or customer data.
 for(const [id,date]of [['gajah-raya','2025-01-01'],['undip','2025-06-01'],['udinus','2026-02-13']]){
  const b=branches.get(id),r=await client.pages('sales-menu-cogs',{branchID:String(b.branchID),salesDate:date,salesMenuCogsType:'Standard',showMenuPackage:'1'}),groups=new Map();
  if(!r.complete)continue;
  for(const row of r.rows){if(row.salesType!=='Sales'||!/malmil|ogura|mini|chiffon|cisfon/i.test(row.menuName))continue;
   const key=row.menuName+'|'+row.rowType,g=groups.get(key)||{menu:row.menuName,type:row.rowType,qty:0,paid:0};g.qty+=row.qty;if(row.total-row.discountTotal>0)g.paid+=row.qty;groups.set(key,g);}
  console.log('MENU_AUDIT '+JSON.stringify({id,date,menus:[...groups.values()]}));
 }
}finally{client.close();}
const merged=mergeSales(previous,results);fs.writeFileSync(path,JSON.stringify(merged));
const reasons={};for(const r of merged.failed)reasons[r.reason||'unavailable']=(reasons[r.reason||'unavailable']||0)+1;
console.log('Diperiksa: '+jobs.length+'. Terpulihkan: '+results.filter(r=>r.complete).length+'. Sisa: '+merged.failed.length+'.');
console.log('Alasan yang belum selesai: '+JSON.stringify(reasons));
