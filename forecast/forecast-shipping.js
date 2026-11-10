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
 const GROUPS=[
  {name:'Semarang',color:'#c9a6d6',outlets:[['unnes','UNNES'],['sampangan','SAMPANGAN'],['undip','UNDIP'],['udinus','UDINUS'],['unimus','UNIMUS'],['ngaliyan','NGALIYAN'],['gajah-raya','GAJAH RAYA']]},
  {name:'Magelang – Salatiga',color:'#c9a6d6',outlets:[['muntilann','MUNTILAN'],['pemuda-magelang','MAGELANG'],['temanggung','TEMANGGUNG'],['uksw','UKSW'],['ambarawa','AMBARAWA']]},
  {name:'Solo',color:'#a8d5a2',outlets:[['merbabu','MERBABU'],['rajawali','RAJAWALI'],['ums','UMS'],['makamhaji','MAKAMHAJI'],['laweyan','LAWEYAN'],['sukoharjo','SUKOHARJO'],['nusukan','NUSUKAN'],['uns','JEBRES'],['sragen','SRAGEN'],['karanganyar','KARANGANYAR'],['boyolali','BOYOLALI']]},
  {name:'Jogja',color:'#5ee0e6',outlets:[['nusa-indah','NUSA INDAH'],['umy','UMY'],['jakal-uii','JAKAL'],['tajem','TAJEM'],['godean','GODEAN']]},
 ];
 // [label di gambar, sumber: indeks SKU inti atau nama produk lain, warna baris]
 const ROWS=[
  ['Ogura Cheese',0,'#ffffff'],['Ogura Chocolate',1,'#ffffff'],['Malmil Cheese',2,'#ffffff'],['Malmil Choco',3,'#ffffff'],
  ['Mini Cheese (pcs)',4,'#ffff00'],['Mini Choco (pcs)',5,'#f6a04d'],['Mini Durian (pcs)',6,'#22e83a'],['BOX MINI','Box Mini','#d9d2e9'],
  ['Chiffon Classic Keju',7,'#fde9d9'],['Chiffon Classic Ekstra Keju',8,'#fde9d9'],['Chiffon Lite Keju',11,'#c6d9f1'],['Chiffon Lite Ekstra Keju',10,'#c6d9f1'],
  ['Chiffon Butter',9,'#fbc96b'],['Chiffon Kurma','Chiffon Kurma','#e9935a'],['Roti Manis Sosis','Roti Sosis','#f4c7c3'],['Roti Manis Abon','Roti Abon','#6d9eeb'],
  ['Roti Manis Coklat Meses','Roti Coklat','#c5e0b4'],['WHIP','Whip','#f4b183'],
 ];
 const REQ_ROWS=[['Ogura Cheese'],['Ogura Chocolate'],['Malmil Cheese'],['Malmil Choco'],['Mini pcs cheese'],['Mini pcs choco'],['Mini pcs durian'],['Chiffon Keju'],['Chiffon Ekstra Keju'],['Chiffon Lite Keju'],['Chiffon Lite Ekstra Keju'],['Chiffon Butter'],['Roti Manis Sosis'],['Roti Manis Abon'],['Roti Manis Coklat']];
 const METHODS=['Diambil ke Pabrik','Diantar oleh Driver'];
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
  else{const it=(p.customItems||[]).find(x=>String(x.name).trim().toLowerCase()===src.toLowerCase());v=it?(it.regular||0)+(it.orders||0):0;}
  return Math.round(v*pct/100);
 }
 function groupData(by){
  const P=pcts();
  return GROUPS.map(g=>({...g,cols:g.outlets.map(([id,label])=>{const r=by.get(id),pct=Number.isFinite(P[id])?P[id]:100;return {id,label,pct,record:r,values:ROWS.map(([,src])=>qty(r,src,pct))};})}));
 }
 function render(){
  if(!date)date=shift(today(),1);
  const by=plans(),groups=groupData(by),missing=groups.flatMap(g=>g.cols.filter(c=>!c.record).map(c=>c.label)),reqs=requests();
  const table=g=>`<div class="fs-ship-wrap"><table class="fs-ship"><thead><tr><th class="fs-ship-corner" rowspan="2">Pengiriman Pertama</th>${g.cols.map(c=>`<th class="${c.record?'':'fs-ship-missing'}" style="background:${g.color}">${esc(c.label)}</th>`).join('')}</tr><tr>${g.cols.map(c=>`<th class="fs-ship-pct"><input type="number" min="0" max="100" step="5" value="${c.pct}" data-ship-pct="${esc(c.id)}" aria-label="Persen pengiriman pertama ${esc(c.label)}">%</th>`).join('')}</tr></thead><tbody>${ROWS.map(([label,,color],ri)=>`<tr style="background:${color}"><td>${esc(label)}</td>${g.cols.map(c=>`<td>${c.values[ri]==null?'—':c.values[ri]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const reqTable=`<div class="fs-ship-wrap"><table class="fs-ship fs-req"><thead><tr><th class="fs-ship-corner">Request tambahan</th>${reqs.map((c,i)=>`<th><input type="text" maxlength="40" value="${esc(c.name)}" data-req-name="${i}" placeholder="Nama peminta" aria-label="Nama peminta"><button type="button" class="fs-req-remove" data-req-remove="${i}" aria-label="Hapus kolom">×</button></th>`).join('')}<th><button type="button" class="button" data-req-add>+ Kolom</button></th></tr></thead><tbody>${REQ_ROWS.map(([label],ri)=>`<tr><td>${esc(label)}</td>${reqs.map((c,i)=>`<td><input type="number" min="0" max="10000" step="1" value="${c.qty?.[ri]??''}" data-req-qty="${i}:${ri}" aria-label="${esc(label)}"></td>`).join('')}<td></td></tr>`).join('')}<tr class="fs-req-meta"><td>Waktu pengambilan/pengiriman</td>${reqs.map((c,i)=>`<td><input type="text" maxlength="30" value="${esc(c.time||'')}" data-req-time="${i}" placeholder="Pukul 09.30"></td>`).join('')}<td></td></tr><tr class="fs-req-meta"><td>Pengambilan/pengiriman</td>${reqs.map((c,i)=>`<td><select data-req-method="${i}">${METHODS.map(m=>`<option ${c.method===m?'selected':''}>${m}</option>`).join('')}</select></td>`).join('')}<td></td></tr></tbody></table></div>`;
  const canShare=!!(navigator.canShare&&navigator.share);
  return `<div class="fs-ship-head"><label>Tanggal kiriman<input type="date" id="fs-ship-date" value="${date}"></label><div class="fs-ship-actions">${canShare?'<button type="button" class="button fp-primary" data-ship-share>Bagikan ke WA</button>':''}<button type="button" class="button ${canShare?'':'fp-primary'}" data-ship-download>Unduh gambar</button></div></div>
   <p class="fp-caption">${dateLabel(date)} · dari rencana terakhir yang disimpan forecaster (reguler + pesanan). Ubah persen kalau pengiriman pertama tidak 100%.</p>
   ${missing.length?`<p class="fp-alert">Belum ada rencana tersimpan untuk: ${esc(missing.join(', '))}. Kolomnya tampil "—".</p>`:''}
   ${status?`<p class="fp-caption" role="status">${esc(status)}</p>`:''}
   ${groups.map(g=>`<h3 class="fs-ship-title">${esc(g.name)}</h3>${table(g)}`).join('')}
   <h3 class="fs-ship-title">Request tambahan (manajemen sebelah)</h3><p class="fp-caption">Tersimpan di perangkat ini untuk tanggal yang dipilih. Ikut menjadi gambar tersendiri kalau ada kolomnya.</p>${reqTable}`;
 }
 // ---- Gambar (canvas) ----
 function drawTable({title,headerColor,colLabels,subLabels,rows,corner}){
  const LW=230,CW=118,RH=26,HH=44,SH=24,PAD=16,TH=34;
  const cols=colLabels.length,W=PAD*2+LW+CW*cols,H=PAD*2+TH+HH+(subLabels?SH:0)+RH*rows.length;
  const cv=document.createElement('canvas'),scale=2;cv.width=W*scale;cv.height=H*scale;const x=cv.getContext('2d');x.scale(scale,scale);
  x.fillStyle='#fff';x.fillRect(0,0,W,H);
  x.fillStyle='#1f3a4d';x.font='bold 15px Arial';x.textBaseline='middle';x.fillText(title,PAD,PAD+TH/2-4);
  let y=PAD+TH;const left=PAD;
  const cell=(cx,cy,w,h,fill,text,opt={})=>{x.fillStyle=fill;x.fillRect(cx,cy,w,h);x.strokeStyle='#333';x.lineWidth=1;x.strokeRect(cx+.5,cy+.5,w,h);if(text==null)return;x.fillStyle=opt.color||'#000';x.font=`${opt.bold?'bold ':''}${opt.italic?'italic ':''}${opt.size||12}px Arial`;x.textAlign=opt.align||'center';
   const lines=String(text).split('\n'),lh=(opt.size||12)+3,ty=cy+h/2-(lines.length-1)*lh/2;lines.forEach((l,i)=>x.fillText(l,opt.align==='left'?cx+8:cx+w/2,ty+i*lh));x.textAlign='left';};
  cell(left,y,LW,HH+(subLabels?SH:0),'#f4cccc',corner,{bold:true,size:13});
  colLabels.forEach((l,i)=>cell(left+LW+i*CW,y,CW,HH,headerColor,l,{bold:true,size:12}));
  if(subLabels)subLabels.forEach((l,i)=>cell(left+LW+i*CW,y+HH,CW,SH,'#fff',l,{bold:true,italic:true,size:11}));
  y+=HH+(subLabels?SH:0);
  for(const r of rows){cell(left,y,LW,RH,r.color||'#fff',r.label,{bold:true,align:'left',size:12});r.values.forEach((v,i)=>cell(left+LW+i*CW,y,CW,RH,r.color||'#fff',v==null?'—':String(v),{bold:true,size:12}));y+=RH;}
  return cv;
 }
 function images(){
  const by=plans(),groups=groupData(by),out=[],dl=dateLabel(date);
  for(const g of groups)out.push({name:`Pengiriman ${g.name} ${date}.png`,canvas:drawTable({title:`Pengiriman Pertama · ${g.name} · ${dl}`,headerColor:g.color,corner:'Pengiriman\nPertama',colLabels:g.cols.map(c=>c.label),subLabels:g.cols.map(c=>c.pct+'%'),rows:ROWS.map(([label,,color],ri)=>({label,color,values:g.cols.map(c=>c.values[ri])}))})});
  const reqs=requests().filter(c=>c.name||c.qty?.some(v=>v!==''&&v!=null));
  if(reqs.length){
   const rows=REQ_ROWS.map(([label],ri)=>({label,values:reqs.map(c=>{const v=c.qty?.[ri];return v===''||v==null||Number(v)===0?'':String(v);})}));
   rows.push({label:'Waktu pengambilan/\npengiriman',color:'#e3e1f2',values:reqs.map(c=>c.time||'')});
   rows.push({label:'Pengambilan/pengiriman',color:'#e3e1f2',values:reqs.map(c=>wrap(c.method||''))});
   out.push({name:`Request tambahan ${date}.png`,canvas:drawTable({title:`Request Tambahan · ${dl}`,headerColor:'#e3e1f2',corner:'REQUEST TAMBAHAN',colLabels:reqs.map(c=>wrap(c.name||'-')),rows})});
  }
  return out;
 }
 const wrap=s=>{const w=String(s).split(' ');if(w.length<3)return s;const h=Math.ceil(w.length/2);return w.slice(0,h).join(' ')+'\n'+w.slice(h).join(' ');};
 const toBlob=cv=>new Promise(r=>cv.toBlob(r,'image/png'));
 async function download(){
  const imgs=images();
  for(const im of imgs){const b=await toBlob(im.canvas),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=im.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);await new Promise(r=>setTimeout(r,300));}
  status=`${imgs.length} gambar diunduh.`;rerender();
 }
 async function share(){
  const imgs=images(),files=[];for(const im of imgs)files.push(new File([await toBlob(im.canvas)],im.name,{type:'image/png'}));
  try{if(navigator.canShare({files})){await navigator.share({files,title:'Rincian pengiriman '+date});status='Dibagikan.';}else{status='Perangkat ini tidak bisa membagikan gambar langsung; gunakan Unduh gambar.';}}
  catch(e){if(e.name!=='AbortError')status='Gagal membagikan: '+e.message;}
  rerender();
 }
 const rerender=()=>window.dispatchEvent(new Event('forecast-operations-changed'));
 function updateReq(fn){const r=requests();fn(r);save(reqKey(),r);}
 function click(e){
  if(e.target.closest('[data-ship-download]')){download();return false;}
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
 return {render,click,input,change};
})();
