'use strict';
// Performa rencana tim per outlet & per produk inti (owner 2026-11-13).
// - detail(r,c): rincian satu rencana (satu outlet, satu tanggal) per produk inti -- dipakai
//   Monitoring saat nama outlet diklik.
// - render(): menu "Performa bulanan" -- per bulan, per outlet, per produk.
// Definisi (sama di semua tampilan):
//   Kirim   = rencana TERAKHIR reguler + pesanan (versi yang dipakai Rincian kirim).
//   Terjual = total terjual ESB (reguler + pesanan).
//   Lebih   = sisa per produk = estimasi waste TANPA transfer (pcs); nominal x HPP outlet.
//   Kurang  = terjual melebihi kiriman (kemungkinan dapat transfer / stok lama).
//   Akurasi = 100 - WAPE rencana AWAL reguler vs terjual reguler (sama dengan Akurasi A).
// Selisih total bisa 0 walau ada sisa: lebih di satu produk tertutup kurang di produk lain.
window.ForecastOutletPerf=(()=>{
 const model=()=>window.ForecastPlanner;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>n==null?'—':Math.round(n).toLocaleString('id-ID');
 const money=n=>n==null?'—':'Rp'+num(n);
 const pct=n=>n==null||!Number.isFinite(n)?'—':n.toLocaleString('id-ID',{maximumFractionDigits:1})+'%';
 const name=id=>window.OUTLET_INTELLIGENCE?.outlets?.[id]?.name||id;
 const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
 const wasteTh=()=>Number(window.ForecastSettings?.get?.()?.thresholds?.waste)||3.5;
 const pname=p=>window.ForecastProducts?.core?.()?.[p]?.label||model().names[p];
 const ORDER=()=>window.ForecastProducts?.CORE_ORDER||[...Array(12).keys()];
 const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

 // Per produk untuk satu rencana; null kalau penjualan belum lengkap.
 function lines(r,c){
  if(!c?.est)return null;
  const plan=r.plan||r.baseline;
  return c.est.map((e,p)=>{const row=c.rows[p];return {p,reg:plan.active[p]?plan.regular[p]:0,ord:plan.active[p]?plan.orders[p]:0,out:e.out,sold:e.sold,soldReg:row.actual,planned:row.planned,over:Math.max(0,e.out-e.sold),under:Math.max(0,e.sold-e.out),wasteRp:Math.max(0,e.out-e.sold)*e.h,soldRp:e.sold*e.v,abs:Math.abs(row.planned-row.actual)};});
 }
 function sum(ls){const t={out:0,sold:0,over:0,under:0,wasteRp:0,soldRp:0,abs:0,soldReg:0,reg:0,ord:0,planned:0};for(const l of ls)for(const k in t)t[k]+=l[k]||0;t.wastePct=t.soldRp>0?t.wasteRp/t.soldRp*100:null;t.acc=t.soldReg>0?Math.max(0,100-t.abs/t.soldReg*100):null;return t;}
 const wcls=v=>v==null?'':v>wasteTh()?'fp-down':'fp-up';
 const acls=v=>v==null?'':v>=80?'fp-up':'fp-down';

 function productTable(ls,{showReg=true}={}){
  const by=new Map();for(const l of ls){if(!by.has(l.p))by.set(l.p,[]);by.get(l.p).push(l);}
  const rows=ORDER().filter(p=>by.has(p)).map(p=>{const t=sum(by.get(p));if(!t.out&&!t.sold)return '';return `<tr><td>${esc(pname(p))}</td>${showReg?`<td>${num(t.reg)}</td><td>${num(t.ord)}</td>`:''}<td><b>${num(t.out)}</b></td><td>${num(t.sold)}</td><td class="${t.over?'fp-down':''}">${t.over?'+'+num(t.over):'0'}</td><td class="${t.under?'fop-under':''}">${t.under?'−'+num(t.under):'0'}</td><td>${t.over?money(t.wasteRp):'—'}</td><td class="${acls(t.acc)}">${pct(t.acc)}</td></tr>`;}).join('');
  const t=sum(ls);
  return `<div class="fp-table-scroll"><table class="fp-table fop-table"><thead><tr><th>Produk</th>${showReg?'<th>Reguler</th><th>Pesanan</th>':''}<th>Kirim</th><th>Terjual</th><th title="Kirim lebih dari terjual = sisa (estimasi waste tanpa transfer)">Lebih (sisa)</th><th title="Terjual lebih dari kirim (dapat transfer / stok lama)">Kurang</th><th>Est. waste (HPP)</th><th title="100 − WAPE rencana awal reguler vs terjual reguler">Akurasi</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td><b>Total</b></td>${showReg?`<td>${num(t.reg)}</td><td>${num(t.ord)}</td>`:''}<td><b>${num(t.out)}</b></td><td>${num(t.sold)}</td><td class="${t.over?'fp-down':''}">${t.over?'+'+num(t.over):'0'}</td><td>${t.under?'−'+num(t.under):'0'}</td><td class="${wcls(t.wastePct)}">${money(t.wasteRp)} · ${pct(t.wastePct)}</td><td class="${acls(t.acc)}">${pct(t.acc)}</td></tr></tfoot></table></div>`;
 }
 // Rincian satu outlet di satu tanggal (Monitoring).
 function detail(r,c){
  const ls=lines(r,c);
  if(!ls)return `<div class="fop-detail"><p class="fp-caption">Penjualan ${esc(name(r.outlet))} tanggal ini belum lengkap — rincian muncul setelah data ESB hari itu masuk.</p><button type="button" class="fp-link" data-fp-open="${esc(r.key)}">Buka rencana di Detail outlet ↗</button></div>`;
  const t=sum(ls);
  return `<div class="fop-detail"><div class="fop-detail-head"><b>${esc(name(r.outlet))} · per produk inti</b><span>Kirim ${num(t.out)} · terjual ${num(t.sold)} · lebih ${num(t.over)} · kurang ${num(t.under)} pcs</span><button type="button" class="fp-link" data-fp-open="${esc(r.key)}">Buka rencana di Detail outlet ↗</button></div>${productTable(ls)}${t.over&&t.under?`<p class="fp-caption">Selisih total bisa kecil walau ada sisa: kelebihan di satu produk tidak menutup kekurangan di produk lain.</p>`:''}${r.plan?.note?`<p class="fp-caption">Catatan rencana: ${esc(r.plan.note)}</p>`:''}</div>`;
 }

 // ---- Menu "Performa bulanan" ----
 let ym=today().slice(0,7),outlet='__all__';const open=new Set();
 function monthRange(m){const [y,mo]=m.split('-').map(Number);const last=new Date(Date.UTC(y,mo,0)).getUTCDate();return [m+'-01',m+'-'+String(last).padStart(2,'0')];}
 function collect(){
  const cloud=window.ForecastPlanCloud,d=window.PcsPanels.data();if(!cloud||cloud.state!=='ready'||!d.sales||!d.orders)return null;
  const [from,to]=monthRange(ym);cloud.watch?.(from,to);
  const out=[];for(const r of cloud.records||[]){if(r.date<from||r.date>to)continue;if(outlet!=='__all__'&&r.outlet!==outlet)continue;const c=model().compare(r,d.sales,d.orders);const ls=lines(r,c);out.push({r,ls});}
  return out;
 }
 function render(){
  const all=collect();const ids=[...(window.PcsPanels.data().sales?.outletIds||[])].sort((a,b)=>name(a).localeCompare(name(b)));
  const [y,m]=ym.split('-').map(Number);
  const ctl=`<div class="fp-controls"><label>Bulan<input type="month" id="fop-month" value="${ym}"></label><label>Outlet<select id="fop-outlet"><option value="__all__">Semua outlet</option>${ids.map(id=>`<option value="${esc(id)}" ${id===outlet?'selected':''}>${esc(name(id))}</option>`).join('')}</select></label></div>`;
  if(!all)return ctl+'<div class="fp-empty">Memuat rencana tim dan penjualan…</div>';
  const done=all.filter(x=>x.ls),wait=all.length-done.length;
  if(!done.length)return ctl+`<div class="fp-empty"><h3>Belum ada rencana yang bisa dinilai di ${MONTHS[m-1]} ${y}</h3><p>${all.length?`${all.length} rencana masih menunggu data penjualan lengkap.`:'Belum ada rencana tersimpan pada bulan ini.'}</p></div>`;
  const flat=done.flatMap(x=>x.ls),T=sum(flat),days=new Set(done.map(x=>x.r.date)).size;
  const cards=`<div class="fp-metrics"><article><span>Rencana dinilai</span><strong>${done.length}</strong><small>${days} hari${wait?` · ${wait} menunggu penjualan`:''}</small></article><article><span>Kirim vs terjual</span><strong>${num(T.out)} <small>/ ${num(T.sold)} PCS</small></strong><small>Produk inti, reguler + pesanan</small></article><article><span>Akurasi rencana</span><strong class="${acls(T.acc)}">${pct(T.acc)}</strong><small>100 − WAPE rencana awal vs terjual reguler</small></article><article><span>Est. waste · tanpa transfer</span><strong class="${wcls(T.wastePct)}">${pct(T.wastePct)}</strong><small>${num(T.over)} pcs sisa · ${money(T.wasteRp)} (HPP) · ambang ${wasteTh().toLocaleString('id-ID')}%</small></article><article><span>Kurang</span><strong>${num(T.under)} <small>PCS</small></strong><small>Terjual melebihi kiriman (transfer / stok lama)</small></article></div>`;
  if(outlet!=='__all__'){
   const byDay=[...done].sort((a,b)=>b.r.date.localeCompare(a.r.date)).map(x=>{const t=sum(x.ls);return `<tr><td>${esc(x.r.date.slice(8))} ${MONTHS[m-1].slice(0,3)}</td><td>${num(t.out)}</td><td>${num(t.sold)}</td><td class="${t.over?'fp-down':''}">${t.over?'+'+num(t.over):'0'}</td><td>${t.under?'−'+num(t.under):'0'}</td><td class="${wcls(t.wastePct)}">${pct(t.wastePct)}</td><td class="${acls(t.acc)}">${pct(t.acc)}</td></tr>`;}).join('');
   return `${ctl}${cards}<div class="fp-section-heading"><div><h2>${esc(name(outlet))} · per produk</h2><p>${MONTHS[m-1]} ${y}, dijumlah dari ${done.length} rencana.</p></div></div>${productTable(flat)}<div class="fp-section-heading"><div><h2>Per hari</h2></div></div><div class="fp-table-scroll"><table class="fp-table fop-table"><thead><tr><th>Tanggal</th><th>Kirim</th><th>Terjual</th><th>Lebih (sisa)</th><th>Kurang</th><th>Est. waste</th><th>Akurasi</th></tr></thead><tbody>${byDay}</tbody></table></div>${note()}`;
  }
  const byOutlet=new Map();for(const x of done){if(!byOutlet.has(x.r.outlet))byOutlet.set(x.r.outlet,[]);byOutlet.get(x.r.outlet).push(x);}
  const rows=[...byOutlet].map(([id,xs])=>({id,xs,t:sum(xs.flatMap(x=>x.ls))})).sort((a,b)=>(b.t.wastePct??-1)-(a.t.wastePct??-1)).map(({id,xs,t})=>{const o=open.has(id);return `<tr class="fp-day ${o?'open':''}" data-fop-outlet="${esc(id)}"><td><span class="fp-caret">${o?'▾':'▸'}</span><b>${esc(name(id))}</b><small>${xs.length} hari</small></td><td>${num(t.out)}</td><td>${num(t.sold)}</td><td class="${t.over?'fp-down':''}">${t.over?'+'+num(t.over):'0'}</td><td>${t.under?'−'+num(t.under):'0'}</td><td class="${wcls(t.wastePct)}">${pct(t.wastePct)}</td><td>${money(t.wasteRp)}</td><td class="${acls(t.acc)}">${pct(t.acc)}</td></tr>${o?`<tr class="fp-day-detail"><td colspan="8"><div class="fp-day-box">${productTable(xs.flatMap(x=>x.ls))}<button type="button" class="fp-link" data-fop-only="${esc(id)}">Lihat per hari untuk ${esc(name(id))} →</button></div></td></tr>`:''}`;}).join('');
  return `${ctl}${cards}<div class="fp-section-heading"><div><h2>Per outlet</h2><p>${MONTHS[m-1]} ${y} · diurutkan dari estimasi waste tertinggi. Klik outlet untuk melihat per produk.</p></div></div><div class="fp-table-scroll"><table class="fp-table fp-days fop-table"><thead><tr><th>Outlet</th><th>Kirim</th><th>Terjual</th><th>Lebih (sisa)</th><th>Kurang</th><th>Est. waste</th><th>Nominal (HPP)</th><th>Akurasi</th></tr></thead><tbody>${rows}</tbody></table></div><div class="fp-section-heading"><div><h2>Semua outlet · per produk</h2></div></div>${productTable(flat)}${note()}`;
 }
 const note=()=>`<p class="fp-caption"><b>Kirim</b> = rencana terakhir (reguler + pesanan). <b>Lebih</b> = sisa per produk per outlet = estimasi waste <b>tanpa transfer</b>; di lapangan sebagian bisa ditransfer, jadi waste real biasanya lebih kecil. Nominal waste memakai HPP outlet (Pengaturan › Produk), persen dibagi omzet terjual. <b>Kurang</b> = terjual melebihi kiriman. <b>Akurasi</b> memakai rencana awal (sebelum hari H) vs terjual reguler. Hanya 12 produk inti.</p>`;
 function click(e){
  const o=e.target.closest('[data-fop-outlet]');if(o){const id=o.dataset.fopOutlet;open.has(id)?open.delete(id):open.add(id);return true;}
  const only=e.target.closest('[data-fop-only]');if(only){outlet=only.dataset.fopOnly;return true;}
  return false;
 }
 function change(e){
  if(e.target.id==='fop-month'&&/^\d{4}-\d{2}$/.test(e.target.value)){ym=e.target.value;return true;}
  if(e.target.id==='fop-outlet'){outlet=e.target.value;return true;}
  return false;
 }
 return {lines,sum,detail,render,click,change};
})();
