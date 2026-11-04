'use strict';
// Open-Meteo: gratis, tanpa API key. Forecast API untuk hari ini s.d. ±16 hari ke depan,
// Archive API (ERA5 reanalysis) untuk tanggal yang sudah lewat. Kegagalan jaringan/API tidak
// pernah memaksakan angka — selalu kembalikan {error} dan biarkan pemanggil menampilkan
// "cuaca belum tersedia", bukan mengarang data cuaca.
window.WeatherForecast=(()=>{
 const cache=new Map();
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 function outletCoords(outletId){
  const o=window.OUTLET_DATA?.outlets?.find(x=>x.id===outletId);
  return o&&Number.isFinite(o.lat)&&Number.isFinite(o.lon)?{lat:o.lat,lon:o.lon}:null;
 }
 async function fetchJson(url){
  let r;try{r=await fetch(url,{signal:AbortSignal.timeout(8000)});}catch{throw Error('network');}
  if(!r.ok)throw Error('http-'+r.status);
  return r.json();
 }
 async function get(outletId,date){
  const key=outletId+'|'+date,cached=cache.get(key);if(cached)return cached;
  const promise=(async()=>{
   const coords=outletCoords(outletId);
   if(!coords)return {date,outletId,error:'Koordinat outlet belum tersedia untuk ramalan cuaca.'};
   const past=date<today();
   try{
    if(past){
     const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${date}&end_date=${date}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FJakarta`;
     const d=await fetchJson(url),i=d.daily?.time?.indexOf(date);
     if(i==null||i<0)return {date,outletId,error:'Arsip cuaca tanggal ini belum tersedia.'};
     return {date,outletId,source:'archive',probability:null,precipitationMm:d.daily.precipitation_sum[i]??null,tempMax:d.daily.temperature_2m_max[i]??null,tempMin:d.daily.temperature_2m_min[i]??null};
    }
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${date}&end_date=${date}&daily=precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FJakarta`;
    const d=await fetchJson(url),i=d.daily?.time?.indexOf(date);
    if(i==null||i<0)return {date,outletId,error:'Tanggal ini di luar jangkauan ramalan cuaca (±16 hari).'};
    return {date,outletId,source:'forecast',probability:d.daily.precipitation_probability_max[i]??null,precipitationMm:d.daily.precipitation_sum[i]??null,tempMax:d.daily.temperature_2m_max[i]??null,tempMin:d.daily.temperature_2m_min[i]??null};
   }catch{return {date,outletId,error:'Layanan cuaca (Open-Meteo) belum dapat dihubungi.'};}
  })();
  cache.set(key,promise);return promise;
 }
 return {get};
})();
