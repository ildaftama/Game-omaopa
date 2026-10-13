'use strict';
(()=>{
 const $=s=>document.querySelector(s),outlets=window.OUTLET_DATA.outlets;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 $('#traffic-outlet').innerHTML=outlets.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
 $('#traffic-outlet').value=(outlets.find(o=>o.name==='Nusa Indah')||outlets[0]).id;
 function render(){
  const o=outlets.find(o=>o.id===$('#traffic-outlet').value);
  $('#traffic-current').innerHTML=`<h3>${esc(o.name)}</h3><div class="traffic-status unknown">Belum terhubung</div><p class="fineprint">Belum ada rekaman lalu lintas untuk outlet ini.</p>`;
  const region=window.OUTLET_REGION_MAP[o.name],url=region==='Kota Semarang'?'https://lalin.dishub.semarangkota.go.id/':region==='Kota Surakarta'?'https://ccroom-dishub.surakarta.go.id/cctv':o.region==='DIY'?'https://dishub.jogjaprov.go.id/index.php':'';
  $('#traffic-cctv').innerHTML=url?`<a class="button" href="${url}" target="_blank" rel="noopener">Lihat CCTV Dishub ↗</a>`:'';
 }
 $('#traffic-outlet').addEventListener('change',render);render();
})();
