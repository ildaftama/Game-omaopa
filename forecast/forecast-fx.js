'use strict';
// Efek interaktif ringan untuk seluruh web (owner 2026-11-19: "lebih interaktif, kesan canggih").
// - Angka di kartu ringkasan "menghitung naik" saat kartu pertama kali muncul (tiap elemen sekali).
// - Efek riak (ripple) saat tombol diklik.
// Semua efek dimatikan kalau pengguna memilih "kurangi animasi" di sistemnya.
window.ForecastFX=(()=>{
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const done=new WeakSet();
 const SEL='.fd-kpi strong,.ft-kpis strong,.fp-metrics article>strong,.fd-overview-stat b';
 function countUp(el){
  const txt=el.textContent,m=txt.match(/-?\d[\d.]*(?:,\d+)?/);if(!m)return;
  const raw=m[0],val=Number(raw.replace(/\./g,'').replace(',','.'));if(!Number.isFinite(val)||val===0)return;
  const dec=(raw.split(',')[1]||'').length,pre=txt.slice(0,m.index),post=txt.slice(m.index+raw.length),t0=performance.now(),dur=750;
  const fmt=v=>v.toLocaleString('id-ID',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  const step=now=>{if(!el.isConnected)return;const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=k<1?pre+fmt(val*e)+post:txt;if(k<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
 }
 function run(){
  if(reduce())return;
  for(const el of document.querySelectorAll(SEL)){if(done.has(el))continue;done.add(el);if(!el.children.length)countUp(el);}
 }
 // Riak saat tombol diklik.
 document.addEventListener('pointerdown',e=>{
  if(reduce())return;const b=e.target.closest('.button,.ft-chip,.focus-tabs button,.ft-view button,.ft-area-tabs button,.fp-seg button');if(!b)return;
  const r=b.getBoundingClientRect(),s=document.createElement('span'),d=Math.max(r.width,r.height);
  s.className='fx-ripple';s.style.cssText=`width:${d}px;height:${d}px;left:${e.clientX-r.left-d/2}px;top:${e.clientY-r.top-d/2}px`;
  if(getComputedStyle(b).position==='static')b.style.position='relative';b.style.overflow='hidden';b.appendChild(s);setTimeout(()=>s.remove(),550);
 },{passive:true});
 return {run};
})();
