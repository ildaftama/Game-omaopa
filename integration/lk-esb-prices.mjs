import fs from 'node:fs';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function cakeFamily(row){
 if(row.salesType!=='Sales'||row.rowType==='PACKAGE_COMPONENT')return null;
 const name=String(row.menuName||'').trim();
 if(/^(?:Ogura (?:Cheese|Choco|Chocolate)|Paket Oleh-Oleh Ogura (?:Cheese|Choco|Chocolate))$/i.test(name))return 'ogura';
 if(/^(?:Malmil (?:Cheese|Choco|Chocolate)|Paket Cemal-Cemil Malmil (?:Cheese|Choco|Chocolate))$/i.test(name))return 'malmil';
 return null;
}
export function buildPrices(lk,days,profiles){
 const aliases=Object.fromEntries(Object.entries(profiles.outlets).map(([id,o])=>[norm(o.name),id]));Object.assign(aliases,{chiffongajahraya:'gajah-raya',cisfongajahraya:'gajah-raya',jakaluii:'jakal-uii',jebres:'uns',magelang:'pemuda-magelang',merbabuklaten:'merbabu',rajawaliklaten:'rajawali',muhammadiyahsurakarta:'ums',muntilan:'muntilann'});
 const outlets={},audit=[];
 for(const [id,o]of Object.entries(profiles.outlets).filter(([,o])=>o.hasProfile)){
  const source=lk.find(s=>aliases[norm(s.outlet)]===id);if(!source)throw Error('LK outlet missing '+id);
  const header=key=>source.values.find(r=>r[0]===key)?.[1];
  if(header('Period')!=='2026'||header('Month')!=='September'||aliases[norm(header('Branch'))]!==id)throw Error('LK period/branch mismatch '+id);
  const records=days.filter(d=>aliases[norm(d.branch.branchName)]===id&&d.date.startsWith('2026-09'));
  const complete=records.length===30&&new Set(records.map(r=>r.date)).size===30&&records.every(d=>(d.downloadComplete||d.complete)&&d.rows.length===d.expected&&d.rows.every(r=>r.salesDate===d.date&&r.branchName===d.branch.branchName&&['Sales','Void','Non Sales'].includes(r.salesType)));
  const quantities={ogura:0,malmil:0};for(const d of records)for(const r of d.rows){const f=cakeFamily(r);if(!f)continue;const q=Number(r.qty);if(!Number.isFinite(q)||q<0)throw Error('Invalid ESB quantity');quantities[f]+=q;}
  outlets[id]={};
  for(const [family,account,names]of [['ogura','410106',['Ogura Cheese','Ogura Chocolate']],['malmil','410107',['Malmil Cheese','Malmil Chocolate']]]){
   const rows=source.values.filter(r=>norm(r[0])===account);if(rows.length!==1)throw Error('LK sales account ambiguous '+id);
   const revenue=rows[0][3],qty=quantities[family];const usable=complete&&typeof revenue==='number'&&Number.isFinite(revenue)&&revenue>=0&&qty>0;
   audit.push({id,family,days:records.length,complete,qty,revenue,price:usable?revenue/qty:null,lk:source.url});
   for(const name of names)if(usable)outlets[id][name]={price:revenue/qty,method:'lk-esb-observed',days:30,family};
  }
 }
 return {public:{period:'September 2026',through:'2026-09-30',method:'Omzet keluarga produk di LK / pcs keluarga produk di ESB; outlet dan September yang sama',outlets},audit};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [lkFile,apiFolder,privateOutput]=process.argv.slice(2),ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../forecast/outlet-intelligence-data.js',import.meta.url),'utf8'),ctx);
 const files=fs.readdirSync(apiFolder).filter(f=>f.endsWith('.json')),days=files.map(f=>JSON.parse(fs.readFileSync(apiFolder+'/'+f)));
 const r=buildPrices(JSON.parse(fs.readFileSync(lkFile)),days,ctx.window.OUTLET_INTELLIGENCE);
 fs.writeFileSync(new URL('../forecast/forecast-realized-prices.js',import.meta.url),'window.FORECAST_REALIZED_PRICES='+JSON.stringify(r.public)+';\n');
 fs.writeFileSync(privateOutput,JSON.stringify(r.audit));console.log(JSON.stringify({outlets:Object.keys(r.public.outlets).length,prices:r.audit.filter(a=>a.price!==null).length,incomplete:r.audit.filter(a=>!a.complete).length}));
}
