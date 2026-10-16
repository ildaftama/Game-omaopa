import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {wastePeriodComplete} from './waste-policy.mjs';
const DAY=86400000;
const norm=s=>String(s??'').trim().toLowerCase().replace(/\s/g,'');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const blank=v=>v===null||v===undefined||v==='';
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const round=x=>Number.isFinite(x)?Math.round(x*10)/10:null;
const dayOf=s=>new Date(s+'T00:00:00Z').getUTCDay();
const shift=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
export const median=xs=>{const a=xs.slice().sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const quantile=(xs,p)=>{const a=xs.slice().sort((a,b)=>a-b),i=(a.length-1)*p,l=Math.floor(i);return a.length?a[l]+(a[Math.ceil(i)]-a[l])*(i-l):null;};
export function baseline(records,target){
 const history=records.filter(r=>r.date<target&&r.date>=shift(target,-28)&&dayOf(r.date)===dayOf(target)&&finite(r.quantity)&&r.quantity>=0);
 if(history.length<3)return {date:target,samples:history.length,central:null,low:null,high:null};
 const values=history.map(r=>r.quantity);
 return {date:target,samples:history.length,central:Math.round(median(values)),low:Math.floor(quantile(values,.25)),high:Math.ceil(quantile(values,.75))};
}
export function metrics(pairs){
 const total=sum(pairs.map(p=>p.actual));
 return {days:pairs.length,wape:total>0?round(100*sum(pairs.map(p=>Math.abs(p.prediction-p.actual)))/total):null,bias:total>0?round(100*sum(pairs.map(p=>p.prediction-p.actual))/total):null};
}
// Walk forward: every prediction uses only earlier dates. Both methods use identical test days.
export function backtest(records){
 const series=new Map();for(const r of records){if(series.has(r.date))throw Error('Duplicate product/date');if(finite(r.quantity)&&r.quantity>=0)series.set(r.date,r.quantity);}
 const pairs=[];
 for(const date of [...series.keys()].sort()){
  const history=[1,2,3,4].map(w=>shift(date,-7*w)).filter(d=>series.has(d)).map(d=>series.get(d));
  const previous=series.get(shift(date,-7));
  if(history.length<2||previous===undefined)continue;
  pairs.push({date,actual:series.get(date),prediction:median(history),previous});
 }
 return {method:'median-same-weekday',...metrics(pairs),lastWeekWape:metrics(pairs.map(p=>({...p,prediction:p.previous}))).wape,from:pairs[0]?.date??null,to:pairs.at(-1)?.date??null};
}
export function parseTracking(sources,aliases,asOf){
 const rows=[],issues=[],seen=new Set();
 for(const source of Object.values(sources)){
  const grid=source.values;
  for(let r=3;r<grid.length;r++){
   const row=grid[r],id=aliases[norm(row[0])];if(!id)throw Error('Unmapped tracking outlet '+row[0]);
   for(let c=1;c<grid[0].length;c+=10){
    const serial=grid[0][c];if(!finite(serial))continue;
    const date=new Date((serial-25569)*DAY).toISOString().slice(0,10);if(date>=asOf)continue;
    const key=id+'|'+date;if(seen.has(key))throw Error('Duplicate tracking date');seen.add(key);
    const [original,prediction,actual,,malmil,ogura,,,waste,minutes]=row.slice(c,c+10);
    let issue=null;
    if(![prediction,actual,malmil,ogura].every(x=>finite(x)&&x>=0))issue='missing-or-invalid';
    else if(Math.abs(actual-malmil-ogura)>1)issue='component-mismatch';
    if(issue){issues.push({id,date,reason:issue});continue;}
    rows.push({id,date,original:finite(original)&&original>=0?original:null,prediction,actual,minutes:finite(minutes)&&minutes>=0?minutes:null,wasteComplete:wastePeriodComplete(date,asOf),waste:finite(waste)&&waste>=0?waste:blank(waste)&&wastePeriodComplete(date,asOf)?0:null});
   }
  }
 }
 return {rows,issues};
}
export function parseProducts(sources,aliases){
 const series=[],issues=[],seen=new Set();
 for(const source of sources){
  const id=aliases[norm(source.sheet_name)];if(!id)throw Error('Unmapped stock outlet');
  const grid=source.values,groups=[];
  for(let r=2;r<grid.length;r++){
   if(!blank(grid[r][0]))groups.push({name:grid[r][1],unit:grid[r][2],rows:[]});
   if(groups.length)groups.at(-1).rows.push(r);
  }
  const starts=grid[0].map((d,c)=>c>=3&&Number.isInteger(d)&&d>=1&&d<=30?{d,c}:null).filter(Boolean);
  for(let b=0;b<starts.length;b++){
   const {d,c}=starts[b],end=starts[b+1]?.c??grid[1].length;
   const date=(source.month??'2026-09')+'-'+String(d).padStart(2,'0');if(source.through&&date>source.through)continue;
   const headers=grid[1].slice(c,end).map(s=>String(s??'').trim());
   if(['Terpakai Real','stok awal aktual','stok akhir aktual','Waste','Promo'].some(h=>!headers.includes(h))){for(const g of groups)issues.push({id,product:g.name,date,reason:'header-mismatch'});continue;}
   const idx=label=>{const x=headers.findIndex(s=>s===label);if(x<0)throw Error('Missing stock header '+label);return c+x;};
   const used=idx('Terpakai Real'),opening=idx('stok awal aktual'),closing=idx('stok akhir aktual'),waste=idx('Waste'),promo=idx('Promo');
   const additions=headers.flatMap((s,i)=>s==='Tambah Stok'||s==='Transfer'?[c+i]:[]);
   for(const group of groups){
    let quantity=0,remaining=0,reason=null;
    for(const r of group.rows){
     const row=grid[r],value=row[used],fields=[opening,closing,waste,promo,...additions];
     if(!finite(value)||fields.some(i=>!blank(row[i])&&!finite(row[i]))){reason='missing-or-invalid';break;}
     if(value<0||[opening,closing,waste,promo].some(i=>finite(row[i])&&row[i]<0)){reason='negative';break;}
     const n=i=>blank(row[i])?0:row[i];
     const expected=n(opening)+sum(additions.map(n))-n(waste)-n(promo)-n(closing);
     if(Math.abs(value-expected)>0.0001){reason='stock-balance';break;}
     // Explicit operational inputs distinguish observed zeros from unfilled formula zeros.
     if(fields.every(i=>blank(row[i]))){reason='unfilled';break;}
     quantity+=value;remaining+=n(closing);
    }
    const key=id+'|'+group.name+'|'+date;if(seen.has(key))throw Error('Duplicate stock record');seen.add(key);
    if(reason)issues.push({id,product:group.name,date,reason});
    else series.push({id,product:group.name,unit:group.unit,date,quantity,zeroClosing:quantity>0&&remaining===0});
   }
  }
 }
 return {series,issues};
}
export function buildEvaluation(tracking,stock,profiles,asOf='2026-10-16'){
 const aliases=Object.fromEntries(Object.entries(profiles.outlets).map(([id,o])=>[norm(o.name),id]));
 Object.assign(aliases,{jakal:'jakal-uii',gajah:'gajah-raya',magelang:'pemuda-magelang',muntilan:'muntilann',jebres:'uns',makamhaji:'makamhaji'});
 const t=parseTracking(tracking,aliases,asOf),q=parseProducts(stock,aliases),outlets={};
 const months=[['2026-08','Agustus 2026',31],['2026-09','September 2026',30],['2026-10','1–15 Oktober 2026',15]];
 for(const [id,profile]of Object.entries(profiles.outlets).filter(([,o])=>o.hasProfile)){
  const rows=t.rows.filter(r=>r.id===id),issues=t.issues.filter(r=>r.id===id),products=q.series.filter(r=>r.id===id),productIssues=q.issues.filter(r=>r.id===id);
  const periods={};
  for(const [month,label,expectedDays]of months){
   const selected=rows.filter(r=>r.date.startsWith(month)),bad=issues.filter(r=>r.date.startsWith(month));
   const original=selected.filter(r=>r.original!==null),lost=selected.filter(r=>r.minutes!==null);
   periods[month]={label,expectedDays,...metrics(selected),original:metrics(original.map(r=>({...r,prediction:r.original}))),comparison:metrics(original),excludedDates:bad,missingDays:expectedDays-selected.length-bad.length,stockoutDays:lost.filter(r=>r.minutes>0).length,stockoutObservedDays:lost.length,stockoutMedianMinutes:median(lost.filter(r=>r.minutes>0).map(r=>r.minutes)),matureWasteThrough:selected.filter(r=>r.wasteComplete).at(-1)?.date??null};
  }
  const byProduct=[...new Set([...products.map(r=>r.product),...productIssues.map(r=>r.product)])].map(name=>{
   const rs=products.filter(r=>r.product===name),bad=productIssues.filter(r=>r.product===name),avg=rs.length?sum(rs.map(r=>r.quantity))/rs.length:0;
   const weekdays=[1,2,3,4,5,6,0].map(day=>{const pool=rs.filter(r=>dayOf(r.date)===day);return{day,days:pool.length,index:pool.length>=3&&avg>0?round(100*sum(pool.map(r=>r.quantity))/pool.length/avg):null};});
   if(new Set(rs.map(r=>r.unit)).size>1)throw Error('Product unit changed');
   return{name,unit:rs[0]?.unit??null,days:rs.length,activeDays:rs.filter(r=>r.quantity>0).length,excludedDays:bad.length,zeroClosingDays:rs.filter(r=>r.zeroClosing).length,weekdays,backtest:backtest(rs),plans:Array.from({length:7},(_,i)=>baseline(rs,shift(asOf,i+1))),issues:bad};
  });
  outlets[id]={name:profile.name,periods,products:byProduct,stockThrough:products.map(r=>r.date).sort().at(-1)??null,trackingThrough:'2026-10-15',status:'trial-baseline'};
 }
 return {public:{schemaVersion:1,updatedAt:asOf,scope:'Rekap Malmil & Ogura; stok harian 13 jenis produk utama',stockMetric:'Penjualan bersih dalam satuan produk',stockMetricConfirmed:true,stockMetricConfirmedAt:'2026-10-16',operationalForecastReady:false,outlets},private:{tracking:t,stock:q}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [trackingFile,stockFile,privateOutput]=process.argv.slice(2);if(!trackingFile||!stockFile||!privateOutput)throw Error('Required: tracking JSON, stock JSON, private audit path');
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../forecast/outlet-intelligence-data.js',import.meta.url),'utf8'),ctx);
 const result=buildEvaluation(JSON.parse(fs.readFileSync(trackingFile)),JSON.parse(fs.readFileSync(stockFile)),ctx.window.OUTLET_INTELLIGENCE);
 fs.writeFileSync(privateOutput,JSON.stringify(result.private));
 fs.writeFileSync(new URL('../forecast/forecast-evaluation-data.js',import.meta.url),'window.FORECAST_EVALUATION = '+JSON.stringify(result.public)+';\n');
 console.log(JSON.stringify({outlets:Object.keys(result.public.outlets).length,trackingValid:result.private.tracking.rows.length,trackingExcluded:result.private.tracking.issues.length,productValid:result.private.stock.series.length,productExcluded:result.private.stock.issues.length}));
}
