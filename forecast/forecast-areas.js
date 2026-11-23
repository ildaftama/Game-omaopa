'use strict';
// Panduan "Area & outlet" (owner 2026-11-19): halaman EDUKASI forecaster (tab Panduan).
// Menjelaskan kelompok transfer, outlet CENTER (cadangan stok), ANGGOTA, dan STAND ALONE yang
// dipakai pembagian otomatis di Buat forecast. Data kelompok dari ForecastTopdown.areas() -- satu
// sumber dengan aturan pembagian. Peta ringan (Esri Light Gray) dengan ikon toko per peran; daftar
// kelompok berupa panel DI DALAM peta. Pilihan TERKUNCI saat diklik (tidak ikut gerakan kursor),
// baru pindah kalau kartu lain diklik.
window.ForecastAreas=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const km=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1})+' km';
 const pt=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1});
 const PALETTE=['#1f6f8b','#3f8a4f','#8a5fa8','#c0762a','#2a8f99','#b5534f'],STAND_COL='#d06a2c';
 const pos=()=>{const m=new Map();for(const o of window.OUTLET_DATA?.outlets||[])m.set(o.id,o);return m;};
 const nm=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||pos().get(id)?.name||id;
 function dist(a,b){if(!a||!b)return null;const R=6371,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lon-a.lon),h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
 // Akurasi pengiriman = 100 - (sisa + kurang) dari uji mundur 21 Okt-18 Nov (pcs, 12 produk).
 const acc=()=>null; // Owner 2026-11-23: klaim kenaikan akurasi Center tidak ditampilkan (uji ulang tidak mendukung).
 const CITIES=[['Semarang',-6.966,110.42],['Ungaran',-7.139,110.405],['Salatiga',-7.331,110.508],['Magelang',-7.47,110.217],['Temanggung',-7.316,110.175],['Boyolali',-7.533,110.596],['Klaten',-7.706,110.606],['Surakarta',-7.575,110.825],['Sukoharjo',-7.682,110.841],['Karanganyar',-7.597,110.953],['Sragen',-7.43,111.03],['Yogyakarta',-7.797,110.37],['Sleman',-7.716,110.356],['Muntilan',-7.58,110.29]];
 // Ikon toko (SVG): Center = toko besar & mewah (2 lantai, bintang); Anggota = toko biasa;
 // Anggota = stan kecil beratap garis; Stand Alone = gerobak berpayung. Warna mengikuti kelompok (currentColor).
 const ICON={
  center:`<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 1.5l2 4.1 4.5.6-3.3 3.1.9 4.5-4.1-2.2-4.1 2.2.9-4.5-3.3-3.1 4.5-.6z" fill="#f2b632" stroke="#fff" stroke-width=".8"/><rect x="7" y="18" width="34" height="27" rx="2.5" fill="#fff" stroke="currentColor" stroke-width="2.6"/><path d="M4 18 9 11h30l5 7z" fill="currentColor"/><path d="M4 18h40v3.2c-2.5 2-5 2-7.5 0-2.5 2-5 2-7.5 0-2.5 2-5 2-7.5 0-2.5 2-5 2-7.5 0-2.5 2-5 2-7.5 0z" fill="currentColor" opacity=".55"/><rect x="11" y="25" width="7" height="6" rx="1" fill="currentColor" opacity=".3"/><rect x="30" y="25" width="7" height="6" rx="1" fill="currentColor" opacity=".3"/><rect x="19.5" y="29" width="9" height="16" rx="1" fill="currentColor"/><circle cx="26.5" cy="37" r=".9" fill="#fff"/><rect x="11" y="34" width="7" height="6" rx="1" fill="currentColor" opacity=".3"/><rect x="30" y="34" width="7" height="6" rx="1" fill="currentColor" opacity=".3"/></svg>`,
  member:`<svg viewBox="0 0 40 40" aria-hidden="true"><line x1="9" y1="15" x2="9" y2="25" stroke="currentColor" stroke-width="2"/><line x1="31" y1="15" x2="31" y2="25" stroke="currentColor" stroke-width="2"/><rect x="5" y="8" width="30" height="7" rx="1.5" fill="currentColor"/><path d="M11 8h6v7h-6zM23 8h6v7h-6z" fill="#fff" opacity=".85"/><path d="M5 15c1.25 2.6 3.75 2.6 5 0 1.25 2.6 3.75 2.6 5 0 1.25 2.6 3.75 2.6 5 0 1.25 2.6 3.75 2.6 5 0 1.25 2.6 3.75 2.6 5 0 1.25 2.6 3.75 2.6 5 0z" fill="currentColor"/><rect x="7" y="24" width="26" height="11" rx="1.8" fill="#fff" stroke="currentColor" stroke-width="2.4"/><rect x="10" y="27.5" width="20" height="2.6" rx="1" fill="currentColor" opacity=".3"/></svg>`,
  stand:`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 16C8 6 32 6 35 16z" fill="currentColor"/><path d="M5 16c2.5 1.6 5 1.6 7.5 0 2.5 1.6 5 1.6 7.5 0 2.5 1.6 5 1.6 7.5 0 2.5 1.6 5 1.6 7.5 0" fill="none" stroke="#fff" stroke-width="1.2" opacity=".8"/><line x1="20" y1="16" x2="20" y2="22" stroke="currentColor" stroke-width="2"/><rect x="9" y="22" width="22" height="10" rx="2" fill="#fff" stroke="currentColor" stroke-width="2.5"/><rect x="12" y="25" width="16" height="3" rx="1" fill="currentColor" opacity=".3"/><circle cx="13" cy="35" r="2.6" fill="currentColor"/><circle cx="27" cy="35" r="2.6" fill="currentColor"/></svg>`,
 };
 let focus=null,roleFocus=null;
 function render(){
  const A=window.ForecastTopdown?.areas?.();if(!A)return '<div class="fp-empty">Memuat data area…</div>';
  const P=pos();
  const items=A.CLUSTERS.map((c,i)=>{const col=PALETTE[i%PALETTE.length],a=acc(c.bt),ext=c.centers.filter(x=>!c.ids.includes(x));
   const rows=c.ids.slice().sort((x,y)=>(c.centers.includes(y)?1:0)-(c.centers.includes(x)?1:0)).map(id=>{const o=P.get(id),ctr=c.centers.includes(id),near=ctr?null:c.centers.map(x=>[x,dist(o,P.get(x))]).filter(x=>x[1]!=null).sort((p,q)=>p[1]-q[1])[0];return `<li class="${ctr?'c':''}" data-fa-outlet="${esc(id)}"><span>${esc(nm(id))}</span>${ctr?'<em class="ft-role center">Center</em>':near?`<small>${km(near[1])} ke ${esc(nm(near[0]))}</small>`:''}</li>`;}).join('');
   const up=a?`<div class="fa-up"><div class="fa-up-bar"><b style="--a:${a[1]}%"></b><i style="--a:${a[0]}%"></i></div><div class="fa-up-n"><small>Akurasi ${pt(a[0])}% → ${pt(a[1])}%</small><strong>+${pt(a[1]-a[0])} poin</strong></div></div>`:'';
   return `<div class="fa-item${focus===c.name?' on':''}" style="--fa:${col}" data-fa-cluster="${esc(c.name)}" role="button" tabindex="0"><div class="fa-item-h"><span class="fa-dot"></span><b>${esc(c.name)}</b><small>${c.ids.length} outlet</small>${a?`<em>+${pt(a[1]-a[0])}</em>`:''}</div><div class="fa-item-b"><ul>${rows}</ul>${up}<p>${ext.length?`Tidak ada Center di kelompok ini. Semua outlet anggota. Kalau kehabisan dan outlet sekitar tidak punya sisa, rujukannya <b>${ext.map(id=>esc(nm(id))).join(', ')}</b>.`:`Anggota dikirim sesuai saran. Kalau kehabisan, ambil dari outlet terdekat yang punya sisa.`}</p></div></div>`;}).join('');
  const stand=A.STAND_ALONE.map(id=>{const o=P.get(id);const near=[...P.values()].filter(x=>x.id!==id&&!['pasar-kliwon','banyumanik'].includes(x.id)).map(x=>[x,dist(o,x)]).sort((p,q)=>p[1]-q[1])[0];return `<li data-fa-outlet="${esc(id)}"><span>${esc(nm(id))}</span>${near?`<small>terdekat ${esc(nm(near[0].id))} · ${km(near[1])}</small>`:''}</li>`;}).join('');
  const role=(k,t,d)=>`<button type="button" class="fa-rolebtn${roleFocus===k?' on':''}" data-fa-role="${k}" title="Klik untuk menyorot semua ${t} di peta"><span class="fa-ic ${k}">${ICON[k]}</span><span><b>${t}</b><small>${d}</small></span></button>`;
  return `<div class="fa fa-page">
   <header class="fa-hero"><span class="micro-label">UPDATE METODE FORECAST · WAJIB DIBACA</span><h2>Area, Center & Stand Alone</h2><p>Kue hanya bisa <b>ditransfer antar outlet yang berdekatan</b>. Secara data, kelebihan satu outlet bisa "menutupi" kekurangan outlet lain yang jauh — padahal di lapangan kuenya tidak bisa berpindah, jadi tetap waste. Karena itu outlet dikelompokkan per <b>area transfer</b>, dengan <b>Center</b> sebagai rujukan utama saat outlet sekitarnya butuh stok.</p></header>
   <ol class="fa-new">
    <li><b>Potongan 85% dihentikan.</b> Sejak 23 November, Anggota kembali dikirim sesuai saran.</li>
    <li><b>Area dipakai untuk transfer.</b> Kalau kehabisan, ambil dari outlet terdekat yang punya sisa.</li>
    <li><b>Center jadi rujukan transfer.</b> Outlet ramai di tengah area. Stoknya tidak lagi ditambah otomatis.</li>
    <li><b>Stand Alone dikirim hati-hati.</b> Tidak ada outlet dekat untuk transfer, termasuk <b>Temanggung</b>.</li>
    <li><b>Jogja satu area</b> dengan Center <b>Jakal UII</b>. <b>Klaten</b> tanpa Center, rujukannya <b>UMS</b>.</li>
    <li><b>Prioritas sekarang: tekan waste.</b> Angka saran tetap dicek forecaster sebelum disimpan.</li>
   </ol>
   <div class="fa-stage">
    <div id="fa-leaflet" class="fa-leaflet" aria-label="Peta area outlet"></div>
    <aside class="fa-panel" aria-label="Kelompok area"><div class="fa-panel-h"><b>Kelompok area</b><button type="button" class="fa-reset" data-fa-all>Lihat semua</button></div><div class="fa-panel-list">${items}<div class="fa-item fa-item-stand${focus==='__stand'?' on':''}" style="--fa:${STAND_COL}" data-fa-cluster="__stand" role="button" tabindex="0"><div class="fa-item-h"><span class="fa-dot"></span><b>Stand Alone</b><small>${A.STAND_ALONE.length} outlet</small></div><div class="fa-item-b"><ul>${stand}</ul><p>Tidak ada outlet dekat untuk transfer. Kirim mendekati pola penjualannya, hindari buffer plus, perhatikan waste hariannya.</p></div></div></div></aside>
    <div class="fa-roles2" aria-label="Arti ikon">${role('center','Center','outlet ramai · rujukan utama saat anggota butuh transfer')}${role('member','Anggota','dikirim sesuai saran · transfer dari outlet terdekat kalau habis')}${role('stand','Stand Alone','jauh dari outlet lain · tidak bisa transfer, kirim hati-hati')}</div>
   </div>
   ${(()=>{const N=window.ForecastMethodNotice,read=N?.read?.();return `<div class="fa-read${read?' done':''}"><div><b>${read?'✓ Anda sudah membaca update ini':'Sudah paham semuanya?'}</b><span>${read?'Silakan lanjut membuat forecast.':'Klik tombol di samping untuk konfirmasi, lalu lanjut membuat forecast.'}</span></div><button type="button" class="button" data-fa-read>${read?'Lanjut ke Forecast →':'Saya sudah membaca & paham →'}</button></div>`;})()}
  </div>`;
 }
 // ---- Peta (Leaflet) ----
 let map=null,mapEl=null,layers=null,bounds=null;
 function mount(){
  const pk=document.querySelector('.outlet-picker');if(pk&&document.querySelector('.fa-page'))pk.hidden=true;
  const el=document.getElementById('fa-leaflet');
  if(!el||typeof L==='undefined')return;
  const host=el.closest('.fa');
  if(host&&!host.dataset.wired){host.dataset.wired='1';
   // Hanya KLIK yang memilih (terkunci); arahan kursor tidak memindahkan peta.
   host.addEventListener('click',e=>{
    const o=e.target.closest('[data-fa-outlet]');if(o){openOutlet(o.dataset.faOutlet);return;}
    if(e.target.closest('[data-fa-read]')){window.ForecastMethodNotice?.markRead?.();document.querySelector('[data-focus="forecast"]')?.click();window.scrollTo({top:0,behavior:'smooth'});return;}
    if(e.target.closest('[data-fa-all]')){roleFocus=null;syncRoles();flyTo(null);return;}
    const r=e.target.closest('[data-fa-role]');if(r){roleFocus=roleFocus===r.dataset.faRole?null:r.dataset.faRole;syncRoles();return;}
    const c=e.target.closest('[data-fa-cluster]');if(c&&c.dataset.faCluster!==focus)flyTo(c.dataset.faCluster);
   });
   host.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const c=e.target.closest('[data-fa-cluster]');if(c&&e.target===c){e.preventDefault();flyTo(c.dataset.faCluster);}});
  }
  if(mapEl===el&&map){if(el.offsetWidth)map.invalidateSize();return;}
  if(!el.offsetWidth)return;
  if(map){try{map.remove();}catch{}}
  mapEl=el;map=L.map(el,{scrollWheelZoom:false,zoomControl:true,attributionControl:true,zoomSnap:.25});
  map.zoomControl.setPosition('topright');
  // Peta ringan: dasar Esri Light Gray (tanpa kunci API) + label kota sendiri.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'Peta dasar &copy; Esri',className:'fa-tiles'}).addTo(map);
  // Label kota di lapisan sendiri DI BAWAH pin; kota yang namanya sama dengan outlet tidak diberi label (dobel).
  map.createPane('faCity').style.zIndex=450;
  const outletNames=new Set((window.OUTLET_DATA?.outlets||[]).map(o=>nm(o.id).toLowerCase()));
  for(const [c,lat,lon] of CITIES)if(!outletNames.has(c.toLowerCase()))L.marker([lat,lon],{pane:'faCity',interactive:false,keyboard:false,icon:L.divIcon({className:'',html:`<div class="fa-city">${c}</div>`,iconSize:[0,0]})}).addTo(map);
  const A=window.ForecastTopdown.areas(),P=pos();layers=new Map();const all=[];
  const pin=(kind,col,label)=>L.divIcon({className:'',html:`<div class="fa-pin ${kind}" style="--fa:${col}">${ICON[kind==='c'?'center':kind==='s'?'stand':'member']}<span>${esc(label)}</span></div>`,iconSize:[0,0]});
  A.CLUSTERS.forEach((c,i)=>{const col=PALETTE[i%PALETTE.length],g=L.layerGroup().addTo(map),pts=c.ids.map(id=>P.get(id)).filter(Boolean);
   if(pts.length>1)L.polygon(hull(pts.map(o=>[o.lat,o.lon])),{color:col,weight:1.5,fillColor:col,fillOpacity:.1,dashArray:'5 5',className:'fa-zone'}).addTo(g);
   for(const id of c.ids){const o=P.get(id);if(!o||c.centers.includes(id))continue;const cen=c.centers.map(x=>P.get(x)).filter(Boolean).sort((a,b)=>dist(o,a)-dist(o,b))[0];if(cen)L.polyline([[o.lat,o.lon],[cen.lat,cen.lon]],{color:col,weight:2.5,opacity:.85,dashArray:'6 6',className:'fa-flow'}).addTo(g);}
   for(const id of c.ids){const o=P.get(id);if(!o)continue;const ctr=c.centers.includes(id);all.push([o.lat,o.lon]);
    const m=L.marker([o.lat,o.lon],{icon:pin(ctr?'c':'m',col,nm(id)),riseOnHover:true,zIndexOffset:ctr?500:0}).bindPopup(`<b>${esc(nm(id))}</b><br>${esc(c.name)} · ${ctr?'Center':'Anggota'}`).addTo(g);m.__id=id;}
   // Center di luar kelompok (Klaten -> UMS) ikut masuk bingkai saat kelompok dipilih.
   layers.set(c.name,{g,centers:c.centers,b:L.latLngBounds([...pts,...c.centers.map(x=>P.get(x)).filter(Boolean)].map(o=>[o.lat,o.lon]))});});
  const sg=L.layerGroup().addTo(map),sp=[];
  for(const id of A.STAND_ALONE){const o=P.get(id);if(!o)continue;sp.push([o.lat,o.lon]);all.push([o.lat,o.lon]);const m=L.marker([o.lat,o.lon],{icon:pin('s',STAND_COL,nm(id)),riseOnHover:true}).bindPopup(`<b>${esc(nm(id))}</b><br>Stand Alone · tidak bisa transfer`).addTo(sg);m.__id=id;}
  layers.set('__stand',{g:sg,b:L.latLngBounds(sp)});
  bounds=L.latLngBounds(all);fit(bounds,true);
  if(focus)setTimeout(()=>flyTo(focus,true),50);
  syncRoles();
 }
 // Peta digeser supaya tidak tertutup panel kelompok di kiri & tombol peran di bawah.
 const PAD=()=>{const w=document.querySelector('.fa-panel'),wide=w&&getComputedStyle(w).position==='absolute';return {paddingTopLeft:[wide?w.offsetWidth+50:30,70],paddingBottomRight:[40,wide?100:30],maxZoom:13};};
 function fit(b,instant){if(!map||!b)return;instant?map.fitBounds(b,PAD()):map.flyToBounds(b,{...PAD(),duration:.8});}
 // Cangkang cembung sederhana untuk menggambar area kelompok.
 function hull(pts){if(pts.length<3){const [a,b]=pts,d=.006;return b?[[a[0]+d,a[1]],[b[0]+d,b[1]],[b[0]-d,b[1]],[a[0]-d,a[1]]]:pts;}
  const p=[...pts].sort((a,b)=>a[1]-b[1]||a[0]-b[0]),cr=(o,a,b)=>(a[1]-o[1])*(b[0]-o[0])-(a[0]-o[0])*(b[1]-o[1]),lo=[],up=[];
  for(const x of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],x)<=0)lo.pop();lo.push(x);}
  for(const x of p.reverse()){while(up.length>=2&&cr(up[up.length-2],up[up.length-1],x)<=0)up.pop();up.push(x);}
  return lo.slice(0,-1).concat(up.slice(0,-1));}
 function flyTo(name,instant){
  focus=name;document.querySelectorAll('.fa-item').forEach(c=>c.classList.toggle('on',c.dataset.faCluster===name));
  if(!map||!layers)return;
  const keep=new Set(name&&layers.get(name)?.centers||[]); // Center di luar kelompok (UMS untuk Klaten) tetap terang
  for(const [k,v] of layers)v.g.eachLayer(l=>{const e=l.getElement?.()||l._path;if(e)e.classList.toggle('fa-dim',!!name&&k!==name&&!keep.has(l.__id));});
  const L1=name&&layers.get(name);fit(L1?L1.b:bounds,instant);
 }
 function syncRoles(){
  document.querySelectorAll('.fa-rolebtn').forEach(b=>b.classList.toggle('on',b.dataset.faRole===roleFocus));
  const k={center:'c',member:'m',stand:'s'}[roleFocus];
  document.querySelectorAll('.fa-pin').forEach(p=>p.classList.toggle('fa-rdim',!!k&&!p.classList.contains(k)));
 }
 function openOutlet(id){if(!layers)return;for(const v of layers.values())v.g.eachLayer(l=>{if(l.__id===id){map.flyTo(l.getLatLng(),13,{duration:.8});setTimeout(()=>l.openPopup(),850);}});}
 return {render,mount};
})();
