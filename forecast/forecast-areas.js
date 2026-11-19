'use strict';
// Panduan "Area & outlet" (owner 2026-11-19): halaman EDUKASI untuk forecaster di Dashboard.
// Menjelaskan kelompok transfer, outlet CENTER (cadangan stok) dan STAND ALONE (terisolasi) yang
// dipakai pembagian otomatis di Buat forecast. Data kelompok dari ForecastTopdown.areas() -- satu
// sumber dengan aturan pembagian. Peta: Leaflet + OpenStreetMap yang dilembutkan (bukan peta cuaca),
// interaktif: arahkan/klik kartu kelompok -> peta meluncur ke kelompok itu.
window.ForecastAreas=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const km=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1})+' km';
 const pt=n=>n.toLocaleString('id-ID',{maximumFractionDigits:1});
 const PALETTE=['#1f6f8b','#3f8a4f','#8a5fa8','#c0762a','#2a8f99','#b5534f'];
 const pos=()=>{const m=new Map();for(const o of window.OUTLET_DATA?.outlets||[])m.set(o.id,o);return m;};
 const nm=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||pos().get(id)?.name||id;
 function dist(a,b){if(!a||!b)return null;const R=6371,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lon-a.lon),h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
 // Akurasi pengiriman = 100 - (sisa + kurang) dari uji mundur 21 Okt-18 Nov (pcs, 12 produk).
 const acc=bt=>bt?[100-bt[0][0]-bt[0][1],100-bt[1][0]-bt[1][1]]:null;
 let focus=null;
 const CITIES=[['Semarang',-6.966,110.42],['Ungaran',-7.139,110.405],['Salatiga',-7.331,110.508],['Magelang',-7.47,110.217],['Temanggung',-7.316,110.175],['Boyolali',-7.533,110.596],['Klaten',-7.706,110.606],['Surakarta',-7.575,110.825],['Sukoharjo',-7.682,110.841],['Karanganyar',-7.597,110.953],['Sragen',-7.43,111.03],['Yogyakarta',-7.797,110.37],['Sleman',-7.716,110.356],['Muntilan',-7.58,110.29]];
 const LOGO='logo-omaopa.webp?v=20261105-desktop-1';
 function render(){
  const A=window.ForecastTopdown?.areas?.();if(!A)return '<div class="fp-empty">Memuat data area…</div>';
  const P=pos();
  const roles=`<div class="fa-roles"><div class="fa-role-card c"><i class="fa-k center"></i><b>Center</b><p>Outlet ramai yang dikelilingi outlet lain. Dikirim <b>lebih banyak</b> sebagai cadangan stok. Kalau outlet sekitar kehabisan, ambil dari Center.</p></div><div class="fa-role-card m"><i class="fa-k member"></i><b>Anggota</b><p>Outlet di kelompok yang sama dengan Center. Dikirim <b>85%</b> dari saran (minimal 1 pcs), selisihnya ditaruh di Center.</p></div><div class="fa-role-card s"><i class="fa-k stand"></i><b>Stand Alone</b><p>Jauh dari outlet lain (lebih dari 10 km), tidak bisa transfer. Kelebihan pasti jadi waste, jadi kirim <b>hati-hati</b>.</p></div></div>`;
  const cards=A.CLUSTERS.map((c,i)=>{const col=PALETTE[i%PALETTE.length],a=acc(c.bt);
   const rows=c.ids.slice().sort((x,y)=>(c.centers.includes(y)?1:0)-(c.centers.includes(x)?1:0)).map(id=>{const o=P.get(id),ctr=c.centers.includes(id),near=ctr?null:c.centers.map(x=>[x,dist(o,P.get(x))]).filter(x=>x[1]!=null).sort((p,q)=>p[1]-q[1])[0];return `<li class="${ctr?'c':''}" data-fa-outlet="${esc(id)}"><span>${esc(nm(id))}</span>${ctr?'<em class="ft-role center">Center</em>':near?`<small>${km(near[1])} ke ${esc(nm(near[0]))}</small>`:''}</li>`;}).join('');
   const up=a?`<div class="fa-up"><span>Akurasi pengiriman</span><div class="fa-up-bar"><i style="--a:${a[0]}%"></i><b style="--a:${a[1]}%"></b></div><div class="fa-up-n"><small>${pt(a[0])}%</small><strong>+${pt(a[1]-a[0])} poin</strong><small>${pt(a[1])}%</small></div></div>`:'';
   return `<article class="fa-card${focus===c.name?' on':''}" style="--fa:${col};--d:${i*70}ms" data-fa-cluster="${esc(c.name)}" tabindex="0"><header><h4>${esc(c.name)}</h4><span>${c.ids.length} outlet</span></header><ul>${rows}</ul>${up}</article>`;}).join('');
  const stand=A.STAND_ALONE.map(id=>{const o=P.get(id);const near=[...P.values()].filter(x=>x.id!==id&&!['pasar-kliwon','banyumanik'].includes(x.id)).map(x=>[x,dist(o,x)]).sort((p,q)=>p[1]-q[1])[0];return `<li data-fa-outlet="${esc(id)}"><span>${esc(nm(id))}</span>${near?`<small>terdekat ${esc(nm(near[0].id))} · ${km(near[1])}</small>`:''}</li>`;}).join('');
  return `<div class="fa fa-page"><header class="fa-hero"><span class="micro-label">PANDUAN FORECASTER · WAJIB DIBACA</span><h2>Area, Center & Stand Alone</h2><p>Cara Buat forecast membagi kiriman ke outlet supaya waste tidak menumpuk di outlet yang tidak bisa transfer.</p></header>
   <div class="fa-intro"><h3>Kenapa forecast dibagi per area?</h3><p>Kue hanya bisa <b>ditransfer antar outlet yang berdekatan</b>. Secara data, kelebihan di satu outlet bisa "menutupi" kekurangan outlet lain yang jauh — akurasi jaringan terlihat bagus — padahal di lapangan kuenya tidak bisa berpindah, jadi tetap waste. Karena itu pembagian otomatis di Buat forecast memakai <b>kelompok transfer</b>: di tiap kelompok ada <b>Center</b> sebagai cadangan stok.</p>${roles}</div>
   <div class="fa-mapwrap"><div id="fa-leaflet" class="fa-leaflet" aria-label="Peta area outlet"></div><div class="fa-map-ctl"><button type="button" class="button quiet" data-fa-all>Lihat semua area</button><span>Klik kartu kelompok atau nama outlet untuk melihat di peta</span></div></div>
   <div class="fa-grid">${cards}<article class="fa-card fa-stand" style="--fa:#c0762a;--d:${A.CLUSTERS.length*70}ms" data-fa-cluster="__stand" tabindex="0"><header><h4>Stand Alone</h4><span>${A.STAND_ALONE.length} outlet</span></header><ul>${stand}</ul><p class="fa-note">Tidak ada outlet dekat untuk transfer. Kirim mendekati pola penjualannya, hindari buffer plus, dan perhatikan waste hariannya.</p></article></div>
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
   host.addEventListener('mouseover',e=>{const c=e.target.closest('[data-fa-cluster]');if(c&&c.dataset.faCluster!==focus)flyTo(c.dataset.faCluster);});
   host.addEventListener('click',e=>{const o=e.target.closest('[data-fa-outlet]');if(o){openOutlet(o.dataset.faOutlet);return;}const c=e.target.closest('[data-fa-cluster]');if(c)flyTo(c.dataset.faCluster);if(e.target.closest('[data-fa-all]'))flyTo(null);});
   host.addEventListener('focusin',e=>{const c=e.target.closest('[data-fa-cluster]');if(c)flyTo(c.dataset.faCluster);});
  }
  if(mapEl===el&&map){if(el.offsetWidth)map.invalidateSize();return;}
  if(!el.offsetWidth)return; // masih terlipat; dipasang saat dibuka
  if(map){try{map.remove();}catch{}}
  mapEl=el;map=L.map(el,{scrollWheelZoom:false,zoomControl:true,attributionControl:true});
  // Peta ringan (owner 2026-11-19: "terlalu realistis"): dasar Esri Light Gray (tanpa kunci API) + label kota sendiri.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'Peta dasar &copy; Esri',className:'fa-tiles'}).addTo(map);
  for(const [nmCity,lat,lon] of CITIES)L.marker([lat,lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'',html:`<div class="fa-city">${nmCity}</div>`,iconSize:[0,0]})}).addTo(map);
  const A=window.ForecastTopdown.areas(),P=pos();layers=new Map();const all=[];
  A.CLUSTERS.forEach((c,i)=>{const col=PALETTE[i%PALETTE.length],g=L.layerGroup().addTo(map),pts=c.ids.map(id=>P.get(id)).filter(Boolean);
   if(pts.length>1)L.polygon(hull(pts.map(o=>[o.lat,o.lon])),{color:col,weight:1.5,fillColor:col,fillOpacity:.08,dashArray:'5 5',className:'fa-zone'}).addTo(g);
   for(const id of c.ids){const o=P.get(id);if(!o||c.centers.includes(id))continue;const cen=c.centers.map(x=>P.get(x)).filter(Boolean).sort((a,b)=>dist(o,a)-dist(o,b))[0];if(cen)L.polyline([[o.lat,o.lon],[cen.lat,cen.lon]],{color:col,weight:2.5,opacity:.85,dashArray:'6 6',className:'fa-flow'}).addTo(g);}
   for(const id of c.ids){const o=P.get(id);if(!o)continue;const ctr=c.centers.includes(id);all.push([o.lat,o.lon]);
    const m=L.marker([o.lat,o.lon],{icon:L.divIcon({className:'',html:`<div class="fa-pin ${ctr?'c':'m'}" style="--fa:${col}"><i><img src="${LOGO}" alt=""></i><span>${esc(nm(id))}${ctr?' · Center':''}</span></div>`,iconSize:[0,0]})}).bindPopup(`<b>${esc(nm(id))}</b><br>${esc(c.name)} · ${ctr?'Center':'Anggota (85%)'}`).addTo(g);m.__id=id;}
   layers.set(c.name,{g,b:L.latLngBounds(pts.map(o=>[o.lat,o.lon]))});});
  const sg=L.layerGroup().addTo(map),sp=[];
  for(const id of A.STAND_ALONE){const o=P.get(id);if(!o)continue;sp.push([o.lat,o.lon]);all.push([o.lat,o.lon]);const m=L.marker([o.lat,o.lon],{icon:L.divIcon({className:'',html:`<div class="fa-pin s"><i><img src="${LOGO}" alt=""></i><span>${esc(nm(id))}</span></div>`,iconSize:[0,0]})}).bindPopup(`<b>${esc(nm(id))}</b><br>Stand Alone · tidak bisa transfer`).addTo(sg);m.__id=id;}
  layers.set('__stand',{g:sg,b:L.latLngBounds(sp)});
  bounds=L.latLngBounds(all);map.fitBounds(bounds,{padding:[30,30]});
  if(focus)setTimeout(()=>flyTo(focus,true),50);
 }
 // Cangkang cembung sederhana untuk menggambar area kelompok.
 function hull(pts){if(pts.length<3){const [a,b]=pts,d=.006;return b?[[a[0]+d,a[1]],[b[0]+d,b[1]],[b[0]-d,b[1]],[a[0]-d,a[1]]]:pts;}
  const p=[...pts].sort((a,b)=>a[1]-b[1]||a[0]-b[0]),cr=(o,a,b)=>(a[1]-o[1])*(b[0]-o[0])-(a[0]-o[0])*(b[1]-o[1]),lo=[],up=[];
  for(const x of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],x)<=0)lo.pop();lo.push(x);}
  for(const x of p.reverse()){while(up.length>=2&&cr(up[up.length-2],up[up.length-1],x)<=0)up.pop();up.push(x);}
  return lo.slice(0,-1).concat(up.slice(0,-1));}
 function flyTo(name,instant){
  focus=name;document.querySelectorAll('.fa-card').forEach(c=>c.classList.toggle('on',c.dataset.faCluster===name));
  if(!map||!layers)return;const L1=name&&layers.get(name);
  for(const [k,v] of layers)v.g.eachLayer(l=>{const e=l.getElement?.()||l._path;if(e)e.classList.toggle('fa-dim',!!name&&k!==name);});
  const b=L1?L1.b:bounds;if(!b)return;
  if(instant)map.fitBounds(b,{padding:[40,40],maxZoom:13});else map.flyToBounds(b,{padding:[40,40],maxZoom:13,duration:.8});
 }
 function openOutlet(id){if(!layers)return;for(const v of layers.values())v.g.eachLayer(l=>{if(l.__id===id){map.flyTo(l.getLatLng(),13,{duration:.8});setTimeout(()=>l.openPopup(),850);}});}
 return {render,mount};
})();
