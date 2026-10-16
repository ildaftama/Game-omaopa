const MONTHS=['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
const monthKey=(y,m)=>y+'-'+String(m).padStart(2,'0');
const serial=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
const shift=(m,n)=>{const s=serial(m)+n;return monthKey(Math.floor(s/12),s%12+1);};
export const calendarDays=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).getUTCDate();
export const median=xs=>{const a=xs.slice().sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const value=c=>c?.effectiveValue?.numberValue??c?.effectiveValue?.stringValue??null;
const colName=n=>{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseMonthly(sources,aliases,{through='2026-09',closures={pleburan:'2026-02',borobudur:'2026-02'}}={}){
 const rows=[],issues=[],seen=new Set();
 for(const source of sources)for(const sheet of source.sheets){
  const year=Number(sheet.properties.title.match(/^OUTLET (\d{4})$/)?.[1]);if(!year)throw Error('Unexpected source sheet');
  for(const block of sheet.data){
   const grid=block.rowData?.map(r=>(r.values??[]).map(value))??[],title=String(grid[0]?.[0]??''),name=title.split('(')[0].trim(),id=aliases[norm(name)];
   if(!id)throw Error('Unmapped monthly outlet '+name);
   if(norm(grid[1]?.[0])!=='bulan'||norm(grid[1]?.[1])!=='omzet')throw Error('Monthly headers changed '+title);
   const opening=title.match(/\b(\d{1,2})\s*([A-Za-z]+)\s+(\d{4})\b/),openingMonth=opening?MONTHS.indexOf(opening[2].toLowerCase())+1:0;
   if(!opening||!openingMonth)throw Error('Opening date missing '+title);
   const opened=monthKey(Number(opening[3]),openingMonth),firstFull=Number(opening[1])===1?opened:shift(opened,1);
   for(let m=1;m<=12;m++){
    const date=monthKey(year,m);if(date>through)continue;
    if(norm(grid[m+1]?.[0])!==MONTHS[m-1])throw Error('Unexpected month label '+title+' '+date);
    const key=id+'|'+date;if(seen.has(key))throw Error('Duplicate monthly outlet/date');seen.add(key);
    const amount=grid[m+1]?.[1],sourceCell=colName(block.startColumn+1)+(block.startRow+m+2);
    const status=date<opened?'not-open':date<firstFull?'opening-partial':closures[id]&&date>=closures[id]?'closed':amount===null?'missing':!Number.isFinite(amount)||amount<0?'invalid':amount===0?'zero-unconfirmed':'observed';
    const row={id,name,date,amount,days:calendarDays(date),daily:Number.isFinite(amount)?amount/calendarDays(date):null,status,sourceSheet:sheet.properties.title,sourceCell,firstFull};rows.push(row);
    if(['missing','invalid','zero-unconfirmed'].includes(status))issues.push({id,date,status,sourceCell});
   }
  }
 }
 return {rows,issues};
}
const usable=r=>r.status==='observed'&&Number.isFinite(r.daily)&&r.daily>0;
function solve(a,b){
 a=a.map((r,i)=>[...r,b[i]]);const n=b.length;
 for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;if(Math.abs(a[p][c])<1e-10)return null;[a[c],a[p]]=[a[p],a[c]];const d=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=d;for(let r=0;r<n;r++)if(r!==c){const f=a[r][c];for(let j=c;j<=n;j++)a[r][j]-=f*a[c][j];}}
 return a.map(r=>r[n]);
}
export function fitMonthly(records,target,{lambda=4,seasonal=true}={}){
 const prior=records.filter(r=>r.date<target&&usable(r)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
 if(prior.length<(seasonal?18:9))return null;
 const center=prior.reduce((s,r)=>s+serial(r.date),0)/prior.length,size=seasonal?14:2;
 const features=date=>[1,(serial(date)-center)/12,...(seasonal?Array.from({length:12},(_,i)=>Number(Number(date.slice(5,7))===i+1)):[])];
 const x=prior.map(r=>features(r.date)),y=prior.map(r=>Math.log(r.daily));let weights=prior.map(()=>1),beta=null;
 for(let pass=0;pass<4;pass++){
  const a=Array.from({length:size},()=>Array(size).fill(0)),b=Array(size).fill(0);
  for(let k=0;k<x.length;k++)for(let i=0;i<size;i++){b[i]+=weights[k]*x[k][i]*y[k];for(let j=0;j<size;j++)a[i][j]+=weights[k]*x[k][i]*x[k][j];}
  for(let i=1;i<size;i++)a[i][i]+=i===1?.1:lambda;
  beta=solve(a,b);if(!beta)return null;
  weights=y.map((v,k)=>{const e=Math.abs(v-x[k].reduce((s,z,i)=>s+z*beta[i],0));return e<=.2?1:.2/e;});
 }
 const predict=date=>Math.exp(features(date).reduce((s,v,i)=>s+v*beta[i],0));
 return {months:prior.length,from:prior[0].date,through:prior.at(-1).date,annualTrendPercent:100*(Math.exp(beta[1])-1),monthFactors:seasonal?beta.slice(2).map(v=>Math.exp(v)):null,trendLevel:date=>Math.exp(beta[0]+beta[1]*(serial(date)-center)/12),predict};
}
export const MONTHLY_METHODS=['median-3','last-month','year-ago-adjusted','blend-season','trend','season-ridge-4','season-ridge-8'];
export function monthlyForecast(records,target,method){
 if(!MONTHLY_METHODS.includes(method))throw Error('Unknown monthly method');
 const s=new Map(records.filter(r=>r.date<target&&usable(r)).map(r=>[r.date,r.daily]));
 const recent=[1,2,3].map(n=>s.get(shift(target,-n))).filter(x=>x!==undefined);if(recent.length<2)return null;
 const base=median(recent);let daily=base,fallback=false;
 if(method==='last-month')daily=s.get(shift(target,-1))??base;
 if(method==='year-ago-adjusted'||method==='blend-season'){
  const annual=s.get(shift(target,-12)),ratios=[1,2,3].map(n=>{const a=s.get(shift(target,-n)),b=s.get(shift(target,-n-12));return a!==undefined&&b>0?a/b:null;}).filter(v=>v!==null);
  if(annual>0&&ratios.length>=2){const seasonal=annual*median(ratios);daily=method==='blend-season'?(base+seasonal)/2:seasonal;}else fallback=true;
 }
 if(['trend','season-ridge-4','season-ridge-8'].includes(method)){
  const model=fitMonthly(records,target,{seasonal:method!=='trend',lambda:method==='season-ridge-8'?8:4});if(model)daily=Math.max(base*.5,Math.min(base*1.8,model.predict(target)));else fallback=true;
 }
 return {prediction:Math.round(daily*calendarDays(target)),daily,fallback};
}
export function compareCohort(rows,ids,monthsA,monthsB){
 if(monthsA.length!==monthsB.length)throw Error('Comparison periods differ');
 const included=ids.filter(id=>[...monthsA,...monthsB].every(date=>rows.some(r=>r.id===id&&r.date===date&&usable(r))));
 const total=months=>rows.filter(r=>included.includes(r.id)&&months.includes(r.date)).reduce((s,r)=>s+r.amount,0),a=total(monthsA),b=total(monthsB);
 return {outlets:included.length,expectedOutlets:ids.length,months:monthsA.length,from:monthsA,to:monthsB,changePercent:a>0?100*(b/a-1):null,excluded:ids.filter(id=>!included.includes(id))};
}
