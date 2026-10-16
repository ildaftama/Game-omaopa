import fs from 'node:fs';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const pct=(a,b)=>finite(a)&&finite(b)&&b>0?Math.round(a/b*1000)/10:null;
const change=(a,b)=>finite(a)&&finite(b)&&b>0?Math.round((a/b-1)*1000)/10:null;
export function estimateLostSales(minutes,days,openHours=12){if(!finite(minutes)||minutes<0||!Number.isInteger(days)||days<=0||!finite(openHours)||openHours<=0)return null;return pct(minutes,days*openHours*60);}
export function performanceSummary(source,tracking,profiles){
 const aliases=Object.fromEntries(Object.entries(profiles.outlets).map(([id,o])=>[norm(o.name),id]));Object.assign(aliases,{jakal:'jakal-uii',gajah:'gajah-raya',magelang:'pemuda-magelang',muntilan:'muntilann',jebres:'uns',merbabuklaten:'merbabu',rajawaliklaten:'rajawali',muhammadiyahsurakarta:'ums'});
 const getId=name=>aliases[norm(name)],periods=[['Agustus','Juli','august','2026-08',31,31],['September','Agustus','september','2026-09',30,31]],outlets={};
 for(const [id,o]of Object.entries(profiles.outlets).filter(([,o])=>o.hasProfile)){
  const history=source.values.slice(1).filter(r=>getId(r[1])===id),result={};
  for(const [month,previous,trackingKey,key,days,previousDays]of periods){
   const matches=history.filter(r=>r[2]===month);if(matches.length>1)throw Error('Duplicate monthly outlet');const r=matches[0],prev=history.find(r=>r[2]===previous);
   if(!r||!finite(r[8])||r[8]<=0){result[key]=null;continue;}
   const sheet=tracking[trackingKey],stockRow=sheet.values.slice(3).find(row=>getId(row[0])===id),minutes=[];
   if(stockRow)for(let d=0;d<days;d++){const v=stockRow[10+d*10];if(finite(v)&&v>=0)minutes.push(v);}
   const duration=minutes.reduce((a,b)=>a+b,0),pax=finite(r[7])&&r[7]>0?r[7]:null,basket=pax?r[8]/pax:null;
   const prevPax=finite(prev?.[7])&&prev[7]>0?prev[7]:null,prevBasket=prevPax&&finite(prev[8])?prev[8]/prevPax:null;
   result[key]={label:month+' 2026',days,sourceBasketConsistent:basket!==null&&finite(r[9])?Math.abs(basket-r[9])<1:null,wastePercent:pct(r[4],r[8]),sourceLostSalesPercent:pct(r[5],r[8]),estimatedLostSalesPercent:minutes.length===days?estimateLostSales(duration,days):null,lossAssumedOpeningHours:12,lossObservedDays:minutes.length,stockoutDays:minutes.filter(x=>x>0).length,stockoutMinutes:duration,netMarginPercent:pct(r[3],r[8]),salesChange:change(r[8],prev?.[8]),dailySalesChange:change(r[8]/days,finite(prev?.[8])?prev[8]/previousDays:null),dailyPaxChange:change(pax===null?null:pax/days,prevPax===null?null:prevPax/previousDays),basketChange:change(basket,prevBasket),sourceLostSalesVerified:false};
  }
  outlets[id]={name:o.name,periods:result};
 }
 return {updatedAt:'2026-10-16',source:'PERFORMA OUTLET + Rekap Harian Forecast',latestCompletePeriod:'2026-09',lossMethod:'Durasi bulan yang sesuai / hari kalender / 12 jam; mengasumsikan penjualan merata selama jam buka.',outlets};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [sourceFile,trackingFile]=process.argv.slice(2);if(!sourceFile||!trackingFile)throw Error('Required: PRIVATE_PERFORMANCE_JSON PRIVATE_TRACKING_JSON');const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../forecast/outlet-intelligence-data.js',import.meta.url),'utf8'),ctx);const result=performanceSummary(JSON.parse(fs.readFileSync(sourceFile)),JSON.parse(fs.readFileSync(trackingFile)),ctx.window.OUTLET_INTELLIGENCE);fs.writeFileSync(new URL('../forecast/performance-summary-data.js',import.meta.url),'window.PERFORMANCE_SUMMARY='+JSON.stringify(result)+';\n');console.log(JSON.stringify({outlets:Object.keys(result.outlets).length,latest:result.latestCompletePeriod,basketMismatches:Object.values(result.outlets).flatMap(o=>Object.values(o.periods)).filter(p=>p?.sourceBasketConsistent===false).length}));}
