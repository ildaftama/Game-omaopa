'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const outlets = window.OUTLET_DATA.outlets;
  const insights = window.INSIGHT_DATA;
  const population = window.POPULATION_DATA;
  const nf = new Intl.NumberFormat('id-ID');
  const fmt = new Intl.DateTimeFormat('id-ID', {day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Jakarta'});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = s => {try {const u = new URL(s);return ['https:','http:'].includes(u.protocol) ? u.href : '';} catch {return '';}};
  const date = s => fmt.format(new Date(s + 'T12:00:00+07:00'));
  const dateRange = e => e.start === e.end ? date(e.start) : `${date(e.start)} – ${date(e.end)}`;
  const storeKey = 'oma-opa-radar-v1';
  let extra = {events:[],tourism:[]};
  let selected = outlets.find(o => o.name === 'Nusa Indah') || outlets[0];
  let selectedRing = 3, map, ringLayer, eventLayer;
  const markers = new Map();
  const colors = ['#3d7256','#b57543','#847099'];
  const cityOutlets = {
    Surakarta:['UNS','UMS','Pasar Kliwon','Makamhaji','Nusukan','Laweyan'],
    Semarang:['Gajah Raya','UDINUS','UNNES','UNDIP','Sampangan','Unimus','Ngaliyan','Banyumanik'],
    Magelang:['Pemuda, Magelang','Muntilann']
  };
  function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4200); }
  function validDay(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
  function validText(s,n=700){return typeof s==='string'&&s.length>0&&s.length<=n;}
  function validateExtra(d){
    if(!d||!Array.isArray(d.events)||!Array.isArray(d.tourism)||d.events.length>500||d.tourism.length>500)throw Error('Format tambahan tidak sesuai.');
    d.events.forEach(e=>{if(!validText(e.id,100)||!validText(e.title,140)||!validDay(e.start)||!validDay(e.end)||e.end<e.start||!outlets.some(o=>o.id===e.outletId)||!validText(e.venue,160)||!validText(e.sourceName,160)||typeof e.notes!=='string'||e.notes.length>600||(e.source&&!safeUrl(e.source)))throw Error('Data kegiatan tidak valid.');});
    d.tourism.forEach(e=>{if(!validText(e.id,100)||!validText(e.region,100)||!validDay(e.start)||!validDay(e.end)||e.end<e.start||!validDay(e.published)||!Number.isSafeInteger(e.min)||!Number.isSafeInteger(e.max)||e.min<0||e.max<e.min||!['orang','kunjungan','perjalanan'].includes(e.unit)||!validText(e.sourceName,160)||!safeUrl(e.source))throw Error('Data estimasi wisata tidak valid.');});
    if(new Set(d.events.map(e=>e.id)).size!==d.events.length||new Set(d.tourism.map(e=>e.id)).size!==d.tourism.length)throw Error('Ada ID data ganda.');
    return {events:d.events.map(e=>({...e,category:'Lokal',status:'Perlu verifikasi',local:true})),tourism:d.tourism.map(e=>({...e,local:true}))};
  }
  try { const saved=localStorage.getItem(storeKey);if(saved)extra=validateExtra(JSON.parse(saved)); }catch{ toast('Tambahan tersimpan tidak dapat dibaca; data sumber tetap tersedia.'); }
  function persist(next){try{validateExtra(next);localStorage.setItem(storeKey,JSON.stringify(next));extra=next;return true;}catch(e){toast('Belum tersimpan: '+e.message);return false;}}
  function events(){return [...insights.events,...extra.events].sort((a,b)=>a.start.localeCompare(b.start));}
  function pointInRing(lon,lat,coords){let inside=false;for(let i=0,j=coords.length-1;i<coords.length;j=i++){const [xi,yi]=coords[i],[xj,yj]=coords[j];if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
  function coords(e){const c=e.coordinates;if(!c)return null;if(Array.isArray(c)&&c.length===2)return {lon:c[0],lat:c[1]};if(Number.isFinite(c.lat)&&Number.isFinite(c.lon))return c;return null;}
  function inRadius(e,o){const c=coords(e);if(!c)return null;return o.rings.findIndex(r=>pointInRing(c.lon,c.lat,r.coordinates))+1;}
  function distance(e,o){const c=coords(e);if(!c)return null;const rad=x=>x*Math.PI/180;const a=Math.sin(rad(c.lat-o.lat)/2)**2+Math.cos(rad(o.lat))*Math.cos(rad(c.lat))*Math.sin(rad(c.lon-o.lon)/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  function relevant(e,o){
    if(e.outletId)return e.outletId===o.id;
    if(e.outletHints?.includes(o.name))return true;
    if(e.category==='Hari jadi'){return (e.regionalScope?.startsWith(window.OUTLET_REGION_MAP[o.name]))||(e.city==='Yogyakarta'&&o.region==='DIY');}
    if(e.outletHint)return e.outletHint===o.name;
    if(inRadius(e,o)>0)return true;
    if(e.region==='DIY')return o.region==='DIY';
    return (cityOutlets[e.city]||[]).includes(o.name);
  }
  function relation(e,o){
    const n=inRadius(e,o),d=distance(e,o);
    if(n>0)return `Lokasi dalam area ${n} · ±${nf.format(n*400)} m`;
    if(d!==null)return `Di luar area 1.200 m · ${d.toLocaleString('id-ID',{maximumFractionDigits:1})} km garis lurus`;
    return e.outletHint?'Terkait kampus · jarak venue belum tersedia':e.local?'Informasi tim outlet · jarak belum tersedia':'Agenda wilayah';
  }
  function renderOutlets(){
    const q=$('#outlet-search').value.toLocaleLowerCase('id'),region=$('#region-filter').value;
    const filtered=outlets.filter(o=>(!region||o.region===region)&&o.name.toLocaleLowerCase('id').includes(q)).sort((a,b)=>a.region.localeCompare(b.region)||a.name.localeCompare(b.name));
    $('#outlet-count').textContent=filtered.length;
    $('#outlet-list').innerHTML=filtered.length?filtered.map(o=>`<button class="outlet-item ${o.id===selected.id?'active':''}" data-outlet="${esc(o.id)}" aria-pressed="${o.id===selected.id}"><span><strong>${esc(o.name)}</strong><small>${esc(o.region)}</small></span><span class="arrow" aria-hidden="true">↗</span></button>`).join(''):'<p class="fineprint">Outlet tidak ditemukan.</p>';
    all('[data-outlet]').forEach(b=>b.addEventListener('click',()=>selectOutlet(b.dataset.outlet)));
  }
  function selectOutlet(id){selected=outlets.find(o=>o.id===id)||selected;renderOutlets();renderDetail();drawRings(true);}
  function renderDetail(){
    $('#selected-region').textContent=selected.region;
    $('#selected-name').textContent=selected.name;
    $('#maps-link').href=`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lon}`;
    $('#coordinates').textContent=`${selected.lat.toFixed(5)}, ${selected.lon.toFixed(5)}`;
    $('#population-vintage').textContent=`WorldPop · ${population.year}`;
    const rows=(population.records||[]).filter(r=>r.outletName===selected.name);
    $('#population-grid').innerHTML=selected.rings.map((r,i)=>{
      const value=rows.find(x=>x.ring===i+1&&x.status==='success')?.result;
      return `<button class="population-card ${selectedRing===i+1?'active':''}" data-ring="${i+1}" aria-pressed="${selectedRing===i+1}"><span class="radius-label"><i class="ring-dot" style="background:${colors[i]}"></i>±${nf.format(r.nominalMeters)} m</span><strong>${value?'≈'+nf.format(Math.round(value.total_population/10)*10):'—'}</strong><small>${value?'penduduk · '+value.area_km2.toLocaleString('id-ID',{maximumFractionDigits:2})+' km²':'Belum tersedia'}</small></button>`;
    }).join('');
    window.renderDemographics(selected.name,selectedRing);
    all('[data-ring]').forEach(b=>b.addEventListener('click',()=>{selectedRing=Number(b.dataset.ring);renderDetail();drawRings(false);}));
  }
  function markerIcon(o){const active=o.id===selected.id;return L.divIcon({className:'',html:`<div class="outlet-pin ${active?'selected':''}"></div>`,iconSize:active?[20,20]:[14,14],iconAnchor:active?[10,10]:[7,7]});}
  function initMap(){
    if(!window.L){$('#map-failure').hidden=false;return;}
    map=L.map('map',{scrollWheelZoom:false,zoomControl:true});
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
    let loadedTiles=0,failedTiles=0;tiles.on('tileload',()=>{loadedTiles++;$('#map-failure').hidden=true;});tiles.on('tileerror',()=>{failedTiles++;if(!loadedTiles&&failedTiles>3){$('#map-failure').textContent='Peta dasar belum termuat. Titik outlet dan batas KMZ tetap tersedia.';$('#map-failure').hidden=false;}});
    ringLayer=L.layerGroup().addTo(map);eventLayer=L.layerGroup().addTo(map);
    outlets.forEach(o=>{const m=L.marker([o.lat,o.lon],{icon:markerIcon(o),title:o.name}).addTo(map).bindTooltip(esc(o.name));m.on('click',()=>selectOutlet(o.id));markers.set(o.id,m);});
    drawRings(true);
  }
  function drawRings(focus){
    if(!map)return;
    ringLayer.clearLayers();
    [...selected.rings].reverse().forEach(r=>{const i=selected.rings.indexOf(r),active=selectedRing===i+1;L.polygon(r.coordinates.map(c=>[c[1],c[0]]),{color:colors[i],weight:active?2.5:1.1,fillColor:colors[i],fillOpacity:active?.11:.035,interactive:false}).addTo(ringLayer);});
    markers.forEach((m,id)=>m.setIcon(markerIcon(outlets.find(o=>o.id===id))));
    if(focus)map.fitBounds(selected.rings[2].coordinates.map(c=>[c[1],c[0]]),{padding:[26,26],animate:false});
    drawMapEvents();
  }
  function drawMapEvents(){
    if(!eventLayer)return;eventLayer.clearLayers();
    const from=$('#date-from').value,to=$('#date-to').value;
    events().filter(e=>coords(e)&&relevant(e,selected)&&(!from||e.end>=from)&&(!to||e.start<=to)).forEach(e=>{const c=coords(e);L.circleMarker([c.lat,c.lon],{radius:5,color:'#9e5434',fillColor:'#c87549',fillOpacity:1,weight:2}).bindTooltip(`${esc(e.title)}<br>${esc(dateRange(e))}`).addTo(eventLayer);});
  }
  function setView(view){
    all('.view').forEach(el=>el.hidden=el.id!=='view-'+view);
    all('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    if(view==='map'&&map){requestAnimationFrame(()=>map.invalidateSize());}
  }
  function renderEvents(){
    const from=$('#date-from').value,to=$('#date-to').value,cat=$('#category-filter').value,outletId=$('#event-outlet').value;
    const outlet=outlets.find(o=>o.id===outletId);
    $('#agenda-count').textContent=events().length;
    if(from&&to&&from>to){$('#agenda-summary').textContent='Tanggal akhir harus sama atau setelah tanggal awal.';$('#event-list').replaceChildren();return;}
    const filtered=events().filter(e=>(!from||e.end>=from)&&(!to||e.start<=to)&&(!cat||(cat==='Event'?!['Akademik','Lokal','Hari jadi'].includes(e.category):e.category===cat))&&(!outlet||relevant(e,outlet)));
    $('#agenda-summary').textContent=`${filtered.length} kegiatan${outlet?' terkait '+outlet.name:''} · kurasi sumber 13 Oktober 2026`;
    $('#event-list').innerHTML=filtered.length?filtered.map(e=>{
      const candidates=outlets.filter(o=>relevant(e,o));
      const nearby=outlets.filter(o=>inRadius(e,o)>0);
      const coverage=outlet?relation(e,outlet):nearby.length?nearby.map(o=>o.name+' · area '+inRadius(e,o)).join(', '):e.outletHint?'Kampus terkait: '+e.outletHint:((e.city||e.region||'Informasi outlet')+' · konteks wilayah');
      const source=safeUrl(e.source);
      return `<article class="event-card"><div class="event-top"><span class="event-date">${esc(dateRange(e))}</span><span class="tag ${/tentatif|verifikasi|tahunan/i.test(e.status)?'tentative':''}">${esc(e.status)}</span></div><h3>${esc(e.title)}</h3><div class="event-venue">${esc(e.venue)}</div><div class="event-meta"><span>${esc(e.category)}</span><span>${esc(coverage)}</span></div><p>${esc(e.evidence||e.notes||'')}</p>${coords(e)&&safeUrl(e.coordinateSource)?`<details class="fineprint"><summary>Lokasi venue & ketelitian</summary>${esc(e.coordinatePrecision||'Titik representatif lokasi; bukan rute perjalanan.')} · <a href="${esc(safeUrl(e.coordinateSource))}" target="_blank" rel="noopener noreferrer">Sumber lokasi OSM ↗</a></details>`:''}<p>Estimasi pengunjung: ${e.attendance?esc(e.attendance):'—'}${e.capacity?' · Kuota '+nf.format(e.capacity)+' peserta; bukan estimasi kedatangan.':''}</p><div class="event-source"><span>${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(e.sourceName)} ↗</a>`:esc(e.sourceName)}</span>${e.local?`<button class="delete" data-delete-event="${esc(e.id)}">Hapus</button>`:`<span>${candidates.length} outlet terkait</span>`}</div></article>`;
    }).join(''):'<div class="empty"><strong>Belum ada agenda pada pilihan ini.</strong>Ubah tanggal atau outlet. Hasil kosong berarti belum ada data terkurasi, bukan berarti tidak ada kegiatan.</div>';
    all('[data-delete-event]').forEach(b=>b.addEventListener('click',()=>{if(persist({...extra,events:extra.events.filter(e=>e.id!==b.dataset.deleteEvent)})){renderEvents();drawMapEvents();toast('Informasi lokal dihapus.');}}));
    drawMapEvents();
  }
  function renderTourism(){
    const items=[...(insights.tourism||[]),...extra.tourism].sort((a,b)=>a.start.localeCompare(b.start));
    $('#tourism-list').innerHTML=items.length?items.map(e=>`<article class="tourism-entry">${e.local?`<button class="delete" data-delete-tourism="${esc(e.id)}">Hapus</button>`:''}<span class="tag tentative">Estimasi sumber</span><h4>${esc(e.region)}</h4><div class="estimate">${nf.format(e.min)}–${nf.format(e.max)} <small>${esc(e.unit)}</small></div><p>${esc(dateRange(e))}</p><p>Publikasi: ${esc(date(e.published))}</p><a href="${esc(safeUrl(e.source))}" target="_blank" rel="noopener noreferrer">${esc(e.sourceName)} ↗</a></article>`).join(''):'<div class="empty" style="margin-top:22px"><strong>Belum ada estimasi kedatangan terverifikasi.</strong>Angka wisata mendatang tidak diisi dari kapasitas acara atau jumlah penduduk. Anda dapat mencatat estimasi yang sudah diterbitkan sumber resmi.</div>';
    all('[data-delete-tourism]').forEach(b=>b.addEventListener('click',()=>{if(persist({...extra,tourism:extra.tourism.filter(e=>e.id!==b.dataset.deleteTourism)})){renderTourism();toast('Estimasi dihapus.');}}));
  }
  function sourceLink(s){return `<a class="source-link" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(s.title)} ↗</strong><small>${esc(s.description)}</small></a>`;}
  function renderSources(){
    const sources=[{title:'WorldPop · University of Southampton',url:population.sourceUrl,description:'R2025A (2025), resolusi sekitar 100 m. Diolah dengan batas KMZ Oma Opa. Estimasi penduduk bermukim, bukan pelanggan atau wisatawan.'},{title:'Lisensi penduduk · CC BY 4.0',url:'https://creativecommons.org/licenses/by/4.0/',description:'WorldPop, University of Southampton. Perhitungan mengikuti poligon KMZ; cara pembobotan sel tepi tidak dirinci dalam dokumentasi publik.'},...insights.sources];
    $('#source-list').innerHTML=sources.map(sourceLink).join('')+'<p class="fineprint">Cakupan kalender awal: UII, UNNES, UNDIP, beberapa agenda DIY, Solo, dan Magelang. Kampus dan kota lainnya belum tercakup lengkap.</p>';
    $('#tourism-sources').innerHTML=insights.sources.filter(s=>s.tourism).map(sourceLink).join('');
  }
  all('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('#outlet-search').addEventListener('input',renderOutlets);$('#region-filter').addEventListener('change',renderOutlets);
  $('#all-outlets').addEventListener('click',()=>{if(map)map.fitBounds(outlets.map(o=>[o.lat,o.lon]),{padding:[40,40],animate:false});});
  $('#focus-outlet').addEventListener('click',()=>drawRings(true));
  $('#outlet-agenda').addEventListener('click',()=>{$('#event-outlet').value=selected.id;renderEvents();setView('agenda');});
  const localToday=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date());
  $('#date-from').value=validDay(localToday)?localToday:insights.updatedAt;
  const end=new Date($('#date-from').value+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+365);$('#date-to').value=end.toISOString().slice(0,10);
  const options=outlets.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${esc(o.region)}</option>`).join('');
  $('#event-outlet').insertAdjacentHTML('beforeend',options);$('#local-outlet').innerHTML=options;
  ['#date-from','#date-to','#category-filter','#event-outlet'].forEach(s=>$(s).addEventListener('change',renderEvents));
  all('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('#sources-open').addEventListener('click',()=>$('#source-dialog').showModal());
  $('#event-add').addEventListener('click',()=>{const form=$('#event-form');form.reset();form.querySelector('.form-error').textContent='';form.elements.start.value=$('#date-from').value;form.elements.end.value=$('#date-from').value;form.elements.outlet.value=$('#event-outlet').value||selected.id;$('#event-dialog').showModal();});
  $('#event-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f));const entry={id:'local-'+crypto.randomUUID(),title:d.title.trim(),start:d.start,end:d.end,outletId:d.outlet,venue:d.venue.trim(),sourceName:d.sourceName.trim(),source:safeUrl(d.sourceUrl),notes:d.notes.trim(),category:'Lokal',status:'Perlu verifikasi',local:true};try{if(d.sourceUrl&&!entry.source)throw Error('Gunakan tautan http atau https.');const next=validateExtra({...extra,events:[...extra.events,entry]});if(persist(next)){$('#event-dialog').close();renderEvents();toast('Kegiatan tersimpan di browser ini.');}}catch(err){f.querySelector('.form-error').textContent=err.message+' Periksa tanggal dan isian.';}});
  $('#tourism-add').addEventListener('click',()=>{const f=$('#tourism-form');f.reset();f.querySelector('.form-error').textContent='';f.elements.start.value=$('#date-from').value;f.elements.end.value=$('#date-to').value;f.elements.published.value=$('#date-from').value;$('#tourism-dialog').showModal();});
  $('#tourism-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f));const entry={id:'tourism-'+crypto.randomUUID(),region:d.region.trim(),start:d.start,end:d.end,min:Number(d.min),max:Number(d.max),unit:d.unit,sourceName:d.sourceName.trim(),source:safeUrl(d.sourceUrl),published:d.published,local:true};try{const next=validateExtra({...extra,tourism:[...extra.tourism,entry]});if(persist(next)){$('#tourism-dialog').close();renderTourism();toast('Estimasi tersimpan di browser ini.');}}catch(err){f.querySelector('.form-error').textContent=err.message+' Periksa rentang angka dan tanggal.';}});
  $('#export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({schema:'oma-opa-radar-v1',exportedAt:new Date().toISOString(),...extra},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='oma-opa-tambahan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('#import-data').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2e6)throw Error('Berkas maksimal 2 MB.');const imported=validateExtra(JSON.parse(await f.text()));const merged={events:[...new Map([...extra.events,...imported.events].map(x=>[x.id,x])).values()],tourism:[...new Map([...extra.tourism,...imported.tourism].map(x=>[x.id,x])).values()]};if(persist(merged)){renderEvents();renderTourism();toast('Tambahan berhasil diimpor.');}}catch(err){toast('Impor gagal: '+err.message);}finally{e.target.value='';}});
  renderOutlets();renderDetail();renderEvents();renderTourism();renderSources();initMap();
})();
