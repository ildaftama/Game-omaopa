import fs from 'node:fs';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function auditWaste(journal,ledger,profiles){
 if(journal.period!=='2026-09'||journal.basis!=='journal posting date'||journal.purpose!=='Waste Cake'||journal.status!=='Authorized')throw Error('Periode atau jenis waste tidak sesuai.');
 const aliases=Object.fromEntries(Object.entries(profiles.outlets).map(([id,o])=>[norm(o.name),id]));Object.assign(aliases,{chiffongajahraya:'gajah-raya',cisfongajahraya:'gajah-raya',jakaluii:'jakal-uii',jebres:'uns',magelang:'pemuda-magelang',merbabuklaten:'merbabu',rajawaliklaten:'rajawali',muhammadiyahsurakarta:'ums',muntilan:'muntilann'});
 const sums=new Map(),excluded=[];
 for(const r of journal.rows){
  if(r.Purpose!=='Waste Cake'||r.Status!=='Authorized'||!/^2026-09-\d{2}$/.test(r['Item Journal Date'])||!Number.isFinite(r.Total)||!Number.isFinite(r.Qty)||r.Qty>0||r.Total>0)throw Error('Baris waste tidak valid.');
  if(r.Category!=='Product'||r['Sub Category']!=='Cake'||r.Unit!=='Pcs'){excluded.push(r);continue;}
  const id=aliases[norm(r.Branch)];if(!id||!profiles.outlets[id]?.hasProfile)throw Error('Outlet waste belum dipetakan: '+r.Branch);
  const group=sums.get(id)||{hpp:0,rows:0,units:0};group.hpp-=r.Total;group.rows++;group.units-=r.Qty;sums.set(id,group);
 }
 const outlets={},audit=[];
 for(const [id,o]of Object.entries(profiles.outlets).filter(([,o])=>o.hasProfile)){
  const matches=ledger.filter(l=>aliases[norm(l.outlet)]===id);if(matches.length!==1)throw Error('LK tidak unik atau hilang: '+id);const l=matches[0];
  const header=k=>l.values.find(r=>r[0]===k)?.[1];if(header('Period')!=='2026'||header('Month')!=='September'||aliases[norm(header('Branch'))]!==id)throw Error('Periode LK tidak cocok');
  const sales=l.values.filter(r=>r[1]==='Net Sales');if(sales.length!==1||!Number.isFinite(sales[0][3])||sales[0][3]<=0)throw Error('Net Sales LK tidak valid');
  // An outlet without an explicit export row is not silently assumed to have zero waste.
  const waste=sums.get(id),revenue=sales[0][3];
  outlets[id]={percent:waste?Math.round(waste.hpp/revenue*10000)/100:null,records:waste?.rows??0,period:'2026-09',basis:'Tanggal jurnal ESB',source:'Waste Cake / Product / Cake / Authorized'};
  audit.push({id,name:o.name,hpp:waste?.hpp??null,units:waste?.units??null,revenue,lk:l.url});
 }
 return{public:{updatedAt:'2026-10-16',period:'2026-09',source:journal.source,postingDateBasis:true,includesSamplesRecordedAsWaste:true,outlets},private:{audit,excluded}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [journalFile,ledgerFile,privateFile]=process.argv.slice(2),ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../forecast/outlet-intelligence-data.js',import.meta.url),'utf8'),ctx);
 const result=auditWaste(JSON.parse(fs.readFileSync(journalFile)),JSON.parse(fs.readFileSync(ledgerFile)),ctx.window.OUTLET_INTELLIGENCE);
 fs.writeFileSync(privateFile,JSON.stringify(result.private,null,2));fs.writeFileSync(new URL('../forecast/waste-esb-summary-data.js',import.meta.url),'window.WASTE_ESB_SUMMARY='+JSON.stringify(result.public)+';\n');
 const included=result.private.audit.filter(r=>r.hpp!==null);console.log(JSON.stringify({outlets:included.length,rows:Object.values(result.public.outlets).reduce((n,r)=>n+r.records,0),excludedRows:result.private.excluded.length,hpp:included.reduce((s,r)=>s+r.hpp,0),revenue:included.reduce((s,r)=>s+r.revenue,0)}));
}
