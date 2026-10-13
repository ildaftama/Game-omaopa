'use strict';
(()=>{
 const $=s=>document.querySelector(s),data=window.ANALYSIS_DATA;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=d=>new Date(d+'T12:00:00+07:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
 const pct=x=>x===null?'Belum bisa dihitung':(x>0?'+':'')+x.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const dayMs=86400000;
 function chart(rows){
  if(!rows.length)return '<p class="empty">Belum ada data omzet dalam periode ini.</p>';
  const low=Math.min(70,...rows.map(r=>r.index)),high=Math.max(130,...rows.map(r=>r.index));
  const x=i=>45+i/Math.max(1,rows.length-1)*890,y=n=>190-(n-low)/(high-low)*150;
  const marks=[low,100,high].map(n=>`<line x1="45" y1="${y(n)}" x2="935" y2="${y(n)}" stroke="#e3e5da"/><text x="35" y="${y(n)+4}" text-anchor="end">${Math.round(n)}</text>`).join('');
  return `<svg viewBox="0 0 980 230" role="img" aria-label="Indeks omzet gabungan ${esc(fmt(rows[0].date))} sampai ${esc(fmt(rows.at(-1).date))}">${marks}<polyline points="${rows.map((r,i)=>x(i)+','+y(r.index)).join(' ')}" fill="none" stroke="#395745" stroke-width="2.5"/>${rows.map((r,i)=>`<circle tabindex="0" cx="${x(i)}" cy="${y(r.index)}" r="4" fill="#395745"><title>${esc(fmt(r.date))}: indeks ${r.index}</title></circle>`).join('')}<text x="45" y="219">${esc(fmt(rows[0].date))}</text><text x="935" y="219" text-anchor="end">${esc(fmt(rows.at(-1).date))}</text></svg>`;
 }
 function render(){
  if(!data){$('#analysis-note').textContent='Ringkasan analisa belum termuat. Coba muat ulang halaman.';return;}
  const months=Number($('#analysis-period').value),end=new Date(data.to+'T00:00:00Z');const start=new Date(end);start.setUTCMonth(start.getUTCMonth()-months);start.setUTCDate(start.getUTCDate()+1);const from=start.toISOString().slice(0,10),region=$('#analysis-region').value;
  const trend=data.trend.filter(r=>r.date>=from&&r.date<=data.to);
  const events=data.events.filter(e=>e.start>=from&&e.end<=data.to&&(!region||e.region===region));
  const requested=Math.floor((end-new Date(from+'T00:00:00Z'))/dayMs)+1;
  $('#analysis-coverage').innerHTML=`<div class="feature-card"><small>Omzet gabungan</small><strong>${trend.length}<span> / ${requested} hari</span></strong><p>${esc(fmt(from))} – ${esc(fmt(data.to))}</p></div><div class="feature-card"><small>Kegiatan tercatat</small><strong>${events.length}</strong><p>Di wilayah & periode pilihan</p></div><div class="feature-card"><small>Arsip lalu lintas</small><strong>0<span> hari</span></strong><p>Belum tersedia untuk dibandingkan</p></div>`;
  $('#analysis-chart').innerHTML=chart(trend);
  $('#analysis-note').textContent='Perubahan di bawah adalah omzet gabungan pada tanggal kegiatan. Perubahan tiap outlet belum tersedia.';
  $('#analysis-results').innerHTML=events.length?events.map(e=>`<article class="event-card"><div class="event-top"><span class="event-date">${esc(fmt(e.start))}${e.start===e.end?'':' – '+esc(fmt(e.end))}</span><span class="tag soft">${esc(e.region)}</span></div><h3>${esc(e.title)}</h3><p class="event-venue">${esc(e.venue)}</p><div class="analysis-change ${e.changePct===null?'unknown':e.changePct>=0?'up':'down'}">${pct(e.changePct)}</div><p class="fineprint">Omzet gabungan dibanding hari sejenis${e.changePct===null?' · pembanding belum cukup':''}</p><div class="analysis-detail"><span>${e.availableDays}/${e.totalDays} hari omzet</span><span>${e.comparisonDays} tanggal pembanding</span><span>Lalu lintas: belum tersedia</span></div><details><summary>Lihat per tanggal</summary><table><thead><tr><th>Tanggal</th><th>Perubahan omzet gabungan</th><th>Hari pembanding</th></tr></thead><tbody>${e.daily.map(d=>`<tr><td>${esc(fmt(d.date))}</td><td>${pct(d.changePct)}</td><td>${d.comparisonDays}</td></tr>`).join('')}</tbody></table></details><div class="event-source"><a href="${esc(e.source)}" target="_blank" rel="noopener">${esc(e.sourceName)} ↗</a><span>${esc(e.status)}</span></div></article>`).join(''):'<div class="empty">Belum ada kegiatan tercatat pada pilihan ini.</div>';
 }
 $('#analysis-period').addEventListener('change',render);$('#analysis-region').addEventListener('change',render);render();
})();
