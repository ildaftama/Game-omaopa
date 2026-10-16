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
  const dots=points.map((p,i)=>p.amount===null?'':`<circle tabindex="0" cx="${x(i)}" cy="${y(p.amount)}" r="${daily?3:5}" fill="#24566d" aria-label="${esc(p.label)}: Rp${money(p.amount)}; ${p.days??1} hari tercatat"><title>${esc(p.label)} · Rp${money(p.amount)}${p.days?' rata-rata/hari · '+p.days+' hari tercatat':''}</title></circle>`).join('');
  const labels=points.map((p,i)=>!daily||i===0||i===points.length-1||p.date?.endsWith('-01')?`<text x="${x(i)}" y="${height-15}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(daily?p.date.slice(5):p.label)}</text>`:'').join('');
  return `<div class="revenue-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tren omzet tanpa pesanan 2026, ${daily?'harian':'rata-rata harian per bulan'}. Data kosong tidak dihubungkan.">${grid}${lines}${dots}${labels}</svg></div>`;
 }
 return {render(id){
  const d=window.REVENUE_TREND_2026,o=d?.outlets[id],all=id==='__all__',series=all?d?.network:o;
  if(!series)return '<div class="workspace-empty">Data omzet tanpa pesanan sedang dilengkapi.</div>';
  const daily=view==='daily',points=daily?series.daily:series.monthly;
  return `<section class="revenue-trend"><div class="trend-heading"><div><h3>${all?'Gabungan 28 outlet':esc(o.name)}</h3><p class="workspace-note">Malmil & Ogura · tanpa pesanan</p></div><div class="trend-toggle" role="group" aria-label="Tampilan grafik"><button data-trend-view="monthly" aria-pressed="${!daily}">Bulanan</button><button data-trend-view="daily" aria-pressed="${daily}">Harian</button></div></div><p class="trend-metric">${daily?'Omzet per hari':'Rata-rata omzet per hari, dikelompokkan per bulan'}</p>${chart(points,daily)}<div class="trend-footer"><span>${esc(d.coverageLabel)}</span><span>${all?'Hanya tanggal dengan 28 outlet lengkap.':'Hanya data yang lolos pemeriksaan.'} Data kosong tidak dianggap nol.</span></div><p class="workspace-note">Mini dan Cisfon belum termasuk. Januari–Juni belum tersedia pada grafik.</p></section>`;
 },click(e){const b=e.target.closest('[data-trend-view]');if(!b)return false;view=b.dataset.trendView;return true;}};
})();
