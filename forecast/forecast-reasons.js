'use strict';
// Alasan HANYA muncul kalau ada hal yang benar-benar signifikan (cuaca berisiko, event,
// pola hari yang menyimpang jelas dari biasanya, atau kombinasi produk×hari yang historis
// bermasalah). Tidak ada kalimat baku "rekomendasi dari median..." yang selalu tampil —
// forecaster tidak perlu membaca teori kalau situasinya normal.
window.ForecastReasons=(()=>{
 const dayNames=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
 const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
 const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;};
 function eventsOn(outletId,date){
  const name=window.OUTLET_INTELLIGENCE?.outlets?.[outletId]?.name;
  return (window.INSIGHT_DATA?.events||[]).filter(e=>e.start<=date&&e.end>=date&&(e.outletId===outletId||e.outletHints?.includes(name)||e.outletHint===name));
 }
 function weatherLine(weather){
  if(!weather||weather.error)return null;
  if(weather.source==='forecast'&&weather.probability!=null&&weather.probability>=65)
   return `Ramalan cuaca: probabilitas hujan ${weather.probability}% pada tanggal kiriman — outlet ini berpotensi lebih sepi dari biasanya.`;
  if(weather.source==='archive'&&weather.precipitationMm!=null&&weather.precipitationMm>=20)
   return `Catatan cuaca tanggal ini: curah hujan ${weather.precipitationMm} mm — kemungkinan ada pengaruh terhadap kunjungan.`;
  return null;
 }
 // Pola hari: median total 4 SKU inti pada hari ini vs median hari lain, 8 minggu terakhir.
 function weekdayLine(outletId,date){
  const data=window.PcsPanels?.data?.();if(!data?.sales||!data?.orders)return null;
  const math=window.PcsMath,planner=window.ForecastPlanner,target=weekday(date),from=planner.shift(date,-56);
  const dates=[...new Set((data.sales.days||[]).filter(r=>r.id===outletId&&r.date>=from&&r.date<date).map(r=>r.date))];
  if(dates.length<14)return null;
  const byDate=new Map();
  for(const p of [0,1,2,3])for(const v of math.estimatedPartition(data.sales,data.orders,[outletId],p,dates))
   if(v.total.complete)byDate.set(v.date,(byDate.get(v.date)||0)+v.total.value);
  const all=[...byDate.values()],sameDay=[...byDate.entries()].filter(([d])=>weekday(d)===target).map(([,v])=>v);
  if(all.length<14||sameDay.length<3)return null;
  const overall=median(all),thisDay=median(sameDay);
  if(!overall)return null;
  const ratio=thisDay/overall;
  if(ratio>0.85&&ratio<1.15)return null;
  const pct=Math.round(Math.abs(ratio-1)*100);
  return `${dayNames[target]} historis ${ratio<1?'lebih sepi':'lebih ramai'} ${pct}% dari rata-rata hari lain di outlet ini (8 minggu terakhir).`;
 }
 // Konteks per outlet+tanggal — tampil SEKALI di atas form, bukan diulang per produk.
 async function contextFor(outletId,date){
  const weather=await window.WeatherForecast.get(outletId,date);
  const lines=[weatherLine(weather),weekdayLine(outletId,date),...eventsOn(outletId,date).map(e=>`Ada kegiatan "${e.title}" pada tanggal ini (${e.venue||e.region||''}) — tinjau pengaruhnya, bukan otomatis menaikkan jumlah.`)];
  if(window.OutletResearchNotes?.category(outletId)==='kampus'&&weekday(date)===6)
   lines.push('Outlet kampus pada hari Sabtu historis paling sulit diprediksi di jaringan ini.');
  return lines.filter(Boolean);
 }
 // Catatan spesifik per produk (bukan konteks umum) — hanya kombinasi yang historis menonjol.
 function productNote(outletId,date,productIndex){
  if(productIndex===1&&weekday(date)===3)return 'Ogura Choco × Rabu: kombinasi dengan selisih prediksi terbesar di jaringan ini.';
  return null;
 }
 return {contextFor,productNote,weekday,dayNames};
})();
