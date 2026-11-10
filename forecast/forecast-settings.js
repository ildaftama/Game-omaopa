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
 // Hanya akun Master (owner, 2026-11-10) -- Admin Utama pun hanya bisa melihat.
 const canEdit=()=>window.ForecastAuth?.role?.master===true;
 let section='sources',status='';
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
  const tabs=[['sources','Sumber data'],['thresholds','Ambang batas'],['display','Tampilan'],['support','Data pendukung']].map(([k,l])=>`<button type="button" class="fs-tab ${section===k?'active':''}" data-settings-tab="${k}" aria-pressed="${section===k}">${l}</button>`).join('');
  let body='';
  if(section==='sources')body=`<div class="fs-grid">${sources.map(s=>sourceCard(s,dis)).join('')}
   <article class="workspace-card fs-card"><div class="fs-card-head"><div><h3>Cuaca</h3><span class="fs-sync auto">Langsung saat dibuka</span></div><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo ↗</a></div><p class="fs-use">Ramalan publik Open-Meteo (gratis, tanpa key) dari koordinat tiap outlet; "Sekarang" diperbarui tiap 15 menit.</p><label>Model cuaca<select data-pref="weather:model" ${dis}>${WEATHER_MODELS.map(([v,l])=>`<option value="${v}" ${p.weather.model===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><div class="fs-row">${WEATHER_FIELDS.map(f=>numberField(f,'weather',p.weather[f[0]],dis)).join('')}</div></article>
   <article class="workspace-card fs-card fs-locked"><div class="fs-card-head"><div><h3>Penjualan ESB</h3><span class="fs-sync auto">Otomatis tiap jam & tiap malam</span></div></div><p class="fs-use">Omzet & PCS per outlet dari ESB. Akun ESB disimpan sebagai rahasia di GitHub (ESB_USERNAME / ESB_PASSWORD), sengaja tidak bisa diubah dari web.</p></article>
   <article class="workspace-card fs-card fs-locked"><div class="fs-card-head"><div><h3>Akses Google Sheets</h3><span class="fs-sync auto">Dipakai sinkronisasi</span></div></div><p class="fs-use">API key Google Sheets disimpan sebagai rahasia GitHub (GOOGLE_SHEETS_API_KEY). Sheet cukup dibagikan "siapa saja yang punya link dapat melihat".</p></article></div>`;
  else if(section==='thresholds')body=`<article class="workspace-card"><div class="fs-num-grid">${THRESHOLD_FIELDS.map(f=>numberField(f,'thresholds',p.thresholds[f[0]],dis)).join('')}</div></article>`;
  else if(section==='display')body=`<article class="workspace-card"><p class="fs-use">Kartu yang tampil di Dashboard. Berlaku untuk seluruh tim.</p><div class="fs-checks">${DISPLAY_FIELDS.map(([k,l])=>`<label class="fs-check"><input type="checkbox" data-pref="display:${k}" ${p.display[k]?'checked':''} ${dis}><span>${esc(l)}</span></label>`).join('')}</div></article>`;
  else body=`<article class="workspace-card"><p class="fs-use">Data rinci & analisa pendukung. Pilih untuk membuka.</p><div class="fs-support">${SUPPORT_VIEWS.map(([k,l])=>`<button type="button" class="fs-support-btn" data-support-view="${k}">${esc(l)}<span>→</span></button>`).join('')}</div></article>`;
  const actions=section==='support'?'':canEdit()?`<div class="fs-actions"><button type="submit" class="button fp-primary">Simpan untuk tim</button><button type="button" class="button quiet" data-settings-reset>Kembalikan bawaan</button><span id="fs-status" role="status">${esc(status)}</span></div>`:`<p class="fs-lock">🔒 Pengaturan dikunci. Hanya akun Master yang dapat mengubahnya.</p>`;
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
  return {...cur,updatedAt:new Date().toISOString(),sources,preferences:prefs};
 }
 async function save(config){
  status='Menyimpan…';rerender();
  try{await window.ForecastSourceCloud.save(config);window.DATA_SOURCES=config;status='Tersimpan. Dashboard memakai pengaturan baru; sinkronisasi memakai link baru di run berikutnya.';window.dispatchEvent(new Event('forecast-settings-changed'));}
  catch(err){status=err.message||'Belum tersimpan. Coba kembali.';}
  rerender();
 }
 const rerender=()=>window.dispatchEvent(new Event('forecast-settings-render'));
 function submit(e){
  if(e.target.id!=='forecast-settings-form')return false;
  e.preventDefault();
  try{save(collect(e.target));}catch(err){status=err.message;rerender();}
  return true;
 }
 function click(e){
  const t=e.target.closest('[data-settings-tab]');if(t){section=t.dataset.settingsTab;status='';return 'render';}
  const sv=e.target.closest('[data-support-view]');if(sv)return {support:sv.dataset.supportView};
  if(e.target.closest('[data-settings-reset]')){
   if(!confirm('Kembalikan ambang batas, cuaca, dan tampilan ke bawaan? Link sumber data tidak berubah.'))return false;
   const cur=window.DATA_SOURCES;save({...cur,updatedAt:new Date().toISOString(),preferences:JSON.parse(JSON.stringify(DEFAULTS))});return false;
  }
  return false;
 }
 return {get,render,submit,click,DEFAULTS};
})();
