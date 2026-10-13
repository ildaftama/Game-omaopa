'use strict';
(()=>{
 const $=s=>document.querySelector(s),outlets=window.OUTLET_DATA.outlets,key='oma-opa-road-observations-v1';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const levels=['Lancar','Sedang','Padat','Macet'];let saved={};
 function valid(r){return r&&levels.includes(r.level)&&typeof r.road==='string'&&r.road.length<=120&&typeof r.source==='string'&&r.source.length<=120&&Number.isFinite(Date.parse(r.observed))&&Date.parse(r.observed)<=Date.now()+60000;}
 try{const data=JSON.parse(localStorage.getItem(key)||'{}');Object.entries(data).forEach(([id,r])=>{if(outlets.some(o=>o.id===id)&&valid(r))saved[id]=r;});}catch{}
 $('#traffic-outlet').innerHTML=outlets.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
 $('#traffic-outlet').value=outlets.find(o=>o.name==='Nusa Indah').id;
 function render(updateForm=true){
  const o=outlets.find(o=>o.id===$('#traffic-outlet').value),r=saved[o.id];
  $('#traffic-current').innerHTML=r?`<h3>${esc(o.name)} · ${esc(r.road)}</h3><div class="traffic-status level-${levels.indexOf(r.level)}">${esc(r.level)}</div><p>${Date.now()-Date.parse(r.observed)>3600000?'Pengamatan lama · ':''}Pengamatan tim · ${new Date(r.observed).toLocaleString('id-ID')}</p><p class="fineprint">${esc(r.source)}</p><button class="text-button" id="traffic-clear">Hapus pengamatan</button>`:`<h3>${esc(o.name)}</h3><div class="traffic-status unknown">Belum ada data</div><p class="fineprint">Trafik langsung belum terhubung.</p>`;
  const region=window.OUTLET_REGION_MAP[o.name],url=region==='Kota Semarang'?'https://lalin.dishub.semarangkota.go.id/':region==='Kota Surakarta'?'https://ccroom-dishub.surakarta.go.id/cctv':o.region==='DIY'?'https://dishub.jogjaprov.go.id/index.php':'';
  $('#traffic-cctv').innerHTML=url?`<a class="button" href="${url}" target="_blank" rel="noopener">Cek CCTV Dishub wilayah ↗</a>`:'';
  const clear=$('#traffic-clear');if(clear)clear.onclick=()=>{const next={...saved};delete next[o.id];try{localStorage.setItem(key,JSON.stringify(next));saved=next;render();}catch{alert('Penyimpanan browser tidak tersedia.');}};
  $('#traffic-form').elements.road.value=r?.road||'';
  const now=new Date(Date.now()-new Date().getTimezoneOffset()*60000);$('#traffic-form').elements.observed.value=now.toISOString().slice(0,16);
 }
 $('#traffic-outlet').onchange=render;
 $('#traffic-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f)),r={road:d.road.trim(),level:d.level,source:d.source.trim(),observed:new Date(d.observed).toISOString()};if(!r.road||!r.source||!valid(r)){f.elements.observed.setCustomValidity('Periksa isian dan waktu; tidak boleh di masa depan.');f.reportValidity();return;}try{const next={...saved,[$('#traffic-outlet').value]:r};localStorage.setItem(key,JSON.stringify(next));saved=next;render();}catch{alert('Pengamatan belum tersimpan.');}};
 $('#traffic-form').elements.observed.oninput=e=>e.target.setCustomValidity('');
 render();setInterval(()=>render(false),60000);
})();

