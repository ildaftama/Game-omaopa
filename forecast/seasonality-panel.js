'use strict';
window.SeasonalityPanel=(()=>{
 let view='monthly';
 const money=n=>n.toLocaleString('id-ID',{maximumFractionDigits:0});
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function chart(points,daily){
  const valid=points.filter(p=>p.amount!==null);if(!valid.length)return '<div class="workspace-empty">Belum ada hari dengan data lengkap untuk pilihan ini.</div>';
  const width=1000,height=300,left=72,right=25,top=25,bottom=48,max=Math.max(...valid.map(p=>p.amount),1)*1.15;
  const x=i=>left+i*(width-left-right)/Math.max(points.length-1,1),y=n=>height-bottom-n/max*(height-top-bottom);
  const segments=[];let run=[];points.forEach((p,i)=>{if(p.amount===null){if(run.length)segments.push(run);run=[];}else run.push([p,i]);});if(run.length)segments.push(run);
  const grid=[0,.25,.5,.75,1].map(f=>{const n=max*f;return `<line x1="${left}" x2="${width-right}" y1="${y(n)}" y2="${y(n)}" stroke="#e8edf2"/><text x="${left-10}" y="${y(n)+4}" text-anchor="end">${money(n/1e6)} jt</text>`;}).join('');
  const lines=segments.map(s=>`<polyline points="${s.map(([p,i])=>x(i)+','+y(p.amount)).join(' ')}" fill="none" stroke="#24566d" stroke-width="2.5"/>`).join('');
  const dots=points.map((p,i)=>p.amount===null?'':`<circle tabindex="0" cx="${x(i)}" cy="${y(p.amount)}" r="${daily?3:5}" fill="#24566d" aria-label="${esc(p.label)}: Rp${money(p.amount)}; ${p.days??1} hari tercatat"><title>${esc(p.label)} · Rp${money(p.amount)}${p.days?' rata-rata/hari · '+p.days+' hari siap / '+p.observedDays+' hari omzet':''}</title></circle>`).join('');
  const labels=points.map((p,i)=>!daily||i===0||i===points.length-1||p.date?.endsWith('-01')?`<text x="${x(i)}" y="${height-15}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(daily?p.date.slice(5):p.label)}</text>`:'').join('');
  return `<div class="revenue-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tren omzet tanpa pesanan 2026, ${daily?'harian':'rata-rata harian per bulan'}. Data kosong tidak dihubungkan.">${grid}${lines}${dots}${labels}</svg></div>`;
 }
 return {render(id){
  const d=window.REVENUE_TREND_2026,o=d?.outlets[id],all=id==='__all__',series=all?d?.network:o;
  if(!series)return '<div class="workspace-empty">Data omzet tanpa pesanan sedang dilengkapi.</div>';
  const daily=view==='daily',points=daily?series.daily:series.monthly;
  const date=s=>s?new Date(s+'T12:00:00+07:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'}):'—';
  return `<section class="revenue-trend"><div class="trend-heading"><div><h3>${all?'Gabungan outlet':esc(o.name)}</h3><p class="workspace-note">Omzet outlet · tanpa pesanan</p></div><div class="trend-toggle" role="group" aria-label="Tampilan grafik"><button data-trend-view="monthly" aria-pressed="${!daily}">Bulanan</button><button data-trend-view="daily" aria-pressed="${daily}">Harian</button></div></div><p class="trend-metric">${daily?'Omzet harian tanpa pesanan':'Rata-rata omzet harian'}</p>${chart(points,daily)}<div class="trend-footer"><span>${date(series.from)}–${date(series.through)} 2026 · ${series.validDays} dari ${series.observedDays} hari siap dianalisis</span><span>Data belum lengkap ditampilkan sebagai jeda.</span></div><details class="workspace-details"><summary>Kelengkapan per bulan & sumber</summary><div class="table-wrap"><table class="snapshot-table"><thead><tr><th>Bulan</th><th>Hari dalam bulan</th><th>Omzet tersedia</th><th>Sudah dipisahkan</th></tr></thead><tbody>${series.monthly.map(p=>`<tr><td>${esc(p.label)}</td><td>${p.calendarDays}</td><td>${p.observedDays}</td><td>${p.days}</td></tr>`).join('')}</tbody></table></div><p>Sudah dipisahkan berarti omzet pesanan sudah dikurangi dari penjualan hari itu. Selisih jumlah hari menunjukkan data yang masih perlu diperiksa. Bulan berjalan hanya memakai tanggal yang sudah masuk.</p><p>${esc(series.sourceLabel)}. Nilai kue pesanan dikurangi sesuai outlet tujuan dan tanggal pengambilan. Ongkir dan pengeluaran internal tidak dihitung sebagai penjualan kue.</p><p>Rata-rata bulanan memakai sedikitnya ${d.minimumMonthlyDays} hari yang lolos pemeriksaan; belum mewakili seluruh hari dalam bulan. Arahkan ke titik untuk melihat jumlah hari. ${all?'Gabungan mengikuti outlet yang beroperasi pada tanggal tersebut; dua outlet tutup mulai Februari.':'Cakupan laporan outlet tersedia mulai Juni.'}</p><p>Catatan tanpa tujuan yang diminta pemilik untuk diabaikan dikeluarkan dari perhitungan. Nilai pesanan yang masih berbeda antar sumber tetap diperiksa; tanggalnya ditampilkan sebagai jeda.</p></details></section>`;
 },click(e){const b=e.target.closest('[data-trend-view]');if(!b)return false;view=b.dataset.trendView;return true;}};
})();
