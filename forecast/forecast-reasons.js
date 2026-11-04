'use strict';
// Setiap angka rekomendasi disertai alasan konkret — bukan ML baru, mesin berbasis aturan
// (threshold deterministik) di atas data yang sudah dipakai forecast-planner-model.js, plus
// event yang sudah ada (INSIGHT_DATA) dan cuaca (WeatherForecast). Forecast tetap rekomendasi +
// buffer: alasan membantu forecaster menilai, tidak menggantikan keputusan mereka.
window.ForecastReasons=(()=>{
 const dayNames=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
 const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
 function eventsOn(outletId,date){
  const name=window.OUTLET_INTELLIGENCE?.outlets?.[outletId]?.name;
  return (window.INSIGHT_DATA?.events||[]).filter(e=>e.start<=date&&e.end>=date&&(e.outletId===outletId||e.outletHints?.includes(name)||e.outletHint===name));
 }
 function weatherReason(weather){
  if(!weather||weather.error)return weather?.error?[weather.error]:[];
  if(weather.source==='forecast'&&weather.probability!=null){
   if(weather.probability>=70)return [`Ramalan cuaca: probabilitas hujan ${weather.probability}% pada tanggal kiriman — outlet ini berpotensi lebih sepi dari biasanya karena cuaca.`];
   if(weather.probability<=20)return [`Ramalan cuaca: kemungkinan hujan rendah (${weather.probability}%), belum ada indikasi penurunan kunjungan karena cuaca.`];
   return [`Ramalan cuaca: probabilitas hujan ${weather.probability}%, suhu ${weather.tempMin}–${weather.tempMax}°C.`];
  }
  if(weather.source==='archive'&&weather.precipitationMm!=null){
   if(weather.precipitationMm>=20)return [`Catatan cuaca tanggal ini: curah hujan ${weather.precipitationMm} mm — kemungkinan ada pengaruh terhadap kunjungan hari itu.`];
   return [`Catatan cuaca tanggal ini: curah hujan ${weather.precipitationMm} mm, suhu ${weather.tempMin}–${weather.tempMax}°C.`];
  }
  return [];
 }
 function productReasons(rec,outletId,date,p){
  const reasons=[],wd=weekday(date),dayName=dayNames[wd];
  if(rec.tolerance)reasons.push(`Rekomendasi memakai snapshot hasil riset (metode ${rec.method}); rentang kerja ±10% adalah batas kerja input, bukan interval statistik.`);
  else if(rec.central!=null)reasons.push(`Rekomendasi ${rec.central} PCS dari median penjualan hari ${dayName} pada ${rec.samples} tanggal pembanding sampai ${rec.through}`+(rec.fallback?' (riwayat hari yang sama belum cukup, memakai 14 hari penjualan terakhir sebagai gantinya)':'')+'.');
  else reasons.push('Belum ada riwayat penjualan yang cukup untuk produk ini di outlet dan tanggal tersebut — isi berdasarkan pengetahuan lapangan.');
  return reasons;
 }
 async function forOutlet(outletId,date,recs){
  const weather=await window.WeatherForecast.get(outletId,date),weatherLines=weatherReason(weather),events=eventsOn(outletId,date),wd=weekday(date);
  const eventLines=events.map(e=>`Ada kegiatan "${e.title}" pada tanggal ini (${e.venue||e.region||''}) — tinjau pengaruhnya sebelum mengubah kiriman, jangan otomatis menaikkan jumlah.`);
  return recs.map((rec,p)=>[...productReasons(rec,outletId,date,p),...weatherLines,...eventLines,...window.OutletResearchNotes.notes(outletId,wd,p)].slice(0,4));
 }
 return {forOutlet,weekday,dayNames};
})();
