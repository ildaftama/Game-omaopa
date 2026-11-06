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
    // precipitation_probability_MEAN (rata-rata sepanjang hari), BUKAN _max -- _max gampang
    // menyentuh 100% hanya karena SATU jam diprediksi pasti hujan, padahal sepanjang hari
    // belum tentu seberat itu (owner cek sendiri: kejadian hujan hari itu <90%, bukan 100%
    // seperti yang tadinya ditampilkan). Rata-rata jauh lebih jarang menyentuh 100%, lebih
    // mewakili "kemungkinan hujan hari ini" yang wajar dipahami, bukan puncak sesaat.
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${date}&end_date=${date}&daily=precipitation_probability_mean,precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FJakarta`;
    const d=await fetchJson(url),i=d.daily?.time?.indexOf(date);
    if(i==null||i<0)return {date,outletId,error:'Tanggal ini di luar jangkauan ramalan cuaca (±16 hari).'};
    return {date,outletId,source:'forecast',probability:d.daily.precipitation_probability_mean[i]??null,precipitationMm:d.daily.precipitation_sum[i]??null,tempMax:d.daily.temperature_2m_max[i]??null,tempMin:d.daily.temperature_2m_min[i]??null,weatherCode:d.daily.weathercode?.[i]??null};
   }catch{return {date,outletId,error:'Layanan cuaca (Open-Meteo) belum dapat dihubungi.'};}
  })();
  cache.set(key,promise);return promise;
 }
 // Satu panggilan Open-Meteo untuk banyak outlet sekaligus (dashboard jaringan) — bukan
 // satu request per outlet. date/dateTo harus dalam jangkauan forecast (hari ini..+16 hari).
 async function getNetwork(outletIds,date,dateTo){
  const to=dateTo||date,rows=outletIds.map(id=>({id,coords:outletCoords(id)})).filter(r=>r.coords);
  if(!rows.length)return new Map();
  const key='net|'+rows.map(r=>r.id).join(',')+'|'+date+'|'+to,cached=cache.get(key);if(cached)return cached;
  const promise=(async()=>{
   const lat=rows.map(r=>r.coords.lat).join(','),lon=rows.map(r=>r.coords.lon).join(',');
   // precipitation_probability_MEAN, bukan _max -- lihat catatan di get() di atas. weathercode
   // ditambah untuk ikon kondisi (cerah/berawan/hujan dll) di peta cuaca jaringan.
   const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${to}&daily=precipitation_probability_mean,precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FJakarta`;
   const map=new Map();
   try{
    const d=await fetchJson(url),list=Array.isArray(d)?d:[d];
    rows.forEach((r,i)=>{
     const dd=list[i]?.daily;if(!dd){map.set(r.id,{error:'Ramalan cuaca belum tersedia.'});return;}
     const byDate=new Map(dd.time.map((t,j)=>[t,j]));
     const days=[];for(let s=date;s<=to;s=new Date(new Date(s+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10)){
      const j=byDate.get(s);days.push(j==null?{date:s,error:true}:{date:s,probability:dd.precipitation_probability_mean[j]??null,precipitationMm:dd.precipitation_sum[j]??null,tempMax:dd.temperature_2m_max[j]??null,tempMin:dd.temperature_2m_min[j]??null,weatherCode:dd.weathercode?.[j]??null});
     }
     map.set(r.id,{days,coords:r.coords});
    });
   }catch{for(const r of rows)map.set(r.id,{error:'Layanan cuaca (Open-Meteo) belum dapat dihubungi.'});}
   return map;
  })();
  cache.set(key,promise);return promise;
 }
 return {get,getNetwork};
})();
