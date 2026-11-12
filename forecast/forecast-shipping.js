'use strict';
// Rincian pengiriman untuk grup WA logistik (owner, 2026-11-10): tabel "Pengiriman Pertama" per
// rute dari rencana forecaster yang sudah disimpan, plus "Request tambahan" dari manajemen
// sebelah. Diekspor sebagai gambar PNG (canvas, tanpa library luar) -- di HP bisa langsung
// dibagikan ke WhatsApp lewat Web Share API. Persen pengiriman pertama & request tambahan
// disimpan di perangkat (localStorage), bukan database.
window.ForecastShipping=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
 const shift=(d,n)=>window.ForecastPlanner.shift(d,n);
 // Warna (owner 2026-11-12): tim packing SUDAH HAFAL warna format logistik lama -- latar baris per
 // produk (Mini Cheese kuning, Mini Choco oranye, Durian hijau, Chiffon Classic peach, Lite biru,
 // dst.) dan warna header per rute (Semarang & Magelang ungu muda, Solo hijau, Jogja toska).
 // Versi "kalem" 2026-11-10 menggantinya dengan baris abu-abu -> pembagian kue jadi rawan salah.
 // Warnanya dikembalikan dengan HUE yang sama, hanya dilembutkan (bukan diganti).
 const GROUPS=[
  {name:'Semarang',color:'#7a5f9a',soft:'#e6d6ee',outlets:[['unnes','UNNES'],['sampangan','SAMPANGAN'],['undip','UNDIP'],['udinus','UDINUS'],['unimus','UNIMUS'],['ngaliyan','NGALIYAN'],['gajah-raya','GAJAH RAYA']]},
  {name:'Magelang – Salatiga',color:'#7a5f9a',soft:'#e6d6ee',outlets:[['muntilann','MUNTILAN'],['pemuda-magelang','MAGELANG'],['temanggung','TEMANGGUNG'],['uksw','UKSW'],['ambarawa','AMBARAWA']]},
  {name:'Solo',color:'#4e8a5e',soft:'#d2ebce',outlets:[['merbabu','MERBABU'],['rajawali','RAJAWALI'],['ums','UMS'],['makamhaji','MAKAMHAJI'],['laweyan','LAWEYAN'],['sukoharjo','SUKOHARJO'],['nusukan','NUSUKAN'],['uns','JEBRES'],['sragen','SRAGEN'],['karanganyar','KARANGANYAR'],['boyolali','BOYOLALI']]},
  {name:'Jogja',color:'#2a8f99',soft:'#bfeef0',outlets:[['nusa-indah','NUSA INDAH'],['umy','UMY'],['jakal-uii','JAKAL'],['tajem','TAJEM'],['godean','GODEAN']]},
 ];
 // Baris = [label, sumber, titik warna, kategori]; sumber = indeks SKU inti atau objek produk
 // lain. Daftar & nama mengikuti Pengaturan › Produk (forecast-products.js), dibangun ulang
 // setiap render supaya perubahan pengaturan langsung berlaku.
 const PR=()=>window.ForecastProducts;
 const CATS=PR().CATS;
 let ROWS=[];
 // Latar baris = warna format logistik lama, dilembutkan (hue sama). Ogura/Malmil memang putih.
 // Kunci: indeks SKU inti, atau nama produk lain (huruf kecil; nama lama/alias ikut dicek).
 const ROW_BG={4:'#fff6a8',5:'#fbd2a6',6:'#b9efbf',7:'#fdeadd',8:'#fdeadd',9:'#fde0a6',10:'#d3e3f6',11:'#d3e3f6',
  'box mini':'#e2dcf0','chiffon kurma':'#f4c6a6','roti sosis':'#f7d6d2','roti manis sosis':'#f7d6d2','roti abon':'#bdd3f6','roti manis abon':'#bdd3f6',
  'roti coklat':'#d6eacb','roti manis coklat meses':'#d6eacb','whip':'#f8d3b8'};
 const rowBg=src=>typeof src==='number'?ROW_BG[src]||null:[src.name,...(src.aliases||[])].map(n=>ROW_BG[String(n).trim().toLowerCase()]).find(Boolean)||null;
 function buildRows(){const core=PR().core(),out=[];for(const p of PR().CORE_ORDER){const c=core[p];if(c.ship)out.push([c.label,p,c.dot,c.cat,rowBg(p)]);}for(const x of PR().extra())out.push([x.name,x,x.dot,x.cat,rowBg(x)]);
  // Urutkan per kategori, urutan dalam kategori tetap.
  return CATS.flatMap((_,ci)=>out.filter(r=>r[3]===ci));}
 const REQ_ROWS=[['Ogura Cheese'],['Ogura Chocolate'],['Malmil Cheese'],['Malmil Choco'],['Mini pcs cheese'],['Mini pcs choco'],['Mini pcs durian'],['Chiffon Keju'],['Chiffon Ekstra Keju'],['Chiffon Lite Keju'],['Chiffon Lite Ekstra Keju'],['Chiffon Butter'],['Roti Manis Sosis'],['Roti Manis Abon'],['Roti Manis Coklat']];
 const REQ_ACCENT='#4f6378',FACTORY_ACCENT='#8a6a3b';
 const METHODS=['Diambil ke Pabrik','Diantar oleh Driver'];
 const mix=(hex,to,a)=>{const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),A=p(hex),B=p(to);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*a).toString(16).padStart(2,'0')).join('');};
 const tint=(h,a)=>mix(h,'#ffffff',a),shade=(h,a)=>mix(h,'#000000',a);
 const nf=n=>Number(n).toLocaleString('id-ID');
 let date=null,status='';
 const store=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
 const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
 const pctKey=()=>'fs-ship-pct|'+date,reqKey=()=>'fs-ship-req|'+date;
 const pcts=()=>store(pctKey())||{};
 function requests(){const r=store(reqKey());return Array.isArray(r)?r:[];}
 const dateLabel=d=>new Date(d+'T12:00:00+07:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 function plans(){
  const cloud=window.ForecastPlanCloud;cloud?.watch?.(date,date);
  const by=new Map();for(const r of cloud?.records||[])if(r.date===date)by.set(r.outlet,r);
  return by;
 }
 function qty(record,src,pct){
  if(!record)return null;const p=record.plan;let v=0;
  if(typeof src==='number'){if(!p.active?.[src])return 0;v=(p.regular[src]||0)+(p.orders[src]||0);}
  else{const it=PR().itemFor(p.customItems,src);v=it?(Number(it.regular)||0)+(Number(it.orders)||0):0;}
  return Math.round(v*pct/100);
 }
 const sumOf=vals=>{const k=vals.filter(v=>v!=null);return k.length?k.reduce((a,b)=>a+Number(b||0),0):null;};
 function groupData(by){
  const P=pcts();
  return GROUPS.map(g=>{const cols=g.outlets.map(([id,label])=>{const r=by.get(id),pct=Number.isFinite(P[id])?P[id]:100;return {id,label,pct,record:r,values:ROWS.map(([,src])=>qty(r,src,pct))};});
   const totals=ROWS.map((_,ri)=>sumOf(cols.map(c=>c.values[ri])));return {...g,cols,totals,grand:sumOf(totals),filled:cols.filter(c=>c.record).length};});
 }
 // Pesanan untuk pabrik (bukan outlet), dari rekap sheet PESANAN (factoryDays, pcs_orders.py).
 function factory(){const f=window.PcsPanels?.data?.()?.orders?.factoryDays;if(!Array.isArray(f))return null;const r=f.find(x=>x.date===date);const qty=r?r.qty.map((v,p)=>Number.isInteger(v)?v:r.knownQty?.[p]||0):Array(12).fill(0);return {qty,orders:r?.orders||0,partial:!!r?.qty?.some(v=>v===null),total:qty.reduce((a,b)=>a+b,0)};}
 // Rencana produksi dari rencana tersimpan (+ pesanan pabrik), dalam angkatan dapur.
 function production(by){const PD=window.ForecastProduction;if(!PD)return null;const box=PR().match('Box Mini');const ins=[...by.values()].map(r=>({id:r.outlet,regular:r.plan.regular,orders:r.plan.orders,boxMini:box?(()=>{const it=PR().itemFor(r.plan.customItems,box);return it?(Number(it.regular)||0)+(Number(it.orders)||0):0;})():0}));if(!ins.length)return null;const f=factory();const rows=PD.families().flatMap(fm=>fm.ps.map(p=>{const regular=ins.reduce((s,o)=>s+(o.regular[p]||0),0),orders=ins.reduce((s,o)=>s+(o.orders[p]||0),0),fac=f?.qty?.[p]||0,bx=fm.key==='mini'?ins.reduce((s,o)=>s+o.boxMini,0)*3:0,total=regular+orders+fac+bx,full=Math.floor(total/fm.size),rem=total-full*fm.size;return {p,fam:fm,total,full,rem};}));
  // Mini: 1 angkatan campur 3 rasa, selalu dibulatkan naik setelah dikurangi stok (dari draft Buat forecast di perangkat ini).
  const mini=rows.filter(r=>r.fam.combined),rest=rows.filter(r=>!r.fam.combined);let combo=null;
  if(mini.length){let stock=0;try{stock=Math.max(0,Math.round(Number(JSON.parse(localStorage.getItem('omaopa-topdown-v2:'+date)||'null')?.miniStock)||0));}catch{}const fm=mini[0].fam,total=mini.reduce((s,r)=>s+r.total,0),batches=Math.ceil(Math.max(0,total-stock)/fm.size);combo={combined:true,fam:fm,total,stock,full:batches,rem:0,leftover:batches*fm.size+stock-total,per:mini};}
  const all=[...rest,...(combo?[combo]:[])];
  return {rows:all,batches:all.reduce((s,r)=>s+r.full,0),odd:rest.filter(r=>r.rem).length};}
 const numCell=v=>v==null?'<td class="fs-nil">—</td>':Number(v)===0?'<td class="fs-zero">0</td>':`<td>${nf(v)}</td>`;
 // view 'production' = menu Rencana produksi (untuk dapur); default = Rincian kirim (untuk logistik).
 function render(view){
  if(!date)date=shift(today(),1);ROWS=buildRows();
  const by=plans(),groups=groupData(by),missing=groups.flatMap(g=>g.cols.filter(c=>!c.record).map(c=>c.label)),reqs=requests();
  const body=g=>CATS.map((cat,ci)=>`<tr class="fs-cat"><td colspan="${g.cols.length+2}">${esc(cat)}</td></tr>${ROWS.map((r,ri)=>[r,ri]).filter(([r])=>r[3]===ci).map(([[label,,dot,,bg],ri])=>`<tr${bg?` class="fs-row-bg" style="--row:${bg}"`:''}><td>${bg?'':`<span class="fs-dot" style="background:${dot}"></span>`}${esc(label)}</td>${g.cols.map(c=>numCell(c.values[ri])).join('')}${numCell(g.totals[ri]).replace('<td','<td data-tot')}</tr>`).join('')}`).join('');
  const table=g=>`<section class="fs-ship-card" style="--acc:${g.color};--acc-soft:${g.soft||tint(g.color,.9)};--acc-ink:${shade(g.color,.35)}"><header class="fs-ship-card-head"><h3 class="fs-ship-title">${esc(g.name)}</h3><span class="fs-ship-meta">${g.filled}/${g.cols.length} outlet terisi${g.grand!=null?` · ${nf(g.grand)} pcs`:''}</span></header><div class="fs-ship-wrap"><table class="fs-ship"><thead><tr><th class="fs-ship-corner" rowspan="2">Produk</th>${g.cols.map(c=>`<th class="${c.record?'':'fs-ship-missing'}" title="${c.record?'':'Belum ada rencana tersimpan'}">${esc(c.label)}</th>`).join('')}<th class="fs-ship-totalh" rowspan="2">Total</th></tr><tr class="fs-ship-pctrow">${g.cols.map(c=>`<th><label class="fs-ship-pct"><input type="number" min="0" max="100" step="5" value="${c.pct}" data-ship-pct="${esc(c.id)}" aria-label="Persen pengiriman pertama ${esc(c.label)}"><span>%</span></label></th>`).join('')}</tr></thead><tbody>${body(g)}</tbody></table></div></section>`;
  const reqTable=`<section class="fs-ship-card fs-req-card" style="--acc:${REQ_ACCENT};--acc-soft:${tint(REQ_ACCENT,.9)};--acc-ink:${shade(REQ_ACCENT,.3)}"><header class="fs-ship-card-head"><h3 class="fs-ship-title">Request tambahan</h3><span class="fs-ship-meta">Pesanan manajemen sebelah · tersimpan di perangkat ini</span></header><div class="fs-ship-wrap"><table class="fs-ship fs-req"><thead><tr><th class="fs-ship-corner">Produk</th>${reqs.map((c,i)=>`<th><div class="fs-req-name"><input type="text" maxlength="40" value="${esc(c.name)}" data-req-name="${i}" placeholder="Nama peminta" aria-label="Nama peminta"><button type="button" class="fs-req-remove" data-req-remove="${i}" aria-label="Hapus kolom" title="Hapus kolom">×</button></div></th>`).join('')}<th class="fs-req-addcell"><button type="button" class="fs-req-add" data-req-add>+ Tambah peminta</button></th></tr></thead><tbody>${REQ_ROWS.map(([label],ri)=>`<tr><td>${esc(label)}</td>${reqs.map((c,i)=>`<td><input type="number" min="0" max="10000" step="1" value="${c.qty?.[ri]??''}" data-req-qty="${i}:${ri}" aria-label="${esc(label)}" placeholder="0"></td>`).join('')}<td></td></tr>`).join('')}<tr class="fs-cat"><td colspan="${reqs.length+2}">Pengambilan / pengiriman</td></tr><tr><td>Waktu</td>${reqs.map((c,i)=>`<td><input type="text" maxlength="30" value="${esc(c.time||'')}" data-req-time="${i}" placeholder="Pukul 09.30"></td>`).join('')}<td></td></tr><tr><td>Cara</td>${reqs.map((c,i)=>`<td><select data-req-method="${i}">${METHODS.map(m=>`<option ${c.method===m?'selected':''}>${m}</option>`).join('')}</select></td>`).join('')}<td></td></tr></tbody></table></div>${reqs.length?'':'<p class="fs-req-empty">Belum ada request. Klik <b>+ Tambah peminta</b> untuk menambah kolom (misalnya Admin Pogung atau Marketing HO).</p>'}</section>`;
  const f=factory(),fRows=PR().CORE_ORDER.map(p=>PR().core()[p]).map(c=>[[c.label,c.p,c.dot,c.cat],c.p]);
  const factoryCard=`<section class="fs-ship-card fs-factory-card" style="--acc:${FACTORY_ACCENT};--acc-soft:${tint(FACTORY_ACCENT,.9)};--acc-ink:${shade(FACTORY_ACCENT,.35)}"><header class="fs-ship-card-head"><h3 class="fs-ship-title">Pesanan pabrik</h3><span class="fs-ship-meta">${f?`${f.orders} pesanan · ${nf(f.total)} pcs`:'menunggu sinkron pesanan'} · tidak masuk outlet</span></header>${!f?'<p class="fs-req-empty">Pesanan bertulisan "pabrik" di sheet PESANAN akan tampil di sini setelah sinkron pesanan berikutnya.</p>':!f.total?'<p class="fs-req-empty">Tidak ada pesanan untuk pabrik pada tanggal ini.</p>':`<div class="fs-ship-wrap"><table class="fs-ship"><thead><tr><th class="fs-ship-corner">Produk</th><th class="fs-ship-totalh">Pabrik</th></tr></thead><tbody>${fRows.filter(([r])=>f.qty[r[1]]>0).map(([[label,src,dot]])=>`<tr><td><span class="fs-dot" style="background:${dot}"></span>${esc(label)}</td>${numCell(f.qty[src]).replace('<td','<td data-tot')}</tr>`).join('')}</tbody></table></div>${f.partial?'<p class="fs-req-empty">Sebagian varian pesanan belum pasti, cek sheet PESANAN.</p>':''}`}</section>`;
  const pr=production(by),core=PR().core();
  const prodCard=pr?`<section class="fs-ship-card fs-prod-card" style="--acc:#3d5566;--acc-soft:${tint('#3d5566',.9)};--acc-ink:${shade('#3d5566',.2)}"><header class="fs-ship-card-head"><h3 class="fs-ship-title">Rencana produksi</h3><span class="fs-ship-meta">${pr.batches} angkatan penuh${pr.odd?` · ${pr.odd} rasa belum pas`:''} · dari ${by.size} rencana tersimpan${f?.total?' + pesanan pabrik':''}</span></header>${pr.odd?`<p class="fs-req-empty">${pr.odd} rasa belum pas kelipatan angkatan. Sesuaikan di <b>Buat forecast › Rencana produksi</b> lalu simpan ulang.</p>`:''}<div class="fs-ship-wrap"><table class="fs-ship"><thead><tr><th class="fs-ship-corner">Produk</th><th>Total pcs</th><th class="fs-ship-totalh">Angkatan</th></tr></thead><tbody>${window.ForecastProduction.families().map(fm=>`<tr class="fs-cat"><td colspan="3">${esc(fm.label)} · ${fm.size} pcs/angkatan</td></tr>${pr.rows.filter(r=>r.fam.key===fm.key).map(r=>r.combined?`<tr><td><span class="fs-dot" style="background:#a597c7"></span>Mini campur 3 rasa<small class="fs-prod-sub">${r.per.map(x=>`${esc(core[x.p].label.replace(/^Mini | \(pcs\)$/g,''))} ${nf(x.total)}`).join(' · ')}${r.stock?` · stok ${nf(r.stock)}`:''} · sisa ${nf(r.leftover)} untuk besok</small></td><td>${nf(r.total)}</td><td data-tot>${r.full}</td></tr>`:`<tr><td><span class="fs-dot" style="background:${core[r.p].dot}"></span>${esc(core[r.p].label)}</td><td>${nf(r.total)}</td><td data-tot>${r.rem?`${r.full} <small class="fs-prod-rem">+${r.rem} pcs</small>`:r.full}</td></tr>`).join('')}`).join('')}</tbody></table></div></section>`:'';
  const canShare=!!(navigator.canShare&&navigator.share);
  if(view==='production'){const n=by.size;
   return `<div class="fs-ship-head"><label class="fs-ship-date">Tanggal kiriman<input type="date" id="fs-ship-date" value="${date}"></label><div class="fs-ship-actions">${canShare&&pr?'<button type="button" class="button fp-primary" data-prod-share>Bagikan ke WA</button>':''}${pr?`<button type="button" class="button ${canShare?'':'fp-primary'}" data-prod-download>Unduh gambar</button>`:''}</div></div>
    <p class="fs-ship-sub">${esc(dateLabel(date))} · jumlah angkatan untuk dapur, dihitung dari rencana yang sudah disimpan tim (reguler + pesanan outlet${f?.total?' + pesanan pabrik':''}).</p>
    ${n&&missing.length?`<p class="fs-ship-note"><b>${missing.length} outlet</b> belum punya rencana tersimpan, jadi belum ikut dihitung: ${esc(missing.join(', '))}.</p>`:''}
    <p class="fs-ship-sub fs-ship-status" role="status" ${status?'':'hidden'}>${esc(status)}</p>
    ${pr?`<div class="fs-ship-list">${prodCard}</div>`:`<div class="fp-empty"><h3>Belum ada rencana tersimpan untuk tanggal ini</h3><p>Susun dan simpan di <button type="button" class="fp-link-inline" data-fp-mode="topdown">1 · Buat forecast</button>, lalu rencana produksi muncul di sini.</p></div>`}`;}
  return `<div class="fs-ship-head"><label class="fs-ship-date">Tanggal kiriman<input type="date" id="fs-ship-date" value="${date}"></label><div class="fs-ship-actions">${canShare?'<button type="button" class="button fp-primary" data-ship-share>Bagikan ke WA</button>':''}<button type="button" class="button ${canShare?'':'fp-primary'}" data-ship-download>Unduh gambar</button></div></div>
   <p class="fs-ship-sub">${esc(dateLabel(date))} · dari rencana terakhir forecaster (reguler + pesanan). Ubah persen bila pengiriman pertama tidak 100%.</p>
   ${missing.length?`<p class="fs-ship-note"><b>${missing.length} outlet</b> belum punya rencana tersimpan, kolomnya tampil abu-abu: ${esc(missing.join(', '))}.</p>`:''}
   <p class="fs-ship-sub fs-ship-status" role="status" ${status?'':'hidden'}>${esc(status)}</p>
   <div class="fs-ship-list">${groups.map(table).join('')}${factoryCard}${reqTable}</div>`;
 }
 // ---- Gambar (canvas) ----
 function drawTable({title,accent,soft:headSoft,colLabels,subLabels,sections,showTotal,totalLabel}){
  const F='"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  const LW=232,CW=98,TW=showTotal?88:0,RH=30,CH=26,HH=44,SH=24,PAD=28,HEAD=86,FOOT=40;
  const cols=colLabels.length,bodyH=sections.reduce((a,s)=>a+(s.title?CH:0)+s.rows.length*RH,0);
  const TWD=LW+CW*cols+TW,W=PAD*2+TWD,headH=HH+(subLabels?SH:0),H=PAD+HEAD+headH+bodyH+FOOT;
  const cv=document.createElement('canvas'),scale=2;cv.width=W*scale;cv.height=H*scale;const x=cv.getContext('2d');x.scale(scale,scale);
  const soft=headSoft||tint(accent,.88),ink=shade(accent,.35),totBg=tint(accent,.95);
  const text=(t,tx,ty,{size=13,weight=400,color='#1f2d3a',align='left'}={})=>{x.font=`${weight} ${size}px ${F}`;x.fillStyle=color;x.textAlign=align;x.textBaseline='middle';const ls=String(t).split('\n'),lh=size+3;ls.forEach((l,i)=>x.fillText(l,tx,ty-(ls.length-1)*lh/2+i*lh));};
  const rect=(rx,ry,w,h,c)=>{x.fillStyle=c;x.fillRect(rx,ry,w,h);};
  const hline=(ry,c='#e5e9ee',w=1)=>{x.strokeStyle=c;x.lineWidth=w;x.beginPath();x.moveTo(PAD,ry+.5);x.lineTo(PAD+TWD,ry+.5);x.stroke();};
  rect(0,0,W,H,'#ffffff');rect(0,0,W,6,accent);
  text('OMA OPA CAKERY',PAD,PAD+6,{size:11,weight:700,color:'#8592a0'});
  text(title,PAD,PAD+32,{size:21,weight:700,color:'#1c2b38'});
  text(dateLabel(date),PAD,PAD+58,{size:13,color:'#5f6f7e'});
  let y=PAD+HEAD;const cx=i=>PAD+LW+i*CW+CW/2,tx=PAD+LW+CW*cols+TW/2;
  rect(PAD,y,TWD,headH,soft);
  text('Produk',PAD+14,y+headH/2,{size:12,weight:700,color:ink});
  colLabels.forEach((l,i)=>text(l,cx(i),y+HH/2,{size:12,weight:700,color:ink,align:'center'}));
  if(subLabels)subLabels.forEach((l,i)=>text(l,cx(i),y+HH+SH/2-2,{size:11,color:'#6b7a88',align:'center'}));
  if(showTotal)text(totalLabel||'TOTAL',tx,y+headH/2,{size:12,weight:700,color:ink,align:'center'});
  y+=headH;hline(y-1,accent,2);
  let zebra=0;
  for(const s of sections){
   if(s.title){rect(PAD,y,TWD,CH,'#f1f4f7');text(s.title.toUpperCase(),PAD+14,y+CH/2,{size:10.5,weight:700,color:'#66768a'});y+=CH;hline(y,'#e5e9ee');zebra=0;}
   for(const r of s.rows){
    if(r.bg){rect(PAD,y,TWD,RH,r.bg);if(showTotal)rect(PAD+LW+CW*cols,y,TW,RH,shade(r.bg,.06));zebra++;}
    else{rect(PAD,y,TWD,RH,zebra++%2?'#fafbfc':'#ffffff');if(showTotal)rect(PAD+LW+CW*cols,y,TW,RH,totBg);}
    let lx=PAD+14;if(r.dot&&!r.bg){x.fillStyle=r.dot;x.beginPath();x.arc(lx+4,y+RH/2,4.5,0,Math.PI*2);x.fill();lx+=16;}
    text(r.label,lx,y+RH/2,{size:13,color:'#24323f'});
    const cellTxt=(v,px,bold)=>{if(v==null||v==='')return text(v==null?'—':'',px,y+RH/2,{size:13,color:'#b7c0ca',align:'center'});if(typeof v==='number'||/^\d+$/.test(String(v))){const n=Number(v);return text(nf(n),px,y+RH/2,{size:13,weight:n?700:400,color:n?(bold?ink:'#1c2b38'):'#b7c0ca',align:'center'});}text(v,px,y+RH/2,{size:11.5,color:'#24323f',align:'center'});};
    r.values.forEach((v,i)=>cellTxt(v,cx(i)));
    if(showTotal)cellTxt(r.total,tx,true);
    y+=RH;hline(y);
   }
  }
  x.strokeStyle='#dbe1e7';x.lineWidth=1;x.strokeRect(PAD+.5,PAD+HEAD+.5,TWD-1,y-PAD-HEAD-1);
  x.strokeStyle='#eef1f4';for(let i=0;i<=cols;i++){if(i===0||i===cols&&!showTotal)continue;const vx=PAD+LW+i*CW+.5;x.beginPath();x.moveTo(vx,PAD+HEAD+headH);x.lineTo(vx,y);x.stroke();}
  x.strokeStyle='#dbe1e7';const vx0=PAD+LW+.5;x.beginPath();x.moveTo(vx0,PAD+HEAD);x.lineTo(vx0,y);x.stroke();
  const stamp=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  text(`Dibuat dari Forecast Oma Opa · ${stamp} WIB`,PAD,y+FOOT/2+2,{size:10.5,color:'#97a3ae'});
  return cv;
 }
 function images(view){
  ROWS=buildRows();const by=plans(),groups=groupData(by),out=[];
  if(view==='production'){const pr=production(by);if(pr){const core=PR().core();out.push({name:`Rencana Produksi ${date}.png`,canvas:drawTable({title:'Rencana Produksi (angkatan)',accent:'#3d5566',showTotal:true,totalLabel:'ANGKATAN',colLabels:['Total pcs'],sections:window.ForecastProduction.families().map(fm=>({title:`${fm.label} · ${fm.size} pcs/angkatan`,rows:pr.rows.filter(r=>r.fam.key===fm.key).map(r=>r.combined?{label:`Mini campur 3 rasa (sisa ${r.leftover})`,dot:'#a597c7',values:[r.total],total:String(r.full)}:{label:core[r.p].label,dot:core[r.p].dot,values:[r.total],total:r.rem?`${r.full} +${r.rem}`:String(r.full)})}))})});}return out;}
  for(const g of groups)out.push({name:`Pengiriman ${g.name} ${date}.png`,canvas:drawTable({title:`Pengiriman Pertama · ${g.name}`,accent:g.color,soft:g.soft,showTotal:true,colLabels:g.cols.map(c=>c.label),subLabels:g.cols.map(c=>c.record?c.pct+'%':'belum ada'),
   sections:CATS.map((cat,ci)=>({title:cat,rows:ROWS.map((r,ri)=>[r,ri]).filter(([r])=>r[3]===ci).map(([[label,,dot,,bg],ri])=>({label,dot,bg,values:g.cols.map(c=>c.values[ri]),total:g.totals[ri]}))}))})});
  if(false){const core=PR().core();out.unshift({name:`Rencana Produksi ${date}.png`,canvas:drawTable({title:'Rencana Produksi (angkatan)',accent:'#3d5566',showTotal:true,totalLabel:'ANGKATAN',colLabels:['Total pcs'],sections:window.ForecastProduction.families().map(fm=>({title:`${fm.label} · ${fm.size} pcs/angkatan`,rows:pr.rows.filter(r=>r.fam.key===fm.key).map(r=>r.combined?{label:`Mini campur 3 rasa (sisa ${r.leftover})`,dot:'#a597c7',values:[r.total],total:String(r.full)}:{label:core[r.p].label,dot:core[r.p].dot,values:[r.total],total:r.rem?`${r.full} +${r.rem}`:String(r.full)})}))})});}
  const f=factory();
  if(f&&f.total){const rows=PR().CORE_ORDER.map(p=>PR().core()[p]).filter(c=>f.qty[c.p]>0).map(c=>({label:c.label,dot:c.dot,values:[f.qty[c.p]],total:null}));out.push({name:`Pesanan Pabrik ${date}.png`,canvas:drawTable({title:'Pesanan Pabrik',accent:FACTORY_ACCENT,showTotal:false,colLabels:['Pabrik'],sections:[{rows}]})});}
  const reqs=requests().filter(c=>c.name||c.qty?.some(v=>v!==''&&v!=null));
  if(reqs.length){
   const rows=REQ_ROWS.map(([label],ri)=>{const values=reqs.map(c=>{const v=c.qty?.[ri];return v===''||v==null||Number(v)===0?'':String(Number(v));});return {label,values,total:values.some(v=>v!=='')?values.reduce((a,v)=>a+(Number(v)||0),0):''};});
   out.push({name:`Request tambahan ${date}.png`,canvas:drawTable({title:'Request Tambahan',accent:REQ_ACCENT,showTotal:true,colLabels:reqs.map(c=>wrap(c.name||'-')),
    sections:[{rows},{title:'Pengambilan / pengiriman',rows:[{label:'Waktu',values:reqs.map(c=>c.time||''),total:''},{label:'Cara',values:reqs.map(c=>wrap(c.method||'')),total:''}]}]})});
  }
  return out;
 }
 const wrap=s=>{const w=String(s).split(' ');if(w.length<3)return s;const h=Math.ceil(w.length/2);return w.slice(0,h).join(' ')+'\n'+w.slice(h).join(' ');};
 const toBlob=cv=>new Promise(r=>cv.toBlob(r,'image/png'));
 // Status diperbarui di tempat, tanpa render ulang seluruh halaman (dulu render ulang setelah
 // unduh membuat tabel lebar meloncat ke awal = terlihat berkedip). Semua gambar dibuat dulu,
 // baru diunduh berurutan, supaya tidak ada jeda berat di antara unduhan.
 function say(t){status=t;const el=document.querySelector('.fs-ship-status');if(el){el.textContent=t;el.hidden=!t;}}
 let busy=false;
 async function download(view){
  if(busy)return;busy=true;say('Menyiapkan gambar…');
  try{const imgs=images(view),blobs=[];for(const im of imgs)blobs.push({name:im.name,blob:await toBlob(im.canvas)});
   for(const {name,blob} of blobs){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);await new Promise(r=>setTimeout(r,250));}
   say(`${blobs.length} gambar diunduh: ${blobs.map(b=>b.name.replace(/ \d{4}-\d{2}-\d{2}\.png$/,'')).join(', ')}.`);}
  catch(e){say('Gagal membuat gambar: '+e.message);}
  busy=false;
 }
 async function share(view){
  const imgs=images(view),files=[];for(const im of imgs)files.push(new File([await toBlob(im.canvas)],im.name,{type:'image/png'}));
  try{if(navigator.canShare({files})){await navigator.share({files,title:'Rincian pengiriman '+date});say('Dibagikan.');}else{say('Perangkat ini tidak bisa membagikan gambar langsung; gunakan Unduh gambar.');}}
  catch(e){if(e.name!=='AbortError')say('Gagal membagikan: '+e.message);}
 }
 const rerender=()=>window.dispatchEvent(new Event('forecast-operations-changed'));
 function updateReq(fn){const r=requests();fn(r);save(reqKey(),r);}
 function click(e){
  if(e.target.closest('[data-ship-download]')){download();return false;}
  if(e.target.closest('[data-prod-download]')){download('production');return false;}
  if(e.target.closest('[data-prod-share]')){share('production');return false;}
  if(e.target.closest('[data-ship-share]')){share();return false;}
  if(e.target.closest('[data-req-add]')){updateReq(r=>r.push({name:'',qty:REQ_ROWS.map(()=>''),time:'',method:METHODS[0]}));return true;}
  const rm=e.target.closest('[data-req-remove]');if(rm){updateReq(r=>r.splice(+rm.dataset.reqRemove,1));return true;}
  return false;
 }
 function input(e){
  const t=e.target;
  if(t.dataset.shipPct!==undefined){const P=pcts(),v=Number(t.value);if(Number.isFinite(v)&&v>=0&&v<=100){P[t.dataset.shipPct]=v;save(pctKey(),P);}return false;}
  if(t.dataset.reqName!==undefined){updateReq(r=>{r[+t.dataset.reqName].name=t.value;});return false;}
  if(t.dataset.reqTime!==undefined){updateReq(r=>{r[+t.dataset.reqTime].time=t.value;});return false;}
  if(t.dataset.reqQty!==undefined){const [i,ri]=t.dataset.reqQty.split(':').map(Number);updateReq(r=>{r[i].qty[ri]=t.value;});return false;}
  return null;
 }
 function change(e){
  const t=e.target;
  if(t.id==='fs-ship-date'&&/^\d{4}-\d{2}-\d{2}$/.test(t.value)){date=t.value;status='';return true;}
  if(t.dataset.reqMethod!==undefined){updateReq(r=>{r[+t.dataset.reqMethod].method=t.value;});return false;}
  if(t.dataset.shipPct!==undefined){input(e);return true;}
  const r=input(e);return r===null?false:r;
 }
 // Dipakai menu Rencana produksi (forecast-topdown.js) untuk tanggal yang sedang disusun.
 function exportProduction(d,viaShare){date=d;return viaShare?share('production'):download('production');}
 return {render,click,input,change,groups:GROUPS,exportProduction};
})();
