'use strict';
// Halaman Pengaturan: sumber data (semua sheet + cuaca), ambang batas, kartu dashboard, dan pintu
// masuk "Data pendukung". Disimpan di dokumen Firestore settings/forecastSources yang SAMA
// dengan link sumber lama (rules: baca publik, tulis Admin Utama/Master) -- isinya hanya link
// sheet & preferensi tampilan, tidak ada rahasia. Sinkronisasi GitHub Actions membaca dokumen
// ini lewat integration/pcs-source.mjs, jadi ganti link di sini berlaku tanpa ubah kode.
window.ForecastSettings=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const DEFAULTS={
  thresholds:{waste:3.5,lostSales:4.5,openHours:12,omzetHighlight:15,wasteLostHighlight:20,trendWindow:3},
  weather:{model:'best_match',rainLabelProb:45,highRiskProb:60},
  display:{trend:true,wasteLost:true,accuracy:true,weather:true,events:true,operations:true},
  products:JSON.parse(JSON.stringify(window.ForecastProducts?.DEFAULTS||{core:[],extra:[]})),
 };
 const SOURCE_INFO={
  orders:{use:'Memisahkan pesanan dari omzet murni dan mengisi otomatis kolom pesanan di Forecast.',sync:'Otomatis tiap jam',fields:[['tab','Nama tab','text'],['startRow','Mulai baris','number']]},
  forecast:{use:'Waste (tab waste, kolom Nominal) dan lost sales (kolom Lost sales di tab rekap bulanan).',sync:'Otomatis tiap jam',fields:[['wasteTab','Nama tab waste','text'],['lostTabPrefix','Awalan tab rekap bulanan','text']],defaults:{wasteTab:'WASTE',lostTabPrefix:'Rekap Forecast'}},
  ledger:{use:'Omzet laporan keuangan (LK) sebagai pembanding omzet ESB.',sync:'Diperbarui manual'},
  performance:{use:'Performa outlet, laba produk, dan waste/lost sales bulanan.',sync:'Diperbarui manual'},
  swot:{use:'Profil, SWOT, dan prioritas tindakan tiap outlet.',sync:'Diperbarui manual'},
  revenue2025:{use:'Omzet bulanan 2025 untuk perbandingan tahunan.',sync:'Diperbarui manual',fields:[['tab','Nama tab','text']]},
  ledger2025:{use:'LK harian 2025 untuk perbandingan tahunan.',sync:'Diperbarui manual'},
 };
 const WEATHER_MODELS=[['best_match','Otomatis (model terbaik untuk lokasi)'],['ecmwf_ifs025','ECMWF (Eropa)'],['gfs_seamless','GFS (NOAA, Amerika)'],['icon_seamless','ICON (DWD, Jerman)'],['jma_seamless','JMA (Jepang)']];
 const THRESHOLD_FIELDS=[
  ['waste','Batas waste','%',0.5,20,0.1,'Outlet di atas angka ini masuk peringatan waste.'],
  ['lostSales','Batas lost sales','%',0.5,30,0.1,'Persen jam buka yang habis stok.'],
  ['openHours','Jam buka per hari','jam',6,24,1,'Dipakai mengubah menit habis stok menjadi persen.'],
  ['omzetHighlight','Sorotan omzet naik/turun','%',5,100,1,'Perubahan omzet minimal agar outlet disorot.'],
  ['wasteLostHighlight','Sorotan waste/lost sales naik','%',5,300,1,'Kenaikan minimal agar outlet disorot.'],
  ['trendWindow','Jendela tren','hari',2,7,1,'Tren membandingkan N hari terakhir dengan N hari sebelumnya.'],
 ];
 const WEATHER_FIELDS=[
  ['rainLabelProb','Label "Hujan" mulai dari peluang','%',20,90,1],
  ['highRiskProb','Tanda hujan tinggi di peta mulai dari','%',30,100,1],
 ];
 const DISPLAY_FIELDS=[['trend','Kondisi outlet (tren 3 hari)'],['wasteLost','Waste & lost sales'],['accuracy','Akurasi prediksi bulan ini'],['weather','Cuaca hari ini & besok'],['events','Kegiatan 7 hari ke depan'],['operations','Ringkasan operasional & akurasi tim']];
 const SUPPORT_VIEWS=[['blind','Uji akurasi PCS'],['projection','Proyeksi bulanan'],['pcs','Penjualan PCS'],['orders','Pesanan'],['reference','Tren omzet & evaluasi'],['products','Produk & laba'],['events','Kegiatan & omzet'],['summary','Profil outlet'],['swot','SWOT'],['area','Sekitar outlet'],['access','Akses tim']];
 const merge=(base,over)=>Object.fromEntries(Object.entries(base).map(([k,v])=>[k,{...v,...(over?.[k]||{})}]));
 function get(){return merge(DEFAULTS,window.DATA_SOURCES?.preferences);}
 // Revisi owner 2026-11-10: yang dikunci khusus Master hanya "Data pendukung". Sumber data,
 // ambang batas, tampilan & produk boleh diubah semua akun Forecast (rules settings/forecastSources
 // ikut dilonggarkan ke forecastPlanner()).
 const isMaster=()=>window.ForecastAuth?.role?.master===true;
 const canEdit=()=>!!window.ForecastRolePolicy?.planner?.(window.ForecastAuth?.role);
 let section='sources',status='',prod=null;
 const P=()=>window.ForecastProducts;
 // Tab Produk (desain ulang 2026-11-10): produk dikelompokkan per kategori seperti urutan di
 // rincian kirim; tambah lewat form khusus; hapus = ditandai dulu (bisa dibatalkan) sampai
 // disimpan; ada penanda "belum disimpan". Draft disimpan di memori selama tab dibuka.
 let prodBase='',newCat=3;
 function prodDraft(){if(!prod){const c=P().core(),x=P().extra();const sp=get().products||{};prod={core:c.map((r,p)=>({label:r.label,ship:r.ship,color:P().hex(sp.core?.[p]?.color)||'',hpp:String(P().hpp()[p])})),extra:x.map(r=>({name:r.name,cat:r.cat,aliases:[...r.aliases],orig:r.name,removed:false,color:P().hex((sp.extra||[]).find(e=>String(e?.name||'').trim()===r.name)?.color)||''})),routes:{...(sp.routes||{})},batch:{...(window.ForecastProduction?.sizes?.()||{})}};prodBase=JSON.stringify(prod);}return prod;}
 const prodDirty=()=>!!prod&&JSON.stringify(prod)!==prodBase;
 function syncProd(form){if(!prod||!form)return;
  form.querySelectorAll('[data-prod-core-label]').forEach(el=>{prod.core[+el.dataset.prodCoreLabel].label=el.value;});
  form.querySelectorAll('[data-prod-core-ship]').forEach(el=>{prod.core[+el.dataset.prodCoreShip].ship=el.checked;});
  form.querySelectorAll('[data-prod-x-name]').forEach(el=>{prod.extra[+el.dataset.prodXName].name=el.value;});
  form.querySelectorAll('[data-prod-x-cat]').forEach(el=>{prod.extra[+el.dataset.prodXCat].cat=Number(el.value);});
  form.querySelectorAll('[data-prod-hpp]').forEach(el=>{prod.core[+el.dataset.prodHpp].hpp=el.value;});
  form.querySelectorAll('[data-prod-batch]').forEach(el=>{prod.batch[el.dataset.prodBatch]=Number(el.value);});
  form.querySelectorAll('[data-color-core]').forEach(el=>{prod.core[+el.dataset.colorCore].color=el.value.toLowerCase();});
  form.querySelectorAll('[data-color-x]').forEach(el=>{prod.extra[+el.dataset.colorX].color=el.value.toLowerCase();});
  form.querySelectorAll('[data-color-route]').forEach(el=>{prod.routes[el.dataset.colorRoute]=el.value.toLowerCase();});}
 // Kartu "Warna rincian kirim" (owner 2026-11-12): tim packing menghafal warna baris produk &
 // header rute, jadi tim sendiri yang mengatur warnanya di sini. Putih = tanpa warna.
 function colorsCard(dis){
  const d=prodDraft(),core=P().core(),routes=window.ForecastShipping?.groups||[];
  const inp=(attr,val,label)=>`<input type="color" ${attr} value="${esc(val||'#ffffff')}" aria-label="Warna ${esc(label)}" ${dis}>`;
  const row=(label,attr,val)=>`<label class="fsc-row" style="--row:${esc(val||'#ffffff')}"><span>${esc(label)}</span>${inp(attr,val,label)}</label>`;
  const coreRows=P().CORE_ORDER.filter(p=>d.core[p].ship).map(p=>row(d.core[p].label||core[p].label,`data-color-core="${p}"`,d.core[p].color||core[p].bg));
  const xRows=d.extra.map((x,i)=>[x,i]).filter(([x])=>!x.removed&&String(x.name||'').trim()).map(([x,i])=>row(x.name,`data-color-x="${i}"`,x.color||P().defaultExtraBg(x.name)));
  const rRows=routes.map(g=>row(g.name,`data-color-route="${esc(g.name)}"`,d.routes[g.name]||P().routeBg(g.name)));
  return `<article class="workspace-card fsc"><div class="fsp-head"><div><h3 class="fs-h3">Warna rincian kirim <small>tabel & gambar WA</small></h3><p class="fs-use">Warna latar baris produk dan header rute di <b>Rincian kirim</b>, sama di tabel dan gambar yang diunduh. Klik kotak warna untuk mengganti. Putih = tanpa warna.</p></div>${dis?'':'<button type="button" class="button quiet" data-color-reset>Kembalikan warna bawaan</button>'}</div>
   <div class="fsc-group"><div class="fsp-ghead">Header rute</div><div class="fsc-grid">${rRows.join('')}</div></div>
   <div class="fsc-group"><div class="fsp-ghead">Baris produk</div><div class="fsc-grid">${[...coreRows,...xRows].join('')}</div></div></article>`;
 }
 function productsBody(dis){
  const d=prodDraft(),C=P().CATS,base=P().DEFAULTS.core,core=P().core(),active=d.extra.filter(x=>!x.removed).length;
  const catSel=(attr,val)=>`<select ${attr} ${dis} aria-label="Kategori">${C.map((c,ci)=>`<option value="${ci}" ${val===ci?'selected':''}>${esc(c)}</option>`).join('')}</select>`;
  const xRow=(x,i)=>{const renamed=x.orig&&x.name.trim()&&x.orig!==x.name.trim(),isNew=!x.orig;
   if(x.removed)return `<div class="fsp-row removed"><span class="fsp-dot"></span><div class="fsp-main"><b>${esc(x.orig||x.name)}</b><small>Akan dihapus dari daftar saat disimpan. Angka di rencana lama tetap aman.</small></div><button type="button" class="fsp-link" data-prod-x-undo="${i}">Batalkan</button></div>`;
   return `<div class="fsp-row ${isNew?'new':''}"><span class="fsp-dot" style="background:${P().extra()[i]?.dot||'#c9b9a4'}"></span><div class="fsp-main"><input type="text" maxlength="60" data-prod-x-name="${i}" value="${esc(x.name)}" placeholder="Nama produk" aria-label="Nama produk" ${dis}>${isNew?'<small class="fsp-tag">Baru</small>':renamed?`<small class="fsp-tag">Ganti nama dari "${esc(x.orig)}" · rencana lama tetap terbaca</small>`:''}</div>${catSel(`data-prod-x-cat="${i}"`,x.cat)}${dis?'':`<button type="button" class="fsp-icon" data-prod-x-del="${i}" title="Hapus produk" aria-label="Hapus ${esc(x.name||'produk')}">✕</button>`}</div>`;};
  const groups=C.map((cat,ci)=>{const rows=d.extra.map((x,i)=>[x,i]).filter(([x])=>x.cat===ci);return rows.length?`<div class="fsp-group"><div class="fsp-ghead">${esc(cat)}<span>${rows.length}</span></div>${rows.map(([x,i])=>xRow(x,i)).join('')}</div>`:'';}).join('');
  const coreGroups=C.map((cat,ci)=>{const rows=P().CORE_ORDER.filter(p=>core[p].cat===ci);return rows.length?`<div class="fsp-group"><div class="fsp-ghead">${esc(cat)}<span>${rows.length}</span></div>${rows.map(p=>{const c=d.core[p];return `<div class="fsp-row ${c.ship?'':'muted'}"><span class="fsp-dot" style="background:${core[p].dot}"></span><div class="fsp-main"><input type="text" maxlength="60" data-prod-core-label="${p}" value="${esc(c.label)}" placeholder="${esc(base[p].label)}" aria-label="Nama di rincian kirim untuk ${esc(base[p].label)}" ${dis}><small>Nama sistem: ${esc(window.ForecastPlanner?.names?.[p]||base[p].label)}</small></div><label class="fsp-switch" title="Tampil di rincian kirim & gambar WA"><input type="checkbox" data-prod-core-ship="${p}" ${c.ship?'checked':''} ${dis}><span class="fsp-track"></span><em>${c.ship?'Tampil':'Disembunyikan'}</em></label></div>`;}).join('')}</div>`:'';}).join('');
  return `<div class="fsp">
   <article class="workspace-card fsp-intro"><div><h3 class="fs-h3">Daftar produk</h3><p class="fs-use">Atur produk yang muncul saat menyusun forecast dan di rincian kirim. Perubahan berlaku untuk seluruh tim setelah <b>Simpan untuk tim</b>.</p></div><div class="fsp-where"><span><b>${active}</b> produk lain</span><span><b>${d.core.filter(c=>c.ship).length}/12</b> produk inti tampil di rincian kirim</span></div></article>
   <article class="workspace-card"><div class="fsp-head"><div><h3 class="fs-h3">Produk lain <small>diisi manual</small></h3><p class="fs-use">Muncul sebagai kolom di <b>Buat forecast</b>, baris di <b>Detail outlet</b>, dan baris di <b>Rincian kirim</b> sesuai kategorinya. Tidak ada saran otomatis.</p></div></div>
    ${groups||'<p class="fsp-empty">Belum ada produk lain. Tambahkan di bawah.</p>'}
    ${dis?'':`<div class="fsp-add"><div class="fsp-add-title">+ Tambah produk baru</div><div class="fsp-add-row"><input type="text" id="fs-prod-new-name" maxlength="60" placeholder="Nama produk, misalnya Roti Pisang Coklat" autocomplete="off">${catSel('id="fs-prod-new-cat"',newCat)}<button type="button" class="button fp-primary" data-prod-add>Tambah</button></div></div>`}
   </article>
   <article class="workspace-card"><h3 class="fs-h3">Isi 1 angkatan produksi <small>pcs per rasa</small></h3><p class="fs-use">Dipakai untuk menyusun <b>Rencana produksi (angkatan)</b> di Buat forecast. Semua rasa dalam satu varian memakai isi yang sama.</p><div class="fsp-batch">${(window.ForecastProduction?.families?.()||[]).map(f=>`<label><span>${esc(f.label)}</span><span class="fsp-batch-in"><input type="number" min="1" max="500" step="1" data-prod-batch="${f.key}" value="${esc(d.batch?.[f.key]??f.size)}" ${dis}><em>pcs</em></span>${f.unit?`<small>${esc(f.unit)}</small>`:''}</label>`).join('')}</div></article>
   <article class="workspace-card"><h3 class="fs-h3">HPP outlet <small>Rp per pcs · harga jual pabrik ke outlet</small></h3><p class="fs-use">Dipakai menghitung nominal <b>estimasi waste</b> di Dashboard & Monitoring (kue sisa × HPP). Persen waste tetap dibagi omzet terjual. Produk lain (roti dll.) belum dihitung.</p><div class="fsp-batch">${P().CORE_ORDER.map(p=>`<label><span>${esc(window.ForecastPlanner?.names?.[p]||base[p].label)}</span><span class="fsp-batch-in"><em>Rp</em><input type="number" min="0" max="1000000" step="1" data-prod-hpp="${p}" value="${esc(d.core[p].hpp)}" ${dis}></span>${Number(d.core[p].hpp)!==P().DEFAULT_HPP[p]?`<small>Bawaan Rp${P().DEFAULT_HPP[p].toLocaleString('id-ID')}</small>`:''}</label>`).join('')}</div></article>
   ${colorsCard(dis)}
   <details class="workspace-card fsp-core"><summary><div><h3 class="fs-h3">12 produk inti <small>nama di rincian kirim & gambar WA</small></h3><p class="fs-use">Dipakai mesin rekomendasi, jadi tidak bisa dihapus atau dipindah kategori. Anda bisa mengganti nama tampilnya atau menyembunyikannya dari rincian kirim.</p></div><span class="fsp-chev">▾</span></summary>${coreGroups}</details>
  </div>`;
 }
 function collectProducts(form){syncProd(form);const d=prod,seen=new Set(),extra=[];
  for(const x of d.extra){if(x.removed)continue;const name=String(x.name||'').trim().replace(/\s+/g,' ');if(!name)throw Error('Ada produk tanpa nama. Isi namanya atau hapus barisnya.');const k=name.toLowerCase();if(seen.has(k))throw Error(`Produk "${name}" tercantum dua kali.`);seen.add(k);
   const aliases=[...new Set([...(x.aliases||[]),...(x.orig&&x.orig!==name?[x.orig]:[])])].filter(a=>a.toLowerCase()!==k).slice(-10);const color=P().hex(x.color);extra.push({name,cat:Number.isInteger(x.cat)?x.cat:3,aliases,...(color?{color}:{})});}
  if(extra.length>20)throw Error('Maksimal 20 produk lain.');
  const batch={};for(const [k,v] of Object.entries(d.batch||{})){if(!Number.isInteger(v)||v<1||v>500)throw Error('Isi 1 angkatan harus angka bulat 1–500 pcs.');batch[k]=v;}
  const routes={};for(const [k,v] of Object.entries(d.routes||{})){const h=P().hex(v);if(h)routes[k]=h;}
  const hpps=d.core.map((c,p)=>{const v=Number(c.hpp);if(String(c.hpp).trim()===''||!Number.isInteger(v)||v<0||v>1000000)throw Error(`HPP ${window.ForecastPlanner?.names?.[p]||P().DEFAULTS.core[p].label} harus angka bulat 0–1.000.000.`);return v;});
  return {core:d.core.map((c,p)=>{const color=P().hex(c.color);return {label:String(c.label||'').trim()||P().DEFAULTS.core[p].label,ship:!!c.ship,hpp:hpps[p],...(color?{color}:{})};}),extra,batch,routes};}
 function addProduct(form){syncProd(form);const el=form?.querySelector('#fs-prod-new-name'),cs=form?.querySelector('#fs-prod-new-cat'),name=String(el?.value||'').trim().replace(/\s+/g,' ');newCat=Number(cs?.value??newCat);
  if(!name){status='Ketik nama produk baru dulu.';return;}
  if(prodDraft().extra.some(x=>!x.removed&&x.name.trim().toLowerCase()===name.toLowerCase())){status=`"${name}" sudah ada di daftar.`;return;}
  prod.extra.push({name,cat:newCat,aliases:[],orig:'',removed:false});status=`"${name}" ditambahkan. Klik Simpan untuk tim agar berlaku.`;}
 function sourceCard(s,dis){
  const info=SOURCE_INFO[s.key]||{use:'',sync:'Diperbarui manual'},vals={...(info.defaults||{}),...s};
  const extra=(info.fields||[]).map(([k,label,type])=>`<label>${esc(label)}<input type="${type}" data-source-field="${esc(s.key)}:${k}" value="${esc(vals[k]??'')}" ${type==='number'?'min="1" step="1"':''} ${dis}></label>`).join('');
  return `<article class="workspace-card fs-card"><div class="fs-card-head"><div><h3>${esc(s.label)}</h3><span class="fs-sync ${info.sync.startsWith('Otomatis')?'auto':''}">${esc(info.sync)}</span></div><a href="${esc(s.url)}" target="_blank" rel="noopener">Buka ↗</a></div><p class="fs-use">${esc(info.use)}</p><label>Link Google Sheets<input type="url" required data-source-url="${esc(s.key)}" value="${esc(s.url)}" ${dis}></label>${extra?`<div class="fs-row">${extra}</div>`:''}</article>`;
 }
 function numberField([k,label,unit,min,max,step,hint],group,value,dis){
  return `<label class="fs-num">${esc(label)}<span class="fs-num-input"><input type="number" data-pref="${group}:${k}" value="${esc(value)}" min="${min}" max="${max}" step="${step}" ${dis}><em>${esc(unit)}</em></span>${hint?`<small>${esc(hint)}</small>`:''}</label>`;
 }
 function render(){
  const p=get(),dis=canEdit()?'':'disabled',sources=window.DATA_SOURCES?.sources||[];
  const tabs=[['sources','Sumber data'],['thresholds','Ambang batas'],['display','Tampilan'],['products','Produk'],['support','Data pendukung'+(isMaster()?'':' 🔒')],...(isMaster()?[['experiment','Eksperimen']]:[])].map(([k,l])=>`<button type="button" class="fs-tab ${section===k?'active':''}" data-settings-tab="${k}" aria-pressed="${section===k}">${l}</button>`).join('');
  let body='';
  if(section==='sources')body=`<div class="fs-grid">${sources.map(s=>sourceCard(s,dis)).join('')}
   <article class="workspace-card fs-card"><div class="fs-card-head"><div><h3>Cuaca</h3><span class="fs-sync auto">Langsung saat dibuka</span></div><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo ↗</a></div><p class="fs-use">Ramalan publik Open-Meteo (gratis, tanpa key) dari koordinat tiap outlet; "Sekarang" diperbarui tiap 15 menit.</p><label>Model cuaca<select data-pref="weather:model" ${dis}>${WEATHER_MODELS.map(([v,l])=>`<option value="${v}" ${p.weather.model===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><div class="fs-row">${WEATHER_FIELDS.map(f=>numberField(f,'weather',p.weather[f[0]],dis)).join('')}</div></article>
   <article class="workspace-card fs-card fs-locked"><div class="fs-card-head"><div><h3>Penjualan ESB</h3><span class="fs-sync auto">Otomatis tiap jam & tiap malam</span></div></div><p class="fs-use">Omzet & PCS per outlet dari ESB. Akun ESB disimpan sebagai rahasia di GitHub (ESB_USERNAME / ESB_PASSWORD), sengaja tidak bisa diubah dari web.</p></article>
   <article class="workspace-card fs-card fs-locked"><div class="fs-card-head"><div><h3>Akses Google Sheets</h3><span class="fs-sync auto">Dipakai sinkronisasi</span></div></div><p class="fs-use">API key Google Sheets disimpan sebagai rahasia GitHub (GOOGLE_SHEETS_API_KEY). Sheet cukup dibagikan "siapa saja yang punya link dapat melihat".</p></article></div>`;
  else if(section==='thresholds')body=`<article class="workspace-card"><div class="fs-num-grid">${THRESHOLD_FIELDS.map(f=>numberField(f,'thresholds',p.thresholds[f[0]],dis)).join('')}</div></article>`;
  else if(section==='display')body=`<article class="workspace-card"><p class="fs-use">Kartu yang tampil di Dashboard. Berlaku untuk seluruh tim.</p><div class="fs-checks">${DISPLAY_FIELDS.map(([k,l])=>`<label class="fs-check"><input type="checkbox" data-pref="display:${k}" ${p.display[k]?'checked':''} ${dis}><span>${esc(l)}</span></label>`).join('')}</div></article>`;
  else if(section==='products')body=productsBody(dis);
  // Eksperimen (owner 2026-11-12): tab hanya muncul untuk Master; isinya terpisah di forecast-experiment.js.
  else if(section==='experiment')body=isMaster()&&window.ForecastExperiment?window.ForecastExperiment.render():'<article class="workspace-card"><p class="fs-lock">🔒 Eksperimen hanya bisa dibuka akun Master.</p></article>';
  else if(!isMaster())body=`<article class="workspace-card"><p class="fs-lock">🔒 Data pendukung hanya bisa dibuka akun Master.</p></article>`;
  else body=`<article class="workspace-card"><p class="fs-use">Data rinci & analisa pendukung. Pilih untuk membuka.</p><div class="fs-support">${SUPPORT_VIEWS.map(([k,l])=>`<button type="button" class="fs-support-btn" data-support-view="${k}">${esc(l)}<span>→</span></button>`).join('')}</div></article>`;
  const actions=section==='support'||section==='experiment'?'':canEdit()?`<div class="fs-actions ${section==='products'?'fsp-actions'+(prodDirty()?' dirty':''):''}"><button type="submit" class="button fp-primary">Simpan untuk tim</button><button type="button" class="button quiet" data-settings-reset>Kembalikan bawaan</button><span id="fs-status" role="status">${esc(status||(section==='products'&&prodDirty()?'Ada perubahan yang belum disimpan.':''))}</span></div>`:`<p class="fs-lock">🔒 Akun ini belum punya akses Forecast untuk mengubah pengaturan.</p>`;
  return `<div class="focus-intro"><h2>Pengaturan</h2><span>Berlaku untuk seluruh tim</span></div><div class="fs-tabs">${tabs}</div><form id="forecast-settings-form" novalidate>${body}${actions}</form>`;
 }
 function collect(form){
  const cur=window.DATA_SOURCES,prefs=get();
  const sources=cur.sources.map(s=>{
   const url=form.querySelector(`[data-source-url="${s.key}"]`)?.value.trim()??s.url;
   if(!window.SourceSettings.validLink(url))throw Error(`Link "${s.label}" harus berupa link Google Sheets yang valid.`);
   const next={...s,url};
   for(const el of form.querySelectorAll(`[data-source-field^="${s.key}:"]`)){
    const k=el.dataset.sourceField.split(':')[1],v=el.value.trim();
    if(el.type==='number'){const n=Number(v);if(!Number.isInteger(n)||n<1)throw Error(`"${s.label}": mulai baris harus angka bulat.`);next[k]=n;}
    else{if(!v)throw Error(`"${s.label}": nama tab tidak boleh kosong.`);next[k]=v;}
   }
   return next;
  });
  for(const el of form.querySelectorAll('[data-pref]')){
   const [g,k]=el.dataset.pref.split(':');
   if(el.type==='checkbox')prefs[g][k]=el.checked;
   else if(el.type==='number'){const n=Number(el.value),min=Number(el.min),max=Number(el.max);if(!Number.isFinite(n)||n<min||n>max)throw Error(`"${el.closest('label')?.firstChild?.textContent?.trim()}" harus antara ${min} dan ${max}.`);prefs[g][k]=n;}
   else prefs[g][k]=el.value;
  }
  if(section==='products'&&prod)prefs.products=collectProducts(form);
  return {...cur,updatedAt:new Date().toISOString(),sources,preferences:prefs};
 }
 async function save(config){
  status='Menyimpan…';rerender();
  try{await window.ForecastSourceCloud.save(config);window.DATA_SOURCES=config;prod=null;status='Tersimpan. Dashboard memakai pengaturan baru; sinkronisasi memakai link baru di run berikutnya.';window.dispatchEvent(new Event('forecast-settings-changed'));}
  catch(err){status=err.message||'Belum tersimpan. Coba kembali.';}
  rerender();
 }
 const rerender=()=>window.dispatchEvent(new Event('forecast-settings-render'));
 function submit(e){
  if(e.target.id!=='forecast-settings-form')return false;
  e.preventDefault();
  if(document.activeElement?.id==='fs-prod-new-name'){addProduct(e.target);rerender();setTimeout(()=>document.getElementById('fs-prod-new-name')?.focus(),0);return true;}
  try{save(collect(e.target));}catch(err){status=err.message;rerender();}
  return true;
 }
 function click(e){
  const t=e.target.closest('[data-settings-tab]');if(t){section=t.dataset.settingsTab;status='';prod=null;return 'render';}
  const sv=e.target.closest('[data-support-view]');if(sv)return isMaster()?{support:sv.dataset.supportView}:false;
  const form=e.target.closest('form');
  if(e.target.closest('[data-prod-add]')){addProduct(form);return 'render';}
  const del=e.target.closest('[data-prod-x-del]');if(del){syncProd(form);const i=+del.dataset.prodXDel,x=prodDraft().extra[i];if(x){if(!x.orig)prod.extra.splice(i,1);else x.removed=true;status='';}return 'render';}
  if(e.target.closest('[data-color-reset]')){syncProd(form);prodDraft().core.forEach(c=>{c.color='';});prod.extra.forEach(x=>{x.color='';});prod.routes={};status='Warna kembali ke bawaan. Klik Simpan untuk tim agar berlaku.';return 'render';}
  const undo=e.target.closest('[data-prod-x-undo]');if(undo){syncProd(form);const x=prodDraft().extra[+undo.dataset.prodXUndo];if(x)x.removed=false;return 'render';}
  if(e.target.closest('[data-settings-reset]')){
   if(!confirm('Kembalikan ambang batas, cuaca, dan tampilan ke bawaan? Link sumber data & daftar produk tidak berubah.'))return false;
   const cur=window.DATA_SOURCES,def=JSON.parse(JSON.stringify(DEFAULTS));def.products=get().products;save({...cur,updatedAt:new Date().toISOString(),preferences:def});return false;
  }
  return false;
 }
 // Ganti kategori / tampil di rincian kirim -> render ulang supaya baris pindah kelompok.
 function change(e){const t=e.target;if(section==='experiment')return !!window.ForecastExperiment?.change(e);if(section!=='products'||!prod)return false;if(t.dataset.colorCore!==undefined||t.dataset.colorX!==undefined||t.dataset.colorRoute!==undefined){syncProd(t.closest('form'));return true;}if(t.dataset.prodXCat!==undefined||t.dataset.prodCoreShip!==undefined||t.dataset.prodHpp!==undefined){syncProd(t.closest('form'));return true;}if(t.id==='fs-prod-new-cat'){newCat=Number(t.value);return false;}return false;}
 return {get,render,submit,click,change,DEFAULTS};
})();
