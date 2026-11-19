'use strict';
// Halaman "Area & outlet" (owner 2026-11-19): menjelaskan kelompok transfer, outlet CENTER
// (cadangan stok) dan STAND ALONE (terisolasi) yang dipakai pembagian otomatis di Buat forecast.
// Data kelompok diambil dari ForecastTopdown.areas() -- satu sumber dengan aturan pembagian.
window.ForecastAreas=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const km=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1})+' km';
 const PALETTE=['#1f6f8b','#4e8a5e','#8a5fa8','#c0762a','#2a8f99','#a8504f'];
 const pos=()=>{const m=new Map();for(const o of window.OUTLET_DATA?.outlets||[])m.set(o.id,o);return m;};
 const nm=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||pos().get(id)?.name||id;
 function dist(a,b){if(!a||!b)return null;const R=6371,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lon-a.lon),h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
 const STAND_BT=[['100% saran (sekarang)',16.0,17.3],['95%',10.9,23.9],['90%',9.7,26.5],['85%',8.5,29.6]];
 // Peta ringkas: tiap kelompok satu lingkaran (ukuran = jumlah outlet), Stand Alone berupa
 // belah ketupat. Rincian outlet per kelompok ada di peta kecil tiap kartu (tidak bertumpuk).
 function proj(pts,W,H,pad){const lats=pts.map(o=>o.lat),lons=pts.map(o=>o.lon);let x0=Math.min(...lons),x1=Math.max(...lons),y0=Math.min(...lats),y1=Math.max(...lats);const mx=Math.max(.004,(x1-x0)*.15),my=Math.max(.004,(y1-y0)*.15);x0-=mx;x1+=mx;y0-=my;y1+=my;const sc=Math.min((W-2*pad)/(x1-x0),(H-2*pad)/(y1-y0)),ox=(W-(x1-x0)*sc)/2,oy=(H-(y1-y0)*sc)/2;return {X:o=>ox+(o.lon-x0)*sc,Y:o=>oy+(y1-o.lat)*sc};}
 function map(A,P){
  const groups=A.CLUSTERS.map((c,i)=>{const ps=c.ids.map(id=>P.get(id)).filter(Boolean);return ps.length?{c,col:PALETTE[i%PALETTE.length],lat:ps.reduce((s,o)=>s+o.lat,0)/ps.length,lon:ps.reduce((s,o)=>s+o.lon,0)/ps.length,n:ps.length}:null;}).filter(Boolean);
  const st=A.STAND_ALONE.map(id=>P.get(id)).filter(Boolean);if(!groups.length)return '';
  const W=760,H=640,{X,Y}=proj([...groups,...st],W,H,48);
  const g=groups.map(x=>{const r=12+x.n*4;return `<g><circle cx="${X(x)}" cy="${Y(x)}" r="${r}" fill="${x.col}" opacity=".16"/><circle cx="${X(x)}" cy="${Y(x)}" r="${r}" fill="none" stroke="${x.col}" stroke-width="2"/><text x="${X(x)}" y="${Y(x)+4}" text-anchor="middle" class="fa-gl" fill="${x.col}">${x.n}</text><text x="${X(x)}" y="${Y(x)+r+15}" text-anchor="middle" class="fa-lbl c">${esc(x.c.name)}</text></g>`;}).join('');
  const s=st.map(o=>`<g><rect x="${X(o)-7}" y="${Y(o)-7}" width="14" height="14" rx="2" fill="#fff" stroke="#c0762a" stroke-width="2.4" transform="rotate(45 ${X(o)} ${Y(o)})"/><text x="${X(o)+13}" y="${Y(o)+4}" class="fa-lbl s">${esc(nm(o.id))}</text></g>`).join('');
  return `<svg class="fa-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peta ringkas kelompok outlet dan Stand Alone">${g}${s}</svg>`;
 }
 function miniMap(c,col,P){
  const ps=c.ids.map(id=>[id,P.get(id)]).filter(([,o])=>o);if(ps.length<2)return '';
  const W=360,H=210,{X,Y}=proj(ps.map(([,o])=>o),W,H,26);let l='',d='',t='';
  for(const [id,o] of ps){if(c.centers.includes(id))continue;const cen=c.centers.map(x=>P.get(x)).filter(Boolean).sort((a,b)=>dist(o,a)-dist(o,b))[0];if(cen)l+=`<line x1="${X(o)}" y1="${Y(o)}" x2="${X(cen)}" y2="${Y(cen)}" stroke="${col}" stroke-width="1.6" stroke-dasharray="4 3"/>`;}
  for(const [id,o] of ps){const ctr=c.centers.includes(id);d+=ctr?`<circle cx="${X(o)}" cy="${Y(o)}" r="7" fill="${col}" stroke="#fff" stroke-width="2"/>`:`<circle cx="${X(o)}" cy="${Y(o)}" r="4.5" fill="#fff" stroke="${col}" stroke-width="2.2"/>`;const right=X(o)<W*.62;t+=`<text x="${X(o)+(right?9:-9)}" y="${Y(o)+4}" text-anchor="${right?'start':'end'}" class="fa-lbl${ctr?' c':''}">${esc(nm(id))}</text>`;}
  return `<svg class="fa-mini" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peta ${esc(c.name)}">${l}${d}${t}</svg>`;
 }
 function render(){
  const A=window.ForecastTopdown?.areas?.();if(!A)return '<div class="fp-empty">Memuat data area…</div>';
  const P=pos();
  const legend=`<div class="fa-legend"><span><i class="fa-k center"></i><b>Center</b> — outlet ramai yang dikelilingi outlet lain. Dikirim <b>lebih banyak</b> sebagai cadangan stok; kalau outlet sekitar kehabisan, ambil dari Center.</span><span><i class="fa-k member"></i><b>Anggota</b> — outlet di kelompok yang sama. Dikirim <b>85%</b> dari saran (minimal 1 pcs); selisihnya ditaruh di Center.</span><span><i class="fa-k stand"></i><b>Stand Alone</b> — jauh dari outlet lain (&gt;10 km), tidak bisa transfer. Kelebihan pasti jadi waste, jadi kirim <b>hati-hati</b>.</span></div>`;
  const cards=A.CLUSTERS.map((c,i)=>{const col=PALETTE[i%PALETTE.length];
   const rows=c.ids.slice().sort((a,b)=>(c.centers.includes(b)?1:0)-(c.centers.includes(a)?1:0)).map(id=>{const o=P.get(id),ctr=c.centers.includes(id),near=ctr?null:c.centers.map(x=>[x,dist(o,P.get(x))]).filter(x=>x[1]!=null).sort((a,b)=>a[1]-b[1])[0];return `<li class="${ctr?'c':''}"><span>${esc(nm(id))}</span>${ctr?'<em class="ft-role center">Center</em>':near?`<small>${km(near[1])} ke ${esc(nm(near[0]))}</small>`:''}</li>`;}).join('');
   const bt=c.bt?`<div class="fa-bt"><span>Uji mundur 21 Okt–18 Nov (pcs)</span><div><b>Waste</b> ${pct(c.bt[0][0])} → <strong>${pct(c.bt[1][0])}</strong></div><div><b>Kurang</b> ${pct(c.bt[0][1])} → <strong>${pct(c.bt[1][1])}</strong></div></div>`:'';
   return `<article class="fa-card" style="--fa:${col}"><header><h4>${esc(c.name)}</h4><span>${c.ids.length} outlet · anggota ${Math.round(c.share*100)}%</span></header>${miniMap(c,col,P)}<ul>${rows}</ul>${bt}</article>`;}).join('');
  const stand=A.STAND_ALONE.map(id=>{const o=P.get(id);const near=[...P.values()].filter(x=>x.id!==id&&!['pasar-kliwon','banyumanik'].includes(x.id)).map(x=>[x,dist(o,x)]).sort((a,b)=>a[1]-b[1])[0];return `<li><span>${esc(nm(id))}</span>${near?`<small>terdekat ${esc(nm(near[0].id))} ${km(near[1])}</small>`:''}</li>`;}).join('');
  return `<div class="fa">
   <article class="workspace-card fa-intro"><h3>Kenapa dibagi per area?</h3><p>Kue hanya bisa ditransfer antar outlet yang <b>berdekatan</b>. Akurasi seluruh jaringan bisa terlihat bagus (88,6% pcs) karena kelebihan di satu outlet "tertutup" kekurangan di outlet lain secara data — padahal di lapangan kuenya tidak bisa berpindah jauh, jadi tetap jadi waste. Karena itu pembagian otomatis di Buat forecast memakai kelompok transfer di bawah ini.</p>${legend}</article>
   <article class="workspace-card fa-mapcard"><span class="micro-label">PETA RINGKAS · LINGKARAN = KELOMPOK TRANSFER (ANGKA = JUMLAH OUTLET) · ◇ = STAND ALONE</span>${map(A,P)}</article>
   <div class="fa-grid">${cards}</div>
   <article class="workspace-card fa-stand"><header><h4>Stand Alone</h4><span>${A.STAND_ALONE.length} outlet · belum dikurangi otomatis</span></header><ul>${stand}</ul>
    <p class="fa-note">Mengurangi kiriman Stand Alone adalah tukar-menukar: waste turun tapi lebih sering habis (tidak ada outlet untuk transfer). Uji mundur gabungan 6 outlet:</p>
    <table class="fa-tbl"><thead><tr><th>Kiriman</th><th>Waste</th><th>Kurang</th></tr></thead><tbody>${STAND_BT.map(r=>`<tr><td>${r[0]}</td><td>${pct(r[1])}</td><td>${pct(r[2])}</td></tr>`).join('')}</tbody></table></article>
   <p class="fp-caption">Angka uji mundur: saran per outlet × produk vs penjualan reguler, 12 produk inti, dengan asumsi transfer hanya dari Center ke outlet di kelompoknya. Ini untuk membandingkan strategi, bukan perkiraan waste tercatat (waste tim dihitung dalam rupiah HPP).</p>
  </div>`;
 }
 return {render};
})();
