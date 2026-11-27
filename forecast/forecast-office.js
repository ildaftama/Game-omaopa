// Kantor Mini (owner 2026-11-23): hiburan forecaster yang memvisualkan proses harian dari data yang sudah ada.
// Nama staf dan jadwal datang dari dokumen privat, tidak ditulis di file publik ini.
window.ForecastOffice=(()=>{
'use strict';
const TEMPLATE='<div class="kt-top"><span><b id="kt-clock">--.--</b> WIB · <span id="kt-phase"></span></span></div><div class="kt-layout"><div><div class="kt-stage"><canvas id="kt-game" width="1984" height="1088" tabindex="0" aria-label="Kantor Agen AI. Klik karakter untuk menghampiri dan mengobrol, klik lantai untuk menggerakkan forecaster, klik mesin kopi, snack, kulkas, sofa, atau toilet untuk beraktivitas."></canvas></div><div class="kt-dock" id="kt-dock" aria-label="Aksi forecaster"></div><p class="kt-hint" id="kt-dockHint"></p><details class="kt-guide" id="kt-guide"><summary>🎮 Cara menggerakkan karakter</summary><div class="kt-guide-b"><p id="kt-guide-who"></p><ol><li><b>Pilih karaktermu</b>: klik karakternya di kantor atau namanya di daftar <i>Tim kantor</i>.</li><li><b>Jalan</b>: klik lantai tujuan. Bisa juga klik area kantor sekali, lalu pakai tombol panah atau W A S D.</li><li><b>Aktivitas</b>: klik mesin kopi, rak snack, kulkas atau meja makan, sofa, toilet, atau meja kerja. Tombol aksi di bawah kantor juga bisa dipakai.</li><li><b>Ngobrol</b>: klik karakter lain, karaktermu akan menghampiri dan menyapa.</li></ol><p class="kt-guide-note">Saat diarahkan, muncul segitiga kuning di atas kepala dan gerakannya terlihat di layar semua orang. Kalau ±25 detik tidak diarahkan, karakter kembali beraktivitas sendiri. Pukul 22.00–07.00 kantor tidur, karakter tidak bisa digerakkan.</p></div></details></div><aside><section class="kt-card"><h2>Tim kantor</h2><div class="kt-roster" id="kt-roster"></div></section><section class="kt-card"><h2>Kondisi hari ini</h2><div class="stats" id="kt-stats"></div></section></aside></div>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api=null;
function boot(){
const root=document.createElement('div');root.className='kantor';root.innerHTML=TEMPLATE;
const $=id=>root.querySelector('#kt-'+id),view=$('game'),out=view.getContext('2d');
// OX: ruang manajer di kiri (owner 2026-11-24). Dunia lama tetap x 0..25, ruang baru x -5..-1.
const T=16,COLS=26,ROWS=17,OX=5,VW=COLS*T,VWT=(COLS+OX)*T,VH=ROWS*T,Z=view.width/VWT;
const low=document.createElement('canvas');low.width=VWT*2;low.height=VH*2;const lc=low.getContext('2d');lc.setTransform(2,0,0,2,0,0);
const bgC=document.createElement('canvas');bgC.width=VWT*2;bgC.height=VH*2;bgC.getContext('2d').setTransform(2,0,0,2,0,0);let c=lc;
const OL='#3a2d3f';
const half=v=>Math.round(v*2)/2,R=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(half(x),half(y),half(w),half(h));};
const box=(x,y,w,h,f,o=OL)=>{R(x,y,w,h,o);R(x+1,y+1,w-2,h-2,f);};
const ell=(cx,cy,rx,ry,col,top=false)=>{cx=Math.round(cx);cy=Math.round(cy);for(let d=-ry;d<=(top?0:ry);d++){const w=Math.round(rx*Math.sqrt(Math.max(0,1-d*d/((ry+.4)*(ry+.4)))));R(cx-w,cy+d,w*2+1,1,col);}};
const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)],key=(x,y)=>x+','+y,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);};

const S={hour:null,weather:'cerah',waste:'aman',lost:'aman',t:0,step:-1,stepP:0,pulled:0,lastPull:null,chart:0,radar:0,calc:0,filled:0,audit:0,kick:false,printing:0,flag:[],wcQ:[],sel:'f1',date:null,realCd:7,weatherTomorrow:null,wasteTrend:'stabil',lostTrend:'stabil',flagNames:[],wasteOutlets:[],lostOutlets:[],modelReady:false,statusReady:false,brew:0,micro:0,chatCd:0,trayP:0,trayF:0};

// ===== Denah =====
const blocked=new Set();
const B=(x1,y1,x2,y2)=>{for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)blocked.add(key(x,y));};
const V=(x,a,b,doors=[])=>{for(let y=a;y<=b;y++)if(!doors.includes(y))blocked.add(key(x,y));};
B(0,0,25,2);B(0,0,0,16);B(25,0,25,16);B(0,16,25,16);V(17,3,15,[5,6,12,13]);B(18,9,24,9);V(21,10,15,[13]);
B(1,3,3,3);B(2,6,4,7);B(6,6,8,7);B(10,6,12,7);B(14,6,16,7);B(6,12,11,13);B(13,12,14,13);B(1,15,1,15);B(16,15,16,15);B(1,11,2,12);
B(18,3,24,4);B(20,7,21,8);B(18,10,20,11);B(19,14,19,14);B(18,15,18,15);B(22,10,22,10);B(24,10,24,10);
B(-OX,0,-1,2);B(-OX,0,-OX,16);B(-OX,16,-1,16);B(-4,4,-2,5);B(-4,10,-2,11);blocked.delete(key(0,9));blocked.delete(key(0,10));
const SPOT={kopi:[[19,5]],snack:[[21,5]],kulkas:[[23,5]],eat:[[19,7],[22,7]],sofa:[[18,12],[20,12]],toilet:[[23,11]]};
const PLACE={rack:[2,4],white:[7,4],board:[11,4],radar:[15,4],printer:[13,14],toPred:[9,8],toFc:[12,14],toWatch:[13,8]};
function route(a,b){const st=key(a[0],a[1]),go=key(b[0],b[1]);if(st===go)return [];const q=[[a[0],a[1]]],prev=new Map([[st,null]]);for(let i=0;i<q.length;i++){const [x,y]=q[i];if(key(x,y)===go)break;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=key(nx,ny);if(nx<-OX||ny<0||nx>=COLS||ny>=ROWS||blocked.has(k)||prev.has(k))continue;prev.set(k,[x,y]);q.push([nx,ny]);}}if(!prev.has(go))return [];const p=[];let cur=[b[0],b[1]];while(key(cur[0],cur[1])!==st){p.unshift(cur);cur=prev.get(key(cur[0],cur[1]));}return p;}
function nearestFree(x,y){if(!blocked.has(key(x,y)))return [x,y];const seen=new Set([key(x,y)]),q=[[x,y]];for(let i=0;i<q.length;i++)for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){const nx=q[i][0]+dx,ny=q[i][1]+dy,k=key(nx,ny);if(nx<1-OX||ny<3||nx>=COLS-1||ny>=ROWS-1||seen.has(k))continue;if(!blocked.has(k))return [nx,ny];seen.add(k);q.push([nx,ny]);}return [x,y];}

// ===== Latar =====
// Ruang manajer di sisi kiri (owner 2026-11-24): meja Factory Manager & SPV Logistik.
function leftRoom(){
 const x0=-OX*T,w=OX*T;
 for(let y=3;y<ROWS;y++)for(let x=-OX;x<0;x++){const px=x*T,py=y*T,h=hash(x+40,y);R(px,py,T,T,(x+y)%2?'#e4e9f1':'#dbe2ec');R(px,py,T,1,'rgba(150,165,190,.35)');R(px,py,1,T,'rgba(150,165,190,.35)');if(h>.8)R(px+h*10,py+h*8,2,1,'#cdd6e3');}
 R(x0,0,w,48,'#f3ecf6');for(let x=x0;x<0;x+=8)for(let y=4;y<30;y+=8)if((x+y)%16===4)R(x,y,1,1,'#e3d6ea');R(x0,30,w,16,'#b9c8e6');for(let x=x0;x<0;x+=8)R(x,30,1,16,'#a4b6dc');R(x0,29,w,2,'#fbf7fd');R(x0,45,w,3,'#6e7fae');R(x0,48,w,2,'rgba(58,45,63,.18)');
 R(x0,0,w,3,OL);R(x0,0,T-6,VH,OL);R(x0,VH-T+6,w,T,OL);
 box(x0+20,8,34,14,'#fffaf2');R(x0+24,12,26,2,'#6e7fae');R(x0+24,16,18,2,'#b9c8e6');
 box(x0+60,7,14,14,'#fff');R(x0+66,10,1,5,OL);R(x0+66,14,4,1,OL);
}
function buildBG(){
 c=bgC.getContext('2d');c.save();c.translate(OX*T,0);leftRoom();
 for(let y=3;y<ROWS;y++)for(let x=0;x<COLS;x++){const px=x*T,py=y*T,h=hash(x,y);
  if(x>17&&y<9){R(px,py,T,T,(x+y)%2?'#fff3e4':'#fbd9cf');R(px,py,T,1,'rgba(205,150,140,.3)');R(px,py,1,T,'rgba(205,150,140,.3)');}
  else if(x>21&&y>9){R(px,py,T,T,(x+y)%2?'#d4f0ea':'#bde6de');R(px,py,T,1,'#a5d7cd');R(px,py,1,T,'#a5d7cd');}
  else if(x>17&&y>9){R(px,py,T,T,(x+y)%2?'#ddd1f2':'#d3c5ec');if(h>.55)R(px+h*12,py+h*9,2,1,'#c6b6e3');}
  else{R(px,py,T,T,['#efd3ad','#ebcda6','#f1d6b3','#e8c9a0'][Math.floor(h*4)]);R(px,py+7,T,1,'#dcb98e');R(px,py+15,T,1,'#dcb98e');R(px+(y%2?4:11),py,1,7,'#dcb98e');R(px+(y%2?12:3),py+8,1,7,'#dcb98e');}
 }
 // dinding belakang
 R(0,0,VW,48,'#fff1dc');for(let x=0;x<VW;x+=8)for(let y=4;y<30;y+=8)if((x+y)%16===4)R(x,y,1,1,'#f4d8b5');R(0,30,VW,16,'#9fdccb');for(let x=0;x<VW;x+=8)R(x,30,1,16,'#86cbb8');R(0,29,VW,2,'#fff8ec');R(0,45,VW,3,'#5f9f90');R(0,48,VW,2,'rgba(58,45,63,.18)');
 R(0,0,VW,3,OL);R(0,0,T-6,VH,OL);R(VW-T+6,0,T,VH,OL);R(0,VH-T+6,VW,T,OL);
 // karpet forecast
 const rug=(x,y,w,h,a,b,e)=>{box(x,y,w,h,a);for(let i=x+3;i<x+w-3;i+=6)for(let j=y+3;j<y+h-3;j+=6)if((i+j)%12<6)R(i,j,3,3,b);c.strokeStyle=e;c.lineWidth=1;c.strokeRect(x+2.5,y+2.5,w-5,h-5);};
 rug(5*T,11*T+6,8*T,5*T-4,'#ffc9d6','#ffb7c8','#fff');rug(18*T+4,12*T+6,44,46,'#f7e29a','#f1d67c','#fff');
 // dinding dalam
 const wallV=(x,a,b,doors)=>{for(let y=a;y<=b;y++){if(doors.includes(y)){R(x*T,y*T,T,T,'#d6b48a');R(x*T,y*T,T,1,'#b89268');continue;}R(x*T+3,y*T,10,T,OL);R(x*T+4,y*T,8,T,'#fff1dc');R(x*T+4,y*T,2,T,'#fff8ec');R(x*T+10,y*T,2,T,'#e9d3b5');}};
 wallV(17,3,15,[5,6,12,13]);wallV(21,10,15,[13]);
 for(let x=18;x<=24;x++){R(x*T,9*T,T,16,OL);R(x*T,9*T+1,T,9,'#fff1dc');R(x*T,9*T+10,T,5,'#9fdccb');R(x*T,9*T+14,T,1,'#5f9f90');}
 // dekor
 const frame=(x,y,w,h,f)=>{box(x,y,w,h,'#fff');f(x+2,y+2,w-4,h-4);};
 frame(88,6,16,20,(x,y,w,h)=>{R(x,y,w,h,'#ffc2d1');ell(x+6,y+8,4,4,'#e8799a');R(x+1,y+h-3,w-2,1,'#fff');});
 frame(282,6,18,20,(x,y,w,h)=>{R(x,y,w,h,'#bfe6ff');ell(x+7,y+6,3,3,'#ffe27a');R(x,y+h-5,w,5,'#79c98f');});
 R(3*T+12,16*T-2,24,12,'#a97f5a');R(3*T+13,16*T-1,22,11,'#c79d72');R(3*T+24,16*T-1,1,11,'#8f6a4a');box(3*T+10,15*T+8,28,7,'#8f6f52');R(3*T+13,15*T+10,22,1,'#b08f6e');R(3*T+13,15*T+12,22,1,'#b08f6e');
 // pintu ke ruang manajer
 for(const y of [9,10]){R(0,y*T,T-6,T,'#d6b48a');R(0,y*T,T-6,1,'#b89268');}R(0,9*T-1,T-6,1,OL);R(0,11*T,T-6,1,OL);
 c.restore();c=lc;
}

// ===== Benda dinamis =====
function sky(){const h=hourNow();if(h<5||h>=19)return ['#1a2356','#39377a'];if(h<7)return ['#6b70b8','#ffb99e'];if(h>=16.5)return ['#f58f75','#ffd59a'];return S.weather==='cerah'?['#8fd8f7','#dff5fb']:['#9aa7b8','#cdd5dc'];}
function windowP(x,y,w,h){
 const [a,b]=sky();box(x-2,y-2,w+4,h+4,'#fff');const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(x,y,w,h);const t=hourNow();
 if(t<5||t>=19){for(let i=0;i<8;i++)R(x+(i*13+3)%w,y+(i*7+2)%(h-3),1,1,Math.sin(S.t*2+i)>0?'#fff':'#a8a8e8');ell(x+w-9,y+7,3,3,'#fdf0b8');}
 else if(S.weather==='cerah')ell(x+w-10,y+8,4,4,'#ffe27a');
 else{ell(x+11,y+9,5,3,'#fff');ell(x+18,y+7,6,4,'#fff');ell(x+26,y+10,4,2,'#fff');}
 if(S.weather==='hujan')for(let i=0;i<12;i++)R(x+(i*7)%w,y+((S.t*80+i*13)%(h-3)),1,3,'#e4f4ff');
 R(x+w/2,y,1,h,'#fff');R(x-5,y-3,6,h+7,'#ffc2d1');R(x+w-1,y-3,6,h+7,'#ffc2d1');for(let i=0;i<h;i+=3){R(x-3,y+i,1,2,'#f29db7');R(x+w+2,y+i,1,2,'#f29db7');}R(x-6,y-4,w+12,2,'#a47854');
}
function fairy(){const cols=['#ff8fab','#ffd166','#7bdff2','#b8f28d','#cdb4f6'],n=26;for(let i=0;i<n;i++){const x=16+i*(VW-32)/(n-1),y=7+Math.abs(Math.sin(i*.62))*5;R(x,y-2,1,2,'#7d6a70');const on=Math.sin(S.t*2+i*1.3)>-.4;R(x-1,y,3,3,on?cols[i%5]:'#e7d9cd');}}
function rack(){for(let i=0;i<3;i++){const x=16+i*16;box(x,6,16,56,'#4a4158');for(let r=0;r<7;r++){const ry=10+r*7;R(x+2,ry,12,5,'#2d2636');const n=i*7+r,on=n<S.pulled*21/28;R(x+3,ry+1,2,2,on?(Math.sin(S.t*14+n)>-.2?'#6ff5ac':'#2a8f5c'):'#5d5270');R(x+6,ry+1,2,2,Math.sin(S.t*9+n*2)>.2?'#7bdff2':'#35566b');R(x+9,ry+2,4,1,'#6a5e7d');}}if(S.pulling)for(let i=0;i<4;i++){const p=(S.t*.9+i/4)%1;R(36+p*20,66+p*24,2,2,'#6ff5ac');}}
function whiteboard(){const x=82,y=7,w=64,h=34;box(x,y,w,h,'#fffef8','#8f7d92');R(x+3,y+h,w-6,2,'#8f7d92');R(x+6,y+h,4,1,'#e8799a');R(x+14,y+h,4,1,'#58b8a4');const pts=[.25,.42,.33,.6,.5,.72,.62,.85],n=Math.floor(S.chart*(pts.length-1));c.strokeStyle='#e8799a';c.lineWidth=1;c.beginPath();for(let i=0;i<=n;i++){const px=x+6+i*(w-12)/(pts.length-1),py=y+h-6-pts[i]*(h-12);i?c.lineTo(px+.5,py+.5):c.moveTo(px+.5,py+.5);}c.stroke();for(let i=0;i<=n;i++){const px=x+6+i*(w-12)/(pts.length-1),py=y+h-6-pts[i]*(h-12);R(px-1,py-1,3,3,'#5a8fe0');}R(x+4,y+h-5,w-8,1,'#cbbfce');for(let i=0;i<Math.floor(S.chart*3);i++)R(x+5,y+4+i*3,8+i*3,1,'#58b8a4');}
const status=i=>{const l=watchLevel();if(!l)return 'ok';if(S.flag.includes(i))return l===2?'hot':'mid';return 'ok';};
function board(){const x=155,y=7,w=64,h=34;box(x,y,w,h,'#2d2636');for(let i=0;i<28;i++){const cx=x+4+(i%7)*8,cy=y+4+Math.floor(i/7)*7;let col='#4c5a58';if(S.audit*28>i||S.auditDone)col=status(i)==='hot'?(Math.sin(S.t*7)>0?'#ff6b61':'#8c3a35'):status(i)==='mid'?'#ffc14d':'#6ff5ac';else if(S.pulled>i)col='#3a9c70';R(cx,cy,6,5,col);R(cx,cy,6,1,'rgba(255,255,255,.25)');}if(S.auditing){const i=clamp(Math.floor(S.audit*28),0,27),cx=x+3+(i%7)*8,cy=y+3+Math.floor(i/7)*7;c.strokeStyle='#fff';c.lineWidth=1;c.strokeRect(cx+.5,cy+.5,7,6);}}
function radar(){const x=228,y=7,w=44,h=34;box(x,y,w,h,'#123c3b');const cx=x+15,cy=y+17,r=13;c.strokeStyle='#2d8a78';c.lineWidth=1;for(const k of [.45,1]){c.beginPath();c.arc(cx,cy,r*k,0,7);c.stroke();}R(cx-r,cy,r*2,1,'#2d8a78');R(cx,cy-r,1,r*2,'#2d8a78');const a=S.t*2.2;c.strokeStyle='#8affdb';c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.stroke();const bl=S.weather==='hujan'?9:S.weather==='mendung'?4:1;for(let i=0;i<bl;i++){const q=i*2.3,d=3+i*1.1;R(cx+Math.cos(q)*d,cy+Math.sin(q)*d,3,2,S.weather==='hujan'?'#ff8177':'#ffe27a');}R(x+31,y+5,10,9,S.weather==='hujan'?'#42658a':S.weather==='mendung'?'#73808a':'#4ba6dc');if(S.weather==='cerah')ell(x+36,y+9,2,2,'#ffe27a');else R(x+33,y+8,7,3,'#fff');R(x+31,y+18,10,2,'#2d8a78');R(x+31,y+18,10*S.radar,2,'#8affdb');}
function monitor(x,y,w,h,draw){box(x,y,w,h,'#2d2636');c.save();c.beginPath();c.rect(x+1,y+1,w-2,h-2);c.clip();draw(x+1,y+1,w-2,h-2);c.restore();R(x+w/2-2,y+h,4,2,'#6a5e7d');R(x+w/2-5,y+h+2,10,1,OL);}
const scrEsb=(x,y,w,h)=>{R(x,y,w,h,'#1a2740');for(let i=0;i<4;i++){const n=(Math.floor(S.t*(S.pulling?8:1))+i*3)%6;R(x+2,y+2+i*3,4+n*2,1,i%2?'#6ff5ac':'#7bdff2');}R(x+1,y+h-2,(w-2)*S.pulled/28,1,'#6ff5ac');};
const scrPred=(x,y,w,h)=>{R(x,y,w,h,'#2a2350');[.4,.6,.5,.8,.7,.95].forEach((b,i)=>{const k=S.calcing?clamp(S.calc*6-i,0,1):S.calc>=1?1:.25;R(x+2+i*4,y+h-2-b*(h-4)*k,3,b*(h-4)*k,i===5?'#ffc14d':'#b49cff');});};
const scrW=(x,y,w,h)=>{R(x,y,w,h,S.weather==='hujan'?'#32506e':'#4ba6dc');if(S.weather==='cerah')ell(x+w/2,y+6,3,3,'#ffe27a');else{R(x+4,y+5,w-8,4,'#fff');if(S.weather==='hujan')for(let i=0;i<4;i++)R(x+5+i*4,y+10+((S.t*8+i)%3),1,2,'#bfe8ff');}};
const scrWatch=(x,y,w,h)=>{R(x,y,w,h,'#231d2c');const l=watchLevel(),col=l===2?'#ff6b61':l===1?'#ffc14d':'#6ff5ac';c.strokeStyle=col;c.lineWidth=1;c.beginPath();for(let i=0;i<w;i++){const v=y+h/2+Math.sin(i*.8+S.t*3)*(l+1)*1.5;i?c.lineTo(x+i,v):c.moveTo(x+i,v);}c.stroke();};
function scrGrid(x,y,w,h,done=0){R(x,y,w,h,'#fffdf8');R(x,y,w,3,'#e8799a');const cw=4,ch=2,cols=Math.floor((w-1)/cw),rows=Math.floor((h-4)/(ch+1));for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){const idx=(r*cols+k)/(rows*cols);R(x+1+k*cw,y+4+r*(ch+1),cw-1,ch,idx<done?(k===cols-1?'#ffc14d':'#58b8a4'):'#e9dfd5');}}
const scrSide=(x,y,w,h)=>{R(x,y,w,h,'#2a2350');c.strokeStyle='#ffc14d';c.lineWidth=1;c.beginPath();for(let i=0;i<w;i++){const v=y+h-3-(Math.sin(i*.5)+1)*2-i*.25;i?c.lineTo(x+i,v):c.moveTo(x+i,v);}c.stroke();};
function desk(x,y,w,col='#f5d6a8'){R(x,y,w,23,OL);R(x+1,y+1,w-2,14,col);R(x+1,y+1,w-2,1,'#fff0d4');R(x+1,y+15,w-2,7,'#d9a875');R(x+4,y+17,w-8,1,'#c4935f');R(x+3,y+23,3,3,OL);R(x+w-6,y+23,3,3,OL);R(x+2,y+26,w-4,1,'rgba(58,45,63,.18)');}
const kb=(x,y)=>{box(x,y,14,5,'#fff');R(x+2,y+2,10,1,'#d0c8d6');};
const mug=(x,y,col='#fff')=>{box(x,y,5,5,col);R(x+1,y+1,3,1,'#7a4f36');R(x+5,y+1,1,2,OL);};
const sprout=(x,y)=>{box(x,y+5,7,6,'#ffb7a1');R(x+3,y+1,1,4,'#4f9b6c');ell(x+1,y+2,1,1,'#7ad192');ell(x+5,y+1,1,1,'#7ad192');};
function papers(x,y,n){for(let i=0;i<Math.min(n,5);i++){box(x,y-i,10,7,'#fffef8');R(x+2,y-i+3,6,1,'#c9bfd0');}}
function plant(x,y,big=false){box(x+3,y+8,10,8,'#ffb7a1');R(x+4,y+9,8,2,'#ffd2c2');R(x+7,y+1,2,8,'#4f9b6c');const l=big?[[1,2,6],[9,0,6],[0,6,6],[10,5,6],[5,-3,6]]:[[2,2,5],[9,1,5],[5,-2,5]];for(const [a,b,w] of l){box(x+a,y+b,w,5,'#7ad192','#3f7d58');R(x+a+1,y+b+1,w-3,1,'#a8ecb8');}}

const PROPS=[
 {y:5*T+11,d(){desk(-4*T,4*T+4,48,'#d9dde6');monitor(-4*T+7,3*T+6,26,16,(x,y,w,h)=>{R(x,y,w,h,'#22324a');for(let i=0;i<5;i++){const v=(Math.sin(S.t*.7+i)*.5+.5)*.7+.2;R(x+2+i*4.5,y+h-2-v*(h-5),3,v*(h-5),i===4?'#ffd166':'#7fb3ff');}});kb(-4*T+14,5*T+6);papers(-2*T+3,5*T+9,2);}},
 {y:11*T+11,d(){desk(-4*T,10*T+4,48,'#dfe9f7');monitor(-4*T+7,9*T+6,26,16,(x,y,w,h)=>{R(x,y,w,h,'#f4f8ff');c.strokeStyle='#4f8fd9';c.lineWidth=1;c.beginPath();c.moveTo(x+3,y+h-4);c.lineTo(x+9,y+5);c.lineTo(x+15,y+h-6);c.lineTo(x+w-3,y+4);c.stroke();for(const [a,b] of [[3,h-4],[9,5],[15,h-6],[w-3,4]])R(x+a-1,y+b-1,2,2,'#e8799a');});kb(-4*T+14,11*T+6);box(-2*T+2,11*T+2,10,8,'#fff4c9');}},
 {y:7*T+11,d(){desk(2*T,6*T+4,48);monitor(2*T+4,5*T+7,20,14,scrEsb);monitor(3*T+9,5*T+9,17,12,scrEsb);kb(2*T+17,7*T+6);}},
 {y:7*T+12,d(){desk(6*T,6*T+4,48,'#f3d0dc');monitor(6*T+7,5*T+6,26,16,scrPred);kb(6*T+14,7*T+6);papers(7*T+13,7*T+11,1+S.trayP);sprout(6*T+1,6*T+7);}},
 {y:7*T+13,d(){desk(10*T,6*T+4,48,'#d7e8f7');monitor(10*T+4,5*T+7,20,14,scrWatch);monitor(11*T+9,5*T+9,17,12,scrWatch);kb(10*T+17,7*T+6);box(12*T+3,7*T+4,9,8,'#fff4c9');R(12*T+5,7*T+7,5,1,'#d9534f');}},
 {y:7*T+14,d(){desk(14*T,6*T+4,48,'#fff0b8');monitor(14*T+7,5*T+6,26,16,scrW);kb(14*T+14,7*T+6);R(16*T+4,6*T+4,1,10,'#6a5e7d');R(16*T+1,6*T+3,7,2,'#e8799a');R(16*T+3+Math.sin(S.t*6)*3,6*T+1,3,2,'#fff');}},
 {y:13*T+11,d(){R(6*T,12*T+4,6*T,26,OL);R(6*T+1,12*T+5,6*T-2,18,'#ffe2b5');R(6*T+1,12*T+5,6*T-2,1,'#fff3d8');R(6*T+1,12*T+23,6*T-2,6,'#d9a875');R(6*T+3,12*T+30,3,3,OL);R(12*T-6,12*T+30,3,3,OL);monitor(6*T+6,10*T+15,35,24,(x,y,w,h)=>scrGrid(x,y,w,h,FW.filled||0));monitor(9*T+6,10*T+15,35,24,(x,y,w,h)=>scrGrid(x,y,w,h,FE.filled||0));R(8*T+11,12*T+9,10,12,'#d9cfc2');kb(7*T+1,13*T+7);kb(10*T+1,13*T+7);papers(10*T+3,13*T+12,S.trayF);sprout(6*T+2,13*T);}},
 {y:13*T+14,d(){box(13*T+1,12*T+1,30,28,'#fff5ea');R(13*T+3,12*T+5,26,4,'#5a4d63');R(13*T+22,12*T+13,5,2,S.printing?'#6ff5ac':'#c9bfd0');R(13*T+1,14*T-5,30,4,'#d8cbc0');if(S.printing){const p=(S.t*2)%1;R(13*T+7,12*T+9+p*6,16,6-p*2,'#fff');}else R(13*T+7,12*T+10,16,3,'#fff');}},
 {y:5*T-1,d(){ // counter pantry
   R(18*T,3*T,7*T,31,OL);R(18*T,3*T+1,7*T,8,'#fff8ec');R(18*T,3*T+9,7*T,21,'#f7b7c6');for(let x=18;x<25;x++){R(x*T,3*T+10,1,19,'#e596ab');ell(x*T+8,3*T+19,1,1,'#fff');}
   // mesin kopi
   box(18*T+6,2*T+2,22,26,'#5a4d63');R(18*T+9,2*T+5,16,6,S.brew?'#8affdb':'#a79cb3');R(18*T+13,3*T+3,8,3,'#2d2636');mug(18*T+15,3*T+6);if(S.brew){R(18*T+17,3*T+6,1,Math.floor(S.t*8)%3+1,'#7a4f36');for(let i=0;i<2;i++){const p=(S.t*.9+i/2)%1;R(18*T+15+i*4+Math.sin(S.t*5+i),2*T+2-p*9,1,2,'rgba(255,255,255,.85)');}}
   // rak snack
   box(20*T+6,T+11,26,34,'#ffe5b8');R(20*T+7,2*T+10,24,1,OL);const sn=['#e8799a','#ffc14d','#7bdff2','#7ad192','#b49cff'];for(let i=0;i<5;i++){ell(20*T+10+i*5,2*T+5,2,3,sn[i]);ell(20*T+10+i*5,2*T+18,2,3,sn[(i+2)%5]);}
   // microwave + kulkas
   box(22*T+2,2*T+11,22,16,'#f4f1ee');R(22*T+4,2*T+13,13,11,S.micro?'#ffe27a':'#5a4d63');R(22*T+19,2*T+14,2,8,'#a79cb3');
   box(23*T+11,T+6,20,45,'#bde8ff');R(23*T+12,2*T+12,18,1,OL);R(23*T+27,T+12,2,10,'#6a8ca3');R(23*T+27,2*T+15,2,9,'#6a8ca3');R(23*T+13,T+8,6,3,'#fff');
 }},
 {y:8*T+15,d(){ell(20*T+16,7*T+14,15,9,OL);ell(20*T+16,7*T+13,14,8,'#fff4e1');ell(20*T+16,7*T+13,10,5,'#ffd8e2');R(20*T+15,8*T+6,3,9,OL);R(20*T+8,9*T-1,17,2,OL);if(!NPC.some(n=>n.pose==='eat'&&n.slot))mug(20*T+13,7*T+9);}},
 {y:12*T-2,d(){ // sofa menghadap depan
   R(18*T,10*T+4,3*T,28,OL);R(18*T+1,10*T+5,3*T-2,16,'#7ec8e3');R(18*T+1,10*T+5,3*T-2,2,'#a9e0f2');R(18*T+1,10*T+21,3*T-2,10,'#5dafcc');for(const x of [8,24,40])R(18*T+x,10*T+7,1,13,'#5dafcc');box(18*T,10*T+10,6,20,'#9bd8ec');box(21*T-6,10*T+10,6,20,'#9bd8ec');box(18*T+8,10*T+9,11,9,'#ffc2d1');box(19*T+13,10*T+10,10,8,'#ffe27a');
 }},
 {y:15*T-2,d(){ell(19*T+8,14*T+8,10,6,OL);ell(19*T+8,14*T+7,9,5,'#f5d6a8');R(19*T+6,14*T+13,3,4,OL);R(19*T+5,14*T+2,5,4,'#fff');R(19*T+6,14*T+1,3,2,'#ffb7c8');}},
 {y:11*T+1,d(){box(22*T+1,10*T+1,14,11,'#fff');R(22*T+4,10*T+4,8,4,'#bde8ff');R(22*T+7,10*T,2,3,'#a79cb3');box(22*T+3,9*T+4,10,10,'#e8f7fb');box(24*T+2,9*T+11,13,9,'#fff');ell(24*T+8,10*T+9,6,6,OL);ell(24*T+8,10*T+9,5,5,'#fff');ell(24*T+8,10*T+9,3,3,'#bde8ff');}},
 {y:7*T+16,d(){NPC.filter(n=>!isF(n)).forEach(deskFood);}},
 {y:13*T+13,d(){deskFood(FW);deskFood(FE);}},
 ...[[1,15,true],[16,15,true],[18,15,false]].map(([x,y,b])=>({y:(y+1)*T,d(){plant(x*T,y*T,b);}})),
 {y:13*T,d(){R(1*T,11*T-3,2*T,35,OL);R(1*T+1,11*T-2,2*T-2,33,'#c99a72');for(let s=0;s<2;s++){R(1*T+2,11*T+10+s*15,2*T-4,2,'#8c6245');const bc=['#e8799a','#ffc14d','#58b8a4','#7bdff2','#b49cff','#fff'];for(let i=0;i<6;i++)R(1*T+3+i*4.5,11*T+1+s*15,4,9,bc[(i+s*2)%6]);}}},
];

// ===== Karakter =====
const mk=(id,name,seat,cfg)=>({id,name,seat,...cfg,x:seat[0],y:seat[1],path:[],wait:null,face:1,pose:'sit',walkT:0,fast:false,task:'Bersiap',p:null,action:'type',carry:null,busy:false,gen:0,say:'',sayT:0,held:0,slot:null,mood:'',moodT:0,bob:Math.random()*6});
const NPC=[
 mk('esb','Admin ESB',[3,8],{shirt:'#dc9c2e',shade:'#b97e1f',inner:'#f5f2ea',skin:'#9a6444',skinS:'#7a4b31',hair:'#241a1c',iris:'#2f1c14',color:'#e7a93a',pants:'#2f3442',shoes:'#f1eee6',bw:5,tall:.5,spd:1.25}),
 mk('pawang','Pengendali Cuaca',[15,8],{shirt:'#5aa9dc',shade:'#3e86b8',inner:'#eaf6fd',skin:'#f6d6bf',skinS:'#dfb398',hair:'#c6d8ee',iris:'#2f8fd0',color:'#62b8ee',pants:'#3e5578',shoes:'#f1f4f8',bw:4.75,tall:0,spd:1.02}),
 mk('pred','Penganalisa Data',[7,8],{shirt:'#efe4cf',shade:'#d3c4a8',inner:'#2f3c63',skin:'#f3d2b8',skinS:'#dcae92',hair:'#6d57b0',iris:'#4a3a7a',color:'#a886ea',pants:'#2f3c63',shoes:'#7d6ac0',bw:5,tall:1,spd:.98}),
 mk('f1','Forecaster',[7,14],{shirt:'#28416f',shade:'#1c3054',inner:'#eef0f2',skin:'#e3b692',skinS:'#c79572',hair:'#241f26',iris:'#33291f',color:'#3f66b8',pants:'#2f3644',shoes:'#e8e4da',bw:5.25,tall:.75,spd:.96}),
 mk('f2','Forecaster',[10,14],{shirt:'#f8dbe6',shade:'#e8b9cb',inner:'#f8dbe6',skin:'#f3d0b6',skinS:'#dcae92',hair:'#e8809f',iris:'#4a2f2a',color:'#ec6fa6',pants:'#4b4254',shoes:'#c9587c',bw:4.75,tall:0,spd:1}),
 mk('watch','Pemantau Produk',[11,8],{shirt:'#2f6f5e',shade:'#245548',inner:'#f6f1ea',skin:'#f4cfb3',skinS:'#dca98c',hair:'#b5502c',iris:'#2f5a4c',color:'#35b58f',pants:'#2b2732',shoes:'#1f1b22',bw:4.75,tall:.5,spd:1.08}),
 mk('mgr','Factory Manager',[-3,6],{shirt:'#26252b',shade:'#161519',inner:'#26252b',skin:'#d9a682',skinS:'#bd8865',hair:'#1c1716',iris:'#2a1d15',color:'#8a93a6',pants:'#3a3f4d',shoes:'#2a2a2e',bw:5.25,tall:1,spd:1}),
 mk('spv','SPV Logistik',[-3,12],{shirt:'#e3ebf7',shade:'#c4d2e8',inner:'#e3ebf7',skin:'#f2cfb4',skinS:'#daab8e',hair:'#4f8fd9',iris:'#3b2a24',color:'#4f8fd9',pants:'#3f4a5e',shoes:'#2f5f9e',bw:4.75,tall:0,spd:1,hj:['#4f8fd9','#356fb5','#a9cdf3']}),
 mk('guest','Tamu',[18,12],{shirt:'#2b2b33',shade:'#1b1b21',inner:'#f4f1ee',skin:'#f0c8a8',skinS:'#d6a483',hair:'#2a1c22',iris:'#2a1d15',color:'#9b8cc4',pants:'#3b4a66',shoes:'#ece6dc',bw:4.75,tall:.25,spd:1}),
 // Tamu per bagian (owner 2026-11-27). look: gaya rambut/jilbab, kacamata, jenis atasan.
 mk('ga1','Tamu Area 1',[18,13],{shirt:'#6f9a7a',shade:'#557d61',inner:'#6f9a7a',skin:'#f2cfb4',skinS:'#daab8e',hair:'#3a2a22',iris:'#3b2a24',color:'#e2b52e',pants:'#4a4f5e',shoes:'#7a5a3c',bw:4.75,tall:0,spd:1,hj:['#f2c230','#cf9a12','#ffe38a'],look:{hijab:1,top:'tunic'}}),
 mk('ga2','Tamu Area 2',[19,13],{shirt:'#cfe0f5',shade:'#a9c2e2',inner:'#cfe0f5',skin:'#e0b08c',skinS:'#c4906c',hair:'#1d1a1c',iris:'#2a1d15',color:'#7fa6d8',pants:'#2f3a52',shoes:'#3a2f2a',bw:5,tall:.75,spd:1,look:{crew:1,glasses:1,top:'kemeja'}}),
 mk('ga3','Tamu Area 3',[20,13],{shirt:'#b08a56',shade:'#8e6c3e',inner:'#f4f1ea',skin:'#c98f68',skinS:'#ab7350',hair:'#221c1a',iris:'#2a1d15',color:'#b08a56',pants:'#3b3f47',shoes:'#d9d2c4',bw:5.25,tall:.75,spd:1,look:{crew:1,top:'canvas'}}),
 mk('gmk','Tamu Marketing',[18,14],{shirt:'#b6403a',shade:'#8f2e2a',inner:'#1f1f24',skin:'#edc19f',skinS:'#d3a07c',hair:'#2b2120',iris:'#2a1d15',color:'#b6403a',pants:'#2e3c5c',shoes:'#f2efe8',bw:5,tall:.5,spd:1.05,look:{mid:1,top:'flannel'}}),
 mk('ghr','Tamu HRD',[19,14],{shirt:'#6d5a9c',shade:'#54447d',inner:'#f6f3ee',skin:'#f4d3ba',skinS:'#dcae92',hair:'#4a2e26',iris:'#3b2a24',color:'#8f7cc4',pants:'#3a3542',shoes:'#2b2530',bw:4.75,tall:0,spd:1,hj:['#9b3b52','#7a2a3e','#d07a8e'],look:{hijab:1,top:'blazer'}}),
 mk('gbd','Tamu BD',[20,14],{shirt:'#3e5c4b',shade:'#2d4537',inner:'#e9e4da',skin:'#d6a07a',skinS:'#b9835e',hair:'#1a1617',iris:'#2a1d15',color:'#4f8a69',pants:'#2a2d33',shoes:'#efe9df',bw:5.25,tall:1,spd:1,look:{crew:1,top:'jacket'}}),
 mk('gout','Tamu Outlet',[18,15],{shirt:'#f3e7cf',shade:'#dcc9a7',inner:'#f3e7cf',skin:'#e9bd99',skinS:'#cf9f7b',hair:'#2a1f1c',iris:'#3b2a24',color:'#8a5a3b',pants:'#3d3530',shoes:'#2a2224',bw:4.75,tall:0,spd:1,hj:['#2a2a31','#141419','#5c5c68'],look:{hijab:1,top:'apron'}}),
 mk('gfba','Tamu FBA',[19,15],{shirt:'#f7f7f4',shade:'#dcdcd6',inner:'#f7f7f4',skin:'#fcebe0',skinS:'#efcfbd',hair:'#3a2a22',iris:'#3b2a24',color:'#cdb98f',pants:'#5a5048',shoes:'#8a7a66',bw:4.75,tall:0,spd:1,hj:['#e6d6b8','#c7b28c','#f5ecda'],look:{hijab:1,glasses:'round',top:'tunic'}})
];
const DESK={esb:[4*T+5,7*T+6],pawang:[14*T+4,7*T+7],pred:[6*T+5,7*T+7],watch:[10*T+5,7*T+7],f1:[8*T+6,13*T+6],f2:[11*T+3,13*T+6],mgr:[-4*T+5,5*T+7],spv:[-4*T+5,11*T+7]};
const VOICE={
 esb:{want:{kopi:['Kopi kilat, gas!','Bentar, isi bensin dulu!'],snack:['Ganjal perut, cepet!','Snack dulu, server aman.'],makan:['Makan sambil lari juga bisa.','Lima menit, langsung balik!'],sofa:['Rebahan semenit aja.','Kaki minta servis.'],toilet:['Darurat! Minggir!','Toilet, ngebut!']},enjoy:{kopi:['Nah, koneksi stabil.','Mantap, full sinyal.'],snack:['Bandwidth perut naik.','Gas lagi abis ini.'],makan:['Enak, tambah tenaga!'],sofa:['Oke, reboot sebentar.']},wc:['Lagi proses, jangan ganggu!','Loading...'],empty:['Yah, kopinya timeout.']},
 pawang:{want:{kopi:['Kopi dulu, awannya parkir.','Es kopi, biar kubekukan sendiri.'],snack:['Awan nggak bikin kenyang.','Ngemil sebelum bikin badai.'],makan:['Laper, petirnya ikut bunyi.','Makan dulu, langit bisa nunggu.'],sofa:['Awanku butuh istirahat.','Cuti dari langit sebentar.'],toilet:['Hujan lokal, permisi!','Awan, tunggu di sini.']},enjoy:{kopi:['Cerah lagi nih suasana hati.','Pas, kayak angin sore.'],snack:['Mood naik 30 derajat.'],makan:['Enak, langit jadi cerah.'],sofa:['Awan juga bisa rebahan.']},wc:['Lagi turun hujan, jangan masuk!'],empty:['Kopinya menguap, literally.']},
 pred:{want:{kopi:['Kafein naikkan akurasi 12%.','Saya butuh variabel kopi.'],snack:['Gula darah di bawah rata-rata.','Koreksi kalori sebentar.'],makan:['Waktunya isi data ke perut.','Makan sesuai jadwal.'],sofa:['Istirahat optimal 7 menit.','Otak perlu kalibrasi.'],toilet:['Sebentar, ada outlier.','Permisi, keluar dari sampel.']},enjoy:{kopi:['Signifikan.','Hasilnya sesuai hipotesis.'],snack:['Korelasinya positif.'],makan:['Rasanya di atas median.'],sofa:['Sedang konvergen...']},wc:['Mohon tunggu hasil uji.'],empty:['Sampel kopi habis.']},
 f1:{want:{kopi:['Kopi dulu, sheet-nya nanti.','Angka butuh kafein.'],snack:['Ngemil biar fokus.','Satu snack, lanjut hitung.'],makan:['Makan dulu, revisi belakangan.','Perut minta di-update.'],sofa:['Lima menit, sumpah.','Mata istirahat dulu.'],toilet:['Izin, sebelum ada revisi.','Kabur sebentar dari sheet.']},enjoy:{kopi:['Oke, otak nyala lagi.','Nah, baru bisa mikir.'],snack:['Lumayan buat amunisi.'],makan:['Akhirnya makan juga.'],sofa:['Jangan dibangunin ya.']},wc:['Sebentar, lagi audit.'],empty:['Kopinya habis, lanjut deh.']},
 f2:{want:{kopi:['Bikin kopi dulu ya.','Biar makin semangat!'],snack:['Ada camilan apa hari ini?','Ngemil dikit boleh dong.'],makan:['Waktunya makan, yuk!','Istirahat makan dulu.'],sofa:['Duduk sebentar ya.','Kaki pegal nih.'],toilet:['Izin ke belakang ya.','Sebentar ya, teman-teman.']},enjoy:{kopi:['Hmm, pas banget.','Enak, jadi semangat.'],snack:['Enak juga ini.'],makan:['Alhamdulillah, kenyang.'],sofa:['Enaknya istirahat sebentar.']},wc:['Sebentar ya!'],empty:['Yah, sudah habis.']},
 watch:{want:{kopi:['Kopi. Tetap saya pantau.','Saya ambil kopi, jangan curang.'],snack:['Snack satu saja, disiplin.','Saya catat ini sebagai istirahat.'],makan:['Makan tepat waktu, contoh ya.','Istirahat makan, 15 menit.'],sofa:['Saya duduk, bukan santai.','Dari sini juga kelihatan.'],toilet:['Dua menit. Jangan aneh-aneh.','Saya segera kembali.']},enjoy:{kopi:['Boleh juga.','Standarnya cukup.'],snack:['Tidak ada yang terbuang.'],makan:['Porsinya pas, nol waste.'],sofa:['Tetap awas.']},wc:['Sedang inspeksi.'],empty:['Habis. Nol waste.']},
 mgr:{want:{kopi:['Kopi hitam, tanpa gula.','Kopi dulu, laporan nanti.'],snack:['Satu saja.'],makan:['Makan dulu, rapat nanti.'],sofa:['Duduk sebentar.'],toilet:['Sebentar.']},enjoy:{kopi:['Pas.'],snack:['Boleh juga.'],makan:['Cukup.'],sofa:['Lumayan.']},wc:['Sebentar.'],empty:['Habis ya.']},
 spv:{want:{kopi:['Kopi dulu, rute nanti.','Isi tenaga sebelum jam kirim.'],snack:['Ngemil sambil cek rute.'],makan:['Makan dulu ya.'],sofa:['Duduk sebentar.'],toilet:['Izin sebentar.']},enjoy:{kopi:['Segar lagi.'],snack:['Enak.'],makan:['Kenyang.'],sofa:['Enaknya.']},wc:['Sebentar ya.'],empty:['Yah, habis.']},
 guest:{want:{kopi:['Boleh minta kopinya?','Kopi dulu, biar melek.'],snack:['Snack-nya kelihatan enak.'],makan:['Numpang makan ya.'],sofa:['Duduk lagi ah.'],toilet:['Permisi, toiletnya di mana?']},enjoy:{kopi:['Enak juga kopi kantor ini.'],snack:['Nyam, mantap.'],makan:['Kenyang.'],sofa:['Sofanya empuk.']},wc:['Sebentar ya.'],empty:['Yah, habis.']}
};
const by=id=>NPC.find(n=>n.id===id),ESB=by('esb'),PAW=by('pawang'),PRED=by('pred'),FW=by('f1'),FE=by('f2'),WAT=by('watch'),isF=n=>n===FW||n===FE,MGR=by('mgr'),SPV=by('spv'),GUEST=by('guest'),GIDS=['ga1','ga2','ga3','gmk','ghr','gbd','gout','gfba'],GUESTS=GIDS.map(by),isGuest=n=>n===GUEST||GUESTS.includes(n),comes=n=>isF(n)||n===MGR||n===SPV||isGuest(n);let FC=FW;
for(const n of [MGR,SPV,GUEST,...GUESTS]){n.present=false;n.pose='away';n.x=4;n.y=15;}
let SCHEDULE={},officeReady=false;const SHIFT={'7:00':[7,16],'10:30':[10.5,21],'12:00':[12,21]};
const dateNow=()=>S.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
const shiftOf=n=>SCHEDULE[dateNow()]?.[n===FW?0:1]||'';
const onShift=n=>{const h=SHIFT[shiftOf(n)],t=hourNow();return !!h&&t>=h[0]&&t<h[1];};
const clockText=v=>String(Math.floor(v)).padStart(2,'0')+'.'+(v%1?'30':'00');
function shiftText(n){if(!isF(n))return 'Tidak online';const v=shiftOf(n),h=SHIFT[v];if(h)return `Shift ${clockText(h[0])}-${clockText(h[1])}`;if(v==='WFH')return 'WFH';if(/CUTI/i.test(v))return 'Cuti';if(/OFF/i.test(v))return 'Libur';if(/SAKIT/i.test(v))return 'Sakit';if(/IZIN/i.test(v))return 'Izin';return v||'Belum ada jadwal';}
// Setiap akun hanya mengendalikan karakternya sendiri; Master bisa semua (owner 2026-11-24).
function myChars(){const r=window.ForecastAuth?.role||{};if(r.master)return NPC.map(n=>n.id);if(r.fu==='forecaster')return r.char?[r.char]:[];if(r.fu==='analyst')return ['pred'];if(r.fu==='factory')return ['mgr'];if(r.fu==='spv')return ['spv'];if(r.fu==='esbadmin')return ['esb'];if(r.fu==='guest')return GIDS.includes(r.char)?[r.char]:['guest'];return window.ForecastRolePolicy?.planner?.(r)?['f1','f2']:[];}
const mine=n=>!!n&&myChars().includes(n.id),ready=n=>n.present!==false&&!n.leaving&&n.pose!=='away';
function pickFC(){if(FC&&mine(FC)&&ready(FC))return true;const o=[FW,FE,MGR,SPV,PRED,...NPC].find(n=>mine(n)&&ready(n));if(o){FC=o;return true;}return false;}
const watchLevel=()=>S.waste==='lewat'||S.lost==='lewat'?2:S.waste==='waspada'||S.lost==='waspada'?1:0;
const hourNow=()=>{if(S.hour!=null)return S.hour;const d=new Date(Date.now()+7*3600000);return d.getUTCHours()+d.getUTCMinutes()/60;};
const asleep=()=>{const h=hourNow();return h>=22||h<7;};
const hhmm=h=>String(Math.floor(h)).padStart(2,'0')+'.'+String(Math.floor((h%1)*60)).padStart(2,'0');
function say(n,text,sec=3.2){if(n.ff>0||S.t<(n.talkUntil||0))return;n.say=text;n.sayT=sec;}
const seeded=str=>{let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);let a=h>>>0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
const nr=n=>n.rng||Math.random,nrnd=(n,a,b)=>a+nr(n)()*(b-a),npick=(n,x)=>x[Math.floor(nr(n)()*x.length)];
function chat(n,arr,prob=1){const a=nr(n)(),b=nr(n)();if(S.chatCd>0||a>prob||n.sayT>0||n.ff>0)return false;say(n,arr[Math.floor(b*arr.length)]);S.chatCd=3.5;return true;}
const mood=(n,m,sec=2.4)=>{n.mood=m;n.moodT=sec;};

// ===== Obrolan =====
const WANT={kopi:['Ngopi dulu ah~','Mata tinggal 5 watt.','Kopi! Kopi! Kopi!','Butuh kafein, darurat.'],snack:['Perut bunyi nih.','Ngemil dikit nggak dosa.','Ada donat nggak ya?'],makan:['Laper, makan dulu!','Bekal hari ini apa ya?','Cacing perut demo.'],sofa:['Rebahan 5 menit...','Punggung minta cuti.','Sofa memanggilku.'],toilet:['Aduh, kebelet!','Izin ke belakang bentar.','Jangan ada yang nyusul.']};
const ENJOY={kopi:['Hmm, enak banget.','Akhirnya waras lagi.','Ini bensin saya.'],snack:['Nyam nyam~','Satu lagi deh.','Enak, jangan bilang-bilang.'],makan:['Enak pol!','Diet mulai besok.','Nambah boleh nggak?'],sofa:['Nggak tidur kok, cuma merem.','Empuk banget...','Lima menit lagi...']};
const REPLY=['Bagi dong!','Bikinin satu!','Wah, aku juga mau.','Sisain ya!'];
const WC_LINES=['Ada orang!','Jangan diketuk!','Ide terbaik lahir di sini.'];

// ===== Mesin tugas =====
const CANCEL=Symbol('cancel');let epoch=0;const waiters=[];
function cancel(n){n.gen++;const w=n.wait;n.wait=null;n.path=[];n.p=null;n.fast=false;n.slot=null;n.slot2=null;n.carry=null;if(w)w.reject(CANCEL);}
const timer=(n,sec,tick)=>{const total=sec;if(n.ff>0){const u=Math.min(n.ff,sec);n.ff-=u;sec-=u;if(sec<=.001){tick?.(1);return Promise.resolve();}}return new Promise((resolve,reject)=>{n.wait={resolve,reject,left:sec,total,tick};});};
const walk=(n,cell,fast=false)=>new Promise((resolve,reject)=>{n.slot=null;n.slot2=null;let p=route([Math.round(n.x),Math.round(n.y)],cell);if(!p.length){resolve();return;}if(n.ff>0){const sp=(fast?5.2:3)*(n.spd||1),used=Math.min(Math.floor(n.ff*sp),p.length);if(used>0){const q=p[used-1];n.x=q[0];n.y=q[1];n.ff=Math.max(0,n.ff-used/sp);p=p.slice(used);}if(!p.length){n.pose='stand';resolve();return;}n.ff=0;}n.path=p;n.fast=fast;n.pose='walk';n.wait={resolve,reject,walk:true};});
const until=f=>new Promise(r=>waiters.push({f,r}));
const held=n=>n.held>S.t;const alive=e=>e===epoch;
// Tamu duduk di sofa, bukan di meja.
async function sofaSit(n){const c=free(n,SPOT.sofa)||[19,13];await walk(n,c);if(SPOT.sofa.some(s=>s[0]===c[0]&&s[1]===c[1])){n.slot=key(c[0],c[1]);n.pose='sofa';}else n.pose='stand';n.face=0;}
async function sitDown(n){if(isGuest(n))return sofaSit(n);await walk(n,n.seat);n.pose='sit';n.face=1;if(n.food?.where==='hand'){n.food.where='desk';n.sipT=0;n.food.cd=4;}}
function give(n,kind){const left=nrnd(n,36,50);n.food={kind,left,total:left,where:'hand',cd:3};}
function foodTick(n,dt){const f=n.food;if(!f)return;f.left-=dt;n.sipT=Math.max(0,(n.sipT||0)-dt);if(f.left<=0){n.food=null;n.sipT=0;if(n.pose==='sit'&&f.kind==='cup')chat(n,VOICE[n.id].empty,.3);return;}f.cd-=dt;if(f.cd<=0&&!n.carry&&n.pose!=='toilet'&&(f.where==='hand'||n.pose==='sit')){n.sipT=1.3;f.cd=5+(f.left*7)%4;}}
const WANDER=[[[7,10],'Melihat forecaster bekerja',1],[[12,9],'Melihat-lihat kantor',0],[[15,10],'Lihat papan grafik',0],[[4,9],'Lihat rak server',0],[[9,15],'Lihat tanaman',1],[[13,15],'Jalan-jalan sebentar',1],[[5,11],'Menyapa tim',1],[[16,4],'Lihat ke luar jendela',0],[[10,4],'Baca papan pengumuman',0],[[20,9],'Mampir ke pantry',0]];
async function guestWander(n,times=1){for(let i=0;i<times;i++){const [c,label,face]=npick(n,WANDER),cell=nearestFree(c[0],c[1]);await standAt(n,cell,face);await doing(n,label,nrnd(n,5,9),'stand');if(nr(n)()<.25)speak(n,npick(n,['Kantornya rapi ya.','Seru juga lihat orang kerja.','Wah, grafiknya naik.','Pantry-nya lengkap banget.','Rame juga ya hari ini.']));}}
async function standAt(n,cell,face=1,fast=false){await walk(n,cell,fast);n.pose='stand';n.face=face;}
async function doing(n,label,sec,action='type',tick){n.task=label;n.action=action;await timer(n,sec,p=>{n.p=p;tick?.(p);});n.p=null;}
function assign(n){n.busy=true;cancel(n);}
function release(n){n.busy=false;n.carry=null;if(!asleep())idle(n);}
const IDLE={esb:['Memeriksa log server','Merapikan kabel data'],pawang:['Memantau awan','Mencatat suhu'],pred:['Mengecek rumus','Membaca pola penjualan'],f1:['Meninjau rencana besok','Mengecek selisih stok'],f2:['Merapikan rencana kirim','Mengecek stok outlet'],watch:['Memantau layar outlet','Mencatat temuan'],mgr:['Membaca laporan','Meninjau target'],spv:['Mengatur rute kirim','Mengecek jadwal driver'],guest:['Main HP','Menikmati suasana','Membalas pesan']};
const free=(n,list)=>list.find(s=>!NPC.some(o=>o!==n&&(o.slot===key(s[0],s[1])||o.slot2===key(s[0],s[1]))));
const WC_Q=[[20,13],[19,13],[18,13]],WC_WAIT=['Buruan dong!','Masih lama nggak?','Tolong, ini darurat.','Jangan tidur di dalam ya!'];
async function wcVisit(n,sec){
 const V=VOICE[n.id];if(!S.wcQ.includes(n)&&S.wcQ.length>WC_Q.length)return false;S.wcQ.push(n);n.task='Ke toilet';n.action='break';chat(n,V.want.toilet,n===FC?1:.7);let complained=false;
 try{
  while(S.wcQ[0]!==n){const i=S.wcQ.indexOf(n)-1;n.task=`Antre toilet (${i+1})`;await standAt(n,WC_Q[i],0);if(!complained&&i===0){complained=true;chat(n,WC_WAIT,.75);}await timer(n,.35);}
  n.task='Ke toilet';await walk(n,SPOT.toilet[0]);n.slot=key(SPOT.toilet[0][0],SPOT.toilet[0][1]);n.pose='toilet';n.face=0;n.action='wc';n.task='Di toilet';if(nr(n)()<.55)say(n,npick(n,V.wc),2.2);await timer(n,sec||nrnd(n,6,9));n.pose='stand';
 }finally{S.wcQ=S.wcQ.filter(x=>x!==n);n.slot=null;}
 return true;
}
async function napVisit(n,sec){
 if(n===PAW)return activity(n,'sofa',sec);
 const V=VOICE[n.id],seats=SPOT.sofa.map(q=>key(q[0],q[1])),taken=()=>NPC.some(o=>o!==n&&(seats.includes(o.slot)||seats.includes(o.slot2)));
 if(taken())return activity(n,'sofa',sec);n.task='Tidur di sofa';n.action='break';chat(n,V.want.sofa,n===FC?1:.7);await walk(n,[19,12]);if(taken())return activity(n,'sofa',sec);
 n.slot=seats[0];n.slot2=seats[1];n.pose='nap';n.face=0;n.task='Tidur di sofa';await timer(n,sec||nrnd(n,13,19));n.slot=null;n.slot2=null;n.pose='stand';return true;
}
async function occupy(n,cell,pose,face){await walk(n,cell);n.slot=key(cell[0],cell[1]);n.pose=pose;n.face=face;}
const LABEL={kopi:'Bikin kopi',snack:'Ambil snack',makan:'Makan',sofa:'Duduk di sofa',nap:'Tidur di sofa',toilet:'Ke toilet'};
async function activity(n,a,sec){
 if(a==='toilet')return wcVisit(n,sec);if(a==='nap')return napVisit(n,sec);
 const list=a==='makan'?SPOT.kulkas:SPOT[a],cell=free(n,list);if(!cell)return false;
 n.task=LABEL[a];n.action='break';const V=VOICE[n.id];chat(n,V.want[a],n===FC?1:.7);
 if(a==='kopi'){await occupy(n,cell,'stand',1);S.brew++;try{await doing(n,'Menyeduh kopi',3,'reach');}finally{S.brew=Math.max(0,S.brew-1);}give(n,'cup');n.pose='sip';n.face=0;n.action='sip';n.task='Mencicipi kopi';n.sipT=1.8;chat(n,V.enjoy.kopi,.8);await timer(n,2.2);n.task='Membawa kopi';}
 if(a==='snack'){await occupy(n,cell,'stand',1);await doing(n,'Memilih snack',1.4,'reach');give(n,'snack');n.pose='eat';n.face=0;n.action='eat';n.task='Mencicipi snack';n.sipT=1.8;chat(n,V.enjoy.snack,.8);await timer(n,2.2);n.task='Membawa snack';}
 if(a==='makan'){await occupy(n,cell,'stand',1);S.micro++;try{await doing(n,'Menghangatkan bekal',2.4,'reach');}finally{S.micro=Math.max(0,S.micro-1);}n.carry='bento';const t=free(n,SPOT.eat);if(t){const f=t[0]<20?3:2;await occupy(n,t,'eat',f);n.action='eat';n.task='Makan bekal';mood(n,'heart');chat(n,V.enjoy.makan,.8);await timer(n,sec||nrnd(n,7,10));}n.carry=null;}
 if(a==='sofa'){await occupy(n,cell,'sofa',0);n.action='rest';n.task='Duduk di sofa';mood(n,'note',3);chat(n,V.enjoy.sofa,.6);await timer(n,sec||nrnd(n,8,13));}
 if(a==='toilet'){await occupy(n,cell,'toilet',0);n.action='wc';n.task='Di toilet';if(nr(n)()<.55)say(n,npick(n,V.wc),2.2);await timer(n,sec||nrnd(n,5,7));n.pose='stand';}
 n.slot=null;return true;
}
const SLOT=42;
const speak=(n,list)=>{const a=(Array.isArray(list)?list:[list]).filter(Boolean),x=a.length?a[Math.floor(nr(n)()*a.length)]:'';if(x&&!(n.ff>0))say(n,x,4.2);};
function planCount(){const c=window.ForecastPlanCloud;if(!c?.records)return null;const t=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()),b=new Date(Date.parse(t+'T00:00:00Z')+864e5).toISOString().slice(0,10);return new Set(c.records.filter(r=>r.date===b).map(r=>r.outlet)).size;}
const weatherLine=()=>S.weatherReady?TODAY_W[S.weather]:'Radar cuaca lagi dibaca.',tomorrowLine=()=>S.weatherTomorrow?TOMORROW_W[S.weatherTomorrow]:weatherLine();
const WORK={
 esb:[async n=>{speak(n,'Lagi cek data ESB terbaru.');await standAt(n,PLACE.rack,1);S.pulling=true;try{await doing(n,'Memeriksa data 28 outlet',9,'reach',p=>{S.pulled=Math.floor(p*28);});}finally{S.pulling=false;}S.pulled=28;speak(n,S.lastPull?`Rekap data jam ${S.lastPull} sudah selesai.`:'Belum ada rekap baru hari ini.');n.carry='crate';n.task='Mengantar data';await standAt(n,PLACE.toPred,2,true);n.carry=null;S.trayP=Math.min(3,S.trayP+1);await timer(n,.8);},
  async n=>{await sitDown(n);await doing(n,'Memeriksa log server',7);speak(n,realLines(n));await doing(n,'Merapikan kabel data',7);}],
 pawang:[async n=>{await standAt(n,PLACE.radar,1);await doing(n,'Membaca radar hujan',8,'point',p=>{S.radar=p;});speak(n,weatherLine());await sitDown(n);await doing(n,'Mencatat peluang hujan',6);speak(n,tomorrowLine());},
  async n=>{await sitDown(n);await doing(n,'Memantau awan',8);speak(n,realLines(n));await doing(n,'Mencatat suhu',6);}],
 pred:[async n=>{await standAt(n,PLACE.white,1);await doing(n,'Menggambar tren',8,'write',p=>{S.chart=p;});speak(n,'Tren penjualan sudah kugambar.');await sitDown(n);S.calcing=true;try{await doing(n,'Menghitung prediksi',7,'type',p=>{S.calc=p;});}finally{S.calcing=false;}S.calc=1;speak(n,S.modelReady?'Prediksi besok sudah siap.':'Model malam belum selesai.');},
  async n=>{await standAt(n,PLACE.printer,1);S.printing++;try{await doing(n,'Mencetak hasil',3,'stand');}finally{S.printing=Math.max(0,S.printing-1);}n.carry='paper';n.task='Menaruh ke meja forecaster';await standAt(n,PLACE.toFc,2);n.carry=null;S.trayF=3;speak(n,realLines(n).concat('Hasil prediksi kutaruh di meja forecaster.'));await timer(n,1);}],
 watch:[async n=>{speak(n,'Saya cek waste dan lost dulu.');await standAt(n,PLACE.board,1);S.auditing=true;try{await doing(n,'Mengecek waste & lost',9,'point',p=>{S.audit=p;});}finally{S.auditing=false;}S.audit=1;S.auditDone=true;speak(n,realLines(n));mood(n,watchLevel()?'alert':'star',3);await timer(n,1.5);},
  async n=>{await sitDown(n);await doing(n,'Memantau layar outlet',8);speak(n,realLines(n));await doing(n,'Mencatat temuan',6);}],
 mgr:[async n=>{await sitDown(n);await doing(n,'Meninjau laporan produksi',10);if(nr(n)()<.35)speak(n,['Target hari ini dijaga ya.','Laporan kemarin sudah saya baca.','Produksi aman, lanjutkan.']);await doing(n,'Menyetujui rencana',8);},
  async n=>{await standAt(n,PLACE.toFc,0);await doing(n,'Mengecek meja forecaster',5,'point');if(nr(n)()<.3)speak(n,['Rencana besok sudah aman?','Jangan lupa cek cuaca.','Kalau ada kendala, kabari saya.']);await sitDown(n);await doing(n,'Membaca laporan',8);}],
 spv:[async n=>{await sitDown(n);await doing(n,'Mengatur rute kirim',10);if(nr(n)()<.35)speak(n,['Rute pagi sudah siap.','Driver sudah saya kabari.','Jam kirim jangan molor ya.']);await doing(n,'Mengecek jadwal driver',7);},
  async n=>{await standAt(n,PLACE.printer,1);S.printing++;try{await doing(n,'Mencetak rincian kirim',4,'stand');}finally{S.printing=Math.max(0,S.printing-1);}n.carry='paper';n.task='Membawa rincian kirim';await sitDown(n);n.carry=null;await doing(n,'Memeriksa rincian kirim',8);}],
 // Owner 2026-11-27: tamu lebih sering keliling dan ke dapur, sofa hanya sesekali.
 guest:[async n=>{await guestWander(n,2);},
  async n=>{await activity(n,npick(n,['kopi','snack','makan']));await guestWander(n,1);},
  async n=>{await guestWander(n,1);await activity(n,npick(n,['kopi','snack']));},
  async n=>{await sitDown(n);await doing(n,'Santai di sofa',nrnd(n,6,10),'rest');}],
};
const forecasterWork=[async n=>{await sitDown(n);n.filled=0;await doing(n,'Menyusun rencana kirim',12,'type',p=>{n.filled=p;});n.filled=1;const c=planCount();speak(n,c==null?realLines(n):`Rencana besok sudah ${c} dari 28 outlet.`);await doing(n,'Mengecek ulang rencana',5);},
 async n=>{await sitDown(n);await doing(n,'Mengecek selisih stok',8);speak(n,realLines(n));await doing(n,'Meninjau rencana besok',6);}];
async function runSlot(n,g){
 try{
  const roll=nr(n)(),jobs=isF(n)?forecasterWork:WORK[n.id],job=jobs[Math.floor(nr(n)()*jobs.length)],boss=n===MGR||n===SPV,brk=npick(n,isGuest(n)?['kopi','snack','toilet']:boss?(n.food?['sofa','toilet']:['kopi','kopi','makan','sofa','toilet']):n.food?['sofa','nap','toilet']:['kopi','kopi','snack','makan','sofa','nap','toilet']);
  if(isGuest(n)){await job(n);while(g===n.gen){const r=nr(n)();if(r<.42)await guestWander(n,1);else if(r<.78){const ok=await activity(n,npick(n,['kopi','kopi','snack','makan','makan','toilet']));if(ok===false)await guestWander(n,1);}else{await sitDown(n);await doing(n,npick(n,IDLE[n.id]),nrnd(n,6,10),'rest');}}return;}
  if(roll<(boss?.85:.72))await job(n);else{await activity(n,brk);await sitDown(n);}
  await sitDown(n);while(g===n.gen)await doing(n,npick(n,IDLE[n.id]),8,n.id==='guest'?'rest':'type');
 }catch(e){if(e!==CANCEL)throw e;}
}
function startSlot(n,k,late,catchUp){cancel(n);n.busy=false;n.task='Kembali ke meja';n.action='walk';n.rng=seeded(`${n.id}|${k}`);n.ff=catchUp&&late>1?late:0;runSlot(n,n.gen);}
function slotTick(){const now=Date.now()/1000;NPC.forEach((n,i)=>{if((comes(n)&&(!n.present||n.leaving))||held(n))return;const t=now+i*7,k=Math.floor(t/SLOT),late=t%SLOT;if(n.slotK!==k){const catchUp=n.slotK===undefined&&!n.noFF;n.slotK=k;n.noFF=false;startSlot(n,k,late,catchUp);}});}
function idle(n){n.slotK=null;n.noFF=true;}
function startDay(){epoch++;NPC.filter(n=>!comes(n)||(n.present&&!n.leaving)).forEach(n=>{cancel(n);n.busy=false;n.carry=null;n.say='';n.slot=null;n.slotK=undefined;n.noFF=false;});}
function goSleep(){epoch++;S.pulling=false;S.auditing=false;S.calcing=false;S.printing=0;S.brew=0;S.micro=0;S.wcQ=[];const place={pred:[19,12]};NPC.filter(n=>!comes(n)).forEach(n=>{cancel(n);n.slotK=null;n.ff=0;n.busy=false;n.carry=null;n.slot=null;n.held=0;n.food=null;n.sipT=0;n.task='Menuju tempat tidur';n.action='sleep';const cell=place[n.id]||n.seat,sofa=!!place[n.id];(async()=>{try{await walk(n,cell);n.pose=sofa?'nap':'sleepDesk';n.face=sofa?0:1;if(sofa){n.slot=key(18,12);n.slot2=key(20,12);}n.task='Tidur';}catch(e){if(e!==CANCEL)throw e;}})();});}

const TODAY_W={cerah:'Hari ini cerah, aman.',mendung:'Hari ini cukup mendung.',hujan:'Hari ini berpotensi hujan.'},TOMORROW_W={cerah:'Besok kelihatannya cerah.',mendung:'Besok kayaknya mendung.',hujan:'Besok kayaknya hujan.'};
function realLines(n){
 const a=[];
 if(n===ESB){if(S.pulling)a.push('Data ESB lagi diproses.');if(S.lastPull)a.push(`Rekap data jam ${S.lastPull} sudah selesai.`,`Data terakhir masuk jam ${S.lastPull}.`);}
 if(n===PAW&&S.weatherReady){a.push(TODAY_W[S.weather]);if(S.weatherTomorrow)a.push(TOMORROW_W[S.weatherTomorrow]);}
 if(n===WAT&&S.statusReady){
  a.push(S.waste==='lewat'?'Waste sudah lewat batas.':S.waste==='waspada'?'Waste mulai mendekati batas.':'Waste masih aman.');
  a.push(S.lost==='lewat'?'Lost sales sudah lewat batas.':S.lost==='waspada'?'Lost sales mulai banyak.':'Lost sales masih aman.');
  if(S.wasteTrend==='naik')a.push('Waste lagi naik akhir-akhir ini.');if(S.wasteTrend==='turun')a.push('Waste mulai turun, bagus.');
  if(S.lostTrend==='naik')a.push('Lost sales meningkat akhir-akhir ini.');if(S.lostTrend==='turun')a.push('Lost sales mulai turun.');
  if(S.wasteOutlets[0])a.push(`Waste ${S.wasteOutlets[0]} perlu dicek.`);if(S.lostOutlets[0])a.push(`Lost sales ${S.lostOutlets[0]} perlu dicek.`);
 }
 if(n===PRED&&S.modelReady)a.push('Prediksi besok sudah siap.','Model semalam sudah diperbarui.');
 if(isF(n)&&n.present&&!n.leaving){const h=SHIFT[shiftOf(n)];if(h)a.push(`Shift saya sampai jam ${clockText(h[1])}.`);if(S.statusReady&&S.waste==='lewat')a.push('Waste tinggi, kirimannya hati-hati.');if(S.weatherTomorrow==='hujan')a.push('Besok hujan, rencananya dijaga.');}
 return a;
}
function syncReal(){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()),sales=window.PcsPanels?.data?.().sales,live=window.ForecastLiveIntraday,opts=[live?.date===today?live.asOf:null,sales?.intraday?.date===today?sales.intraday.asOf:null].filter(Boolean).sort();
 const at=opts.at(-1);S.lastPull=at?new Date(at).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}):null;
 const tomorrow=new Date(Date.parse(today+'T00:00:00Z')+864e5).toISOString().slice(0,10);S.modelReady=!!window.FORECAST_MODEL_SPLIT?.dates?.[tomorrow];
 const d=window.ForecastOfficeData;if(!d)return;
 SCHEDULE=d.schedule||{};FW.short=d.people?.[0]||'';FE.short=d.people?.[1]||'';FW.name=FW.short?`Forecaster ${FW.short}`:'Forecaster';FE.name=FE.short?`Forecaster ${FE.short}`:'Forecaster';officeReady=true;
 const st=d.status;if(st&&st.waste&&st.lost){S.statusReady=true;S.waste=st.waste;S.lost=st.lost;S.wasteTrend=st.wasteTrend||'stabil';S.lostTrend=st.lostTrend||'stabil';S.wasteOutlets=(st.wasteOutlets||[]).map(x=>x.name);S.lostOutlets=(st.lostOutlets||[]).map(x=>x.name);S.flagNames=[...S.wasteOutlets,...S.lostOutlets];const ids=sales?.outletIds||[];S.flag=[...(st.wasteOutlets||[]),...(st.lostOutlets||[])].map(x=>ids.indexOf(x.id)).filter(i=>i>=0);}
}
async function syncWeather(){
 if(S.weatherBusy||S.t-(S.weatherAt??-9999)<1800)return;const ids=window.PcsPanels?.data?.().sales?.outletIds;if(!ids?.length||!window.WeatherForecast)return;S.weatherBusy=true;
 try{const t=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()),b=new Date(Date.parse(t+'T00:00:00Z')+864e5).toISOString().slice(0,10),map=await window.WeatherForecast.getNetwork(ids,t,b),p=window.ForecastSettings?.get?.().weather||{},rain=p.highRiskProb||60,cloud=p.rainLabelProb||45,avg=day=>{const v=[...map.values()].map(w=>w.error?null:w.days?.find(x=>x.date===day)?.probability).filter(Number.isFinite);return v.length?v.reduce((x,y)=>x+y,0)/v.length:null;},kind=v=>v==null?null:v>=rain?'hujan':v>=cloud?'mendung':'cerah',a=kind(avg(t)),c=kind(avg(b));if(a){S.weather=a;S.weatherTomorrow=c;S.weatherReady=true;S.weatherAt=S.t;}}catch{}finally{S.weatherBusy=false;}
}
window.addEventListener('forecast-intraday',()=>{const before=S.lastPull;syncReal();if(S.lastPull&&before&&S.lastPull!==before&&!asleep()&&ESB.pose!=='toilet')say(ESB,`Data jam ${S.lastPull} baru masuk!`,4.2);});
window.addEventListener('forecast-office-data',syncReal);
window.addEventListener('pcs-data-loaded',()=>{syncReal();syncWeather();});
let dutyReady=false;
function arrive(n){n.present=true;n.leaving=false;n.x=4;n.y=15;n.path=[];n.pose='stand';n.face=1;n.food=null;n.task='Baru datang';n.ff=0;say(n,n===MGR?'Pagi, tim.':n===SPV?'Halo semua!':n===GUEST?'Halo, permisi!':'Halo, masuk shift!',2.4);idle(n);}
function leave(n){n.leaving=true;cancel(n);n.busy=false;n.held=0;n.food=null;n.task='Pulang';say(n,'Duluan ya!',2.2);(async()=>{try{await walk(n,[4,15]);}catch(e){if(e!==CANCEL)throw e;}n.present=false;n.leaving=false;n.pose='away';n.sayT=0;if(pickFC()&&S.sel===n.id)S.sel=FC.id;})();}
// Muncul saat shift (forecaster) atau saat akunnya online. Manajer & SPV hanya saat online.
// Tamu per bagian (owner 2026-11-27): ikut kebiasaan Tamu; muncul bila akun tamu dengan karakter itu online.
for(const id of GIDS){IDLE[id]=IDLE.guest;WORK[id]=WORK.guest;VOICE[id]=VOICE.guest;}
function onlineAs(id){const now=Date.now(),role={mgr:'factory',spv:'spv',guest:'guest'}[id];return (S.pres||[]).some(p=>p.online!==false&&now-(p.at?.toMillis?.()||0)<150e3&&(GIDS.includes(id)?p.role==='guest'&&p.char===id:id==='guest'?p.role==='guest'&&!GIDS.includes(p.char):role?p.role===role:(p.role==='forecaster'&&p.char===id)));}
function dutyTick(){for(const n of [MGR,SPV,GUEST,...GUESTS]){const want=onlineAs(n.id)&&!asleep();if(want&&!n.present)arrive(n);else if(!want&&n.present&&!n.leaving)leave(n);}if(!officeReady){for(const n of [FW,FE]){const want=onlineAs(n.id)&&!asleep();if(want&&!n.present)arrive(n);else if(!want&&n.present&&!n.leaving)leave(n);else if(!want&&!n.present&&!n.leaving){n.present=false;n.pose='away';n.x=4;n.y=15;}}return;}for(const n of [FW,FE]){const want=onShift(n)||(onlineAs(n.id)&&!asleep());if(!dutyReady){if(want){n.present=true;n.pose='sit';n.face=1;n.x=n.seat[0];n.y=n.seat[1];}else{n.present=false;n.pose='away';n.x=4;n.y=15;}}else if(want&&!n.present)arrive(n);else if(!want&&n.present&&!n.leaving)leave(n);}if(!dutyReady){dutyReady=true;pickFC();}}
// ===== Obrolan interaktif =====
// Lawan bicara selalu berdekatan dan saling menghadap. Jadwal obrolan antar-karakter acak tetapi
// berasal dari seed harian, jadi semua layar melihat obrolan yang sama pada waktu yang sama.
const WALK_IN=9,DAYS=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'],TK={facts:null,at:-99,memo:{},scene:null,idx:-1,next:0,queue:null,release:null,day:null,times:[],cur:null};
function talkFacts(){
 if(TK.facts&&S.t-TK.at<15)return TK.facts;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()),dow=new Date(today+'T00:00:00Z').getUTCDay(),nx=(dow+1)%7;
 let h={items:[]},snap=null;try{h=window.ForecastWasteLost?.health?.()||h;}catch{}try{snap=window.ForecastDashboard?.todaySnapshot?.()||null;}catch{}
 const of=c=>h.items.filter(x=>x.cls===c),omzet=snap?{text:'Rp'+(snap.sum/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' juta',pct:snap.pct==null?null:Math.round(snap.pct),outlets:snap.outlets}:null;
 const who=(FC.present&&!FC.leaving?FC.short:'')||'',n1=v=>(Math.round(v*10)/10).toLocaleString('id-ID'),rpS=v=>v>=1e6?'Rp'+n1(v/1e6)+' juta':'Rp'+Math.round(v/1e3).toLocaleString('id-ID')+' ribu';
 const top=(a,k)=>a.filter(x=>Number.isFinite(x[k])&&x[k]>0).sort((x,y)=>y[k]-x[k])[0]||null,low=(a,k)=>a.filter(x=>Number.isFinite(x[k])&&x.wasteRp>0).sort((x,y)=>x[k]-y[k])[0]||null;
 const wp=top(h.items,'nom'),lp=top(h.items,'lostRp'),aw=top(h.areas||[],'wastePct'),al=top(h.areas||[],'lostRp'),ab=low(h.areas||[],'wastePct'),ow=top((h.outlets||[]).filter(x=>x.wasteRp>2e5),'wastePct'),ol=top(h.outlets||[],'lostPcs');
 let trend=null;try{const byDate=new Map();for(const s of window.ForecastDashboard?.grossSeries?.()?.byOutlet?.values?.()||[])for(const p of s)byDate.set(p.date,(byDate.get(p.date)||0)+p.gross);const d=[...byDate.keys()].sort().slice(-14);if(d.length===14){const a=d.slice(7).reduce((s,x)=>s+byDate.get(x),0),b=d.slice(0,7).reduce((s,x)=>s+byDate.get(x),0),pct=b>0?(a/b-1)*100:0;trend={dir:pct>3?'naik':pct<-3?'turun':'stabil',pct:n1(Math.abs(pct))};}}catch{}
 TK.facts={wasteProd:wp&&{label:wp.label,rp:rpS(wp.nom)},lostProd:lp&&lp.lostHigh>0?{label:lp.label,pcs:Math.round((lp.lostLow+lp.lostHigh)/2).toLocaleString('id-ID')}:null,soldOut:h.items.filter(x=>x.habisRate>=60).sort((a,b)=>b.habisRate-a.habisRate).map(x=>({label:x.label,rate:Math.round(x.habisRate)})),areaW:aw&&{name:aw.name,pct:n1(aw.wastePct)},areaBest:ab&&{name:ab.name,pct:n1(ab.wastePct)},areaL:al&&{name:al.name},outletW:ow&&{name:ow.name,pct:n1(ow.wastePct)},outletL:ol&&{name:ol.name},trend,today,h:hourNow(),date:+today.slice(8),day:DAYS[dow],tomorrow:DAYS[nx],weekendToday:dow===0||dow===6,weekendTomorrow:nx===0||nx===6,weather:S.weather,weatherKnown:!!S.weatherReady,tomorrowW:S.weatherReady?S.weatherTomorrow:null,pull:S.lastPull,status:!!S.statusReady,waste:S.waste,lost:S.lost,wasteTrend:S.statusReady?S.wasteTrend:null,lostTrend:S.statusReady?S.lostTrend:null,wasteOutlets:S.wasteOutlets||[],lostOutlets:S.lostOutlets||[],plan:planCount(),model:!!S.modelReady,omzet,notSell:of('bad').map(x=>({label:x.label,pct:Math.round(x.wasteOfShip||0)})),slow:of('slow').map(x=>x.label),laris:of('win').map(x=>x.label),place:of('place').map(x=>x.label),who};
 TK.at=S.t;return TK.facts;
}
const canTalk=n=>n&&n.pose!=='away'&&n.pose!=='toilet'&&!n.leaving&&(!comes(n)||n.present);
function sayNow(n,text,sec){n.say=text;n.sayT=sec;n.talkUntil=S.t+sec;}
function talkState(n){if(n.pose==='nap'||n.pose==='sleepDesk')return 'nap';if(n.pose==='sofa')return 'sofa';if(n.pose==='sip'||n.food?.kind==='cup')return 'coffee';if(n.pose==='eat'||n.food)return 'eat';return null;}
const occupied=(x,y,skip)=>NPC.some(o=>!skip.includes(o)&&o.pose!=='away'&&((Math.round(o.x)===x&&Math.round(o.y)===y)||(o.path.length&&o.path.at(-1)[0]===x&&o.path.at(-1)[1]===y)));
// Tempat berdiri di depan/belakang lawan bicara (sprite hanya punya tampak depan & belakang).
function meetCell(h,v){const hx=Math.round(h.x),hy=Math.round(h.y);for(const [dx,dy] of [[0,1],[0,-1],[-1,0],[1,0]]){const x=hx+dx,y=hy+dy;if(x<0||y<0||x>=COLS||y>=ROWS||blocked.has(key(x,y))||occupied(x,y,[h,v]))continue;return [x,y];}return null;}
const KEEP_POSE=['sip','eat'];
function snap(n){n.path=[];const c=nearestFree(Math.round(n.x),Math.round(n.y));n.x=c[0];n.y=c[1];if(!KEEP_POSE.includes(n.pose))n.pose='stand';}
function faceEach(v,h){if(!h.path.length&&!KEEP_POSE.includes(h.pose))h.pose='stand';if(!v.path.length&&!KEEP_POSE.includes(v.pose))v.pose='stand';const dy=Math.round(v.y)-Math.round(h.y);v.face=dy>0?1:0;h.face=dy<0?1:0;}
function talkTo(n){
 const api=window.ForecastOfficeTalk;if(!api||!canTalk(n))return;
 if(TK.release&&TK.release.n!==n){const p=TK.release.n;TK.release=null;if(!p.inScene){p.held=0;if(!asleep())idle(p);}}
 const r=api.reply(n.id,talkFacts(),{state:talkState(n),task:n.task,asleep:asleep()},TK.memo),sec=api.dur(r.text)+.6;sayNow(n,r.text,sec);
 const ans=FC!==n&&canTalk(FC)&&!asleep()&&Math.random()<.5?api.fcReply(r.tag):null;
 TK.queue=ans?{at:S.t+sec,text:ans}:null;TK.release={n,f:FC,at:S.t+sec+(ans?api.dur(ans)+.3:0)+.8};
}
// Forecaster berjalan menghampiri karakter yang diklik, lalu keduanya saling menghadap.
function approach(n){
 if(!pickFC()||!canTalk(n))return;const f=FC;if(asleep()){S.sel=f.id;say(f,'Zzz... besok aja...',1.6);return;}
 if(n.inScene)endScene();
 const cell=meetCell(n,f);if(!cell){S.sel=f.id;say(f,'Nggak ada tempat buat ngobrol.',2);return;}
 holdF(f,40);f.task=`Menghampiri ${n.name}`;f.action='walk';send(f,'go',cell[0],cell[1]);S.sel=n.id;
 const g=f.gen;(async()=>{
  try{await walk(f,cell);}catch(e){if(e!==CANCEL)throw e;return;}
  if(f.gen!==g)return;f.pose='stand';
  if(Math.hypot(n.x-f.x,n.y-f.y)>1.6||!canTalk(n)){f.face=0;say(f,'Lho, sudah pergi duluan.',2);f.held=S.t+3;return;}
  cancel(n);n.ff=0;n.held=S.t+30;snap(n);faceEach(f,n);f.task=`Mengobrol dengan ${n.name}`;n.task=`Mengobrol dengan ${f.name}`;n.action='break';talkTo(n);
 })();
}
function sceneTimes(today){const r=seeded('jadwal-obrolan|'+today),base=Date.parse(today+'T07:00:00+07:00')/1000,end=base+15*3600,out=[];let t=base+20+r()*120;while(t<end){out.push(t);t+=120+Math.pow(r(),1.3)*480;}return out;}
function endScene(){const sc=TK.scene;TK.scene=null;TK.idx=-1;if(!sc)return;for(const n of sc.people){n.talkUntil=0;n.inScene=false;if(n.held>S.t)n.held=0;if(!asleep()&&(!comes(n)||(n.present&&!n.leaving)))idle(n);}}
function startScene(i,start,now){
 const api=window.ForecastOfficeTalk,ok=n=>canTalk(n)&&!held(n)&&!['nap','sleepDesk'].includes(n.pose)&&(n.pose!=='sofa'||isGuest(n))&&(!comes(n)||(n.present&&!n.leaving));
 let sc=null;try{TK.at=-99;sc=api.scene(i,talkFacts(),NPC.filter(ok).map(n=>n.id));}catch{sc=null;}
 if(!sc)return;let v=by(sc.lines[0].id),h=by(sc.lines.find(l=>l.id!==v.id)?.id);if(!v||!h)return;
 // Forecaster sedang bekerja, jadi biasanya NPC yang datang ke mejanya.
 if(isF(v)&&!isF(h)&&seeded(`datang|${TK.day}|${i}`)()<.7)[v,h]=[h,v];
 let cell=meetCell(h,v);if(!cell)return;
 for(const n of [v,h]){cancel(n);n.ff=0;n.inScene=true;if(n===h)snap(n);n.held=S.t+(start+WALK_IN+sc.total-now)+3;n.action='break';}cell=meetCell(h,v)||cell;
 v.task=`Menghampiri ${h.name}`;h.task=`Mengobrol dengan ${v.name}`;TK.scene={...sc,start,v,h,cell,people:[v,h]};TK.idx=-1;
 if(now-start>=WALK_IN-1){v.x=cell[0];v.y=cell[1];v.path=[];faceEach(v,h);v.task=`Mengobrol dengan ${h.name}`;return;}
 const g=v.gen;(async()=>{try{await walk(v,cell);}catch(e){if(e!==CANCEL)throw e;return;}if(v.gen!==g||TK.scene?.v!==v)return;faceEach(v,h);v.task=`Mengobrol dengan ${h.name}`;})();
}
function talkTick(sl){
 if(TK.queue&&S.t>=TK.queue.at){const q=TK.queue;TK.queue=null;if(canTalk(FC))sayNow(FC,q.text,window.ForecastOfficeTalk.dur(q.text));}
 if(TK.release&&S.t>=TK.release.at){const r=TK.release;TK.release=null;if(!r.n.inScene){r.n.held=0;if(!sl)idle(r.n);}if(r.f.held>S.t+3)r.f.held=S.t+3;}
 if(S.t<TK.next)return;TK.next=S.t+.2;const api=window.ForecastOfficeTalk;if(!api)return;if(sl){if(TK.scene)endScene();return;}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date()),now=Date.now()/1000;
 if(TK.day!==today){TK.day=today;TK.times=sceneTimes(today);TK.cur=null;}
 let i=-1;for(let j=TK.times.length-1;j>=0;j--)if(TK.times[j]<=now){i=j;break;}
 if(i!==TK.cur){if(TK.scene)endScene();TK.cur=i;if(i>=0&&now-TK.times[i]<WALK_IN+20)startScene(i,TK.times[i],now);}
 const sc=TK.scene;if(!sc)return;if(!sc.v.inScene||!sc.h.inScene){endScene();return;}
 const at=now-sc.start-WALK_IN;if(at<0)return;if(at>=sc.total){endScene();return;}
 if(Math.hypot(sc.v.x-sc.cell[0],sc.v.y-sc.cell[1])>.2){if(at>4)endScene();return;}
 let idx=0,sum=0;while(idx<sc.lines.length-1&&at>=sum+sc.lines[idx].dur){sum+=sc.lines[idx].dur;idx++;}
 if(idx===TK.idx)return;TK.idx=idx;faceEach(sc.v,sc.h);const l=sc.lines[idx],n=by(l.id),left=l.dur-(at-sum);
 for(const m of sc.people)m.talkUntil=S.t+sc.total-at;
 if(left>.7){n.say=l.text;n.sayT=left-.15;}
}
let wasSleep=null;
function update(dt){
 S.t+=dt;S.chatCd=Math.max(0,S.chatCd-dt);dutyTick();const sl=asleep();if(sl!==wasSleep){wasSleep=sl;sl?goSleep():startDay();}
 for(const n of NPC){n.sayT=Math.max(0,n.sayT-dt);n.moodT=Math.max(0,n.moodT-dt);foodTick(n,dt);
  if(n.path.length){const [tx,ty]=n.path[0],sp=(n.fast?5.2:3)*(n.spd||1)*dt,dx=tx-n.x,dy=ty-n.y,d=Math.hypot(dx,dy);if(Math.abs(dx)>Math.abs(dy))n.face=dx>0?3:2;else if(dy)n.face=dy>0?0:1;n.walkT+=dt*(n.fast?17:12);if(d<=sp){n.x=tx;n.y=ty;n.path.shift();if(!n.path.length&&n.wait?.walk){const w=n.wait;n.wait=null;n.fast=false;n.pose='stand';w.resolve();}}else{n.x+=dx/d*sp;n.y+=dy/d*sp;}}
  else if(n.wait&&!n.wait.walk){const w=n.wait;w.left-=dt;w.tick?.(clamp(1-w.left/w.total,0,1));if(w.left<=0){n.wait=null;w.resolve();}}
 }
 if(!sl)slotTick();
 talkTick(sl);
 for(const F of NPC)if(F.held&&!held(F)&&!F.path.length){F.held=0;F.directed=false;if(!sl&&F.present!==false&&!F.leaving&&!F.inScene)idle(F);}
 for(let i=waiters.length-1;i>=0;i--)if(waiters[i].f()){const w=waiters.splice(i,1)[0];w.r();}
}

// ===== Gambar karakter =====
const fe=(cx,cy,rx,ry,col,top=false)=>{for(let d=-ry;d<=(top?0:ry);d+=.5){const w=rx*Math.sqrt(Math.max(0,1-d*d/(ry*ry+.02)));R(cx-w,cy+d,w*2,.5,col);}};
function cupAt(x,y,lv){R(x-.5,y-.5,6,7,OL);R(x,y,5,6,'#f6f2ec');R(x,y,5,1.5,lv>.12?'#5a3826':'#d9cfc6');R(x+.5,y+2.5,1,2.5,'#e2d8cd');R(x+5.5,y+1.5,1.5,3,OL);R(x+5.5,y+2,.75,2,'#f6f2ec');if(lv>.35)for(let i=0;i<2;i++){const p=(S.t*.7+i/2)%1;R(x+1.5+i*2+Math.sin(S.t*3+i)*.7,y-2-p*5,.5,1.5,'rgba(255,255,255,.8)');}}
function packAt(x,y,lv){const h=3+4*lv,t=y+7-h;R(x-.5,t-.5,7,h+1,OL);R(x,t,6,h,'#c97b34');R(x,t,6,1,'#efc06a');R(x+1,t+1.5,4,1,'#fff0cf');R(x+4.5,t,1,h,'#a9642a');if(lv<.8){R(x+7,y+6,.5,.5,'#d9a875');R(x-2,y+6.5,.5,.5,'#d9a875');}}
const foodAt=(k,x,y,lv)=>k==='cup'?cupAt(x,y,lv):packAt(x,y,lv);
function deskFood(n){const f=n.food;if(!f||f.where!=='desk'||(n.sipT>0&&n.pose==='sit'))return;const [x,y]=DESK[n.id];foodAt(f.kind,x,y-1,f.left/f.total);}
function workItem(n,x,by){
 const yy=by-6,k=n.carry;if(!k)return;
 if(k==='crate'){box(x-8,yy-7,16,11,'#c99a63');R(x-7,yy-6,14,1.5,'#e2bd8b');R(x-2,yy-3,4,3,'#6ff5ac');R(x-7,yy+1,14,.5,'#a97c4c');}
 if(k==='paper'||k==='note'){box(x-6,yy-5,12,10,'#fbf9f1');R(x-4,yy-3,8,.5,'#9a9098');R(x-4,yy-1,8,.5,'#9a9098');R(x-4,yy+1,5,.5,k==='note'?'#4ba6dc':'#9a9098');}
 if(k==='folder'){box(x-7,yy-5,14,10,'#d9ae4f');R(x-6,yy-6,6,1.5,'#b98f34');R(x-4,yy-1,8,.5,'#8a6a1d');}
 if(k==='bento'){box(x-7,yy-4,14,9,'#7d4a3c');R(x-6,yy-3,12,7,'#f7efe1');R(x-5,yy-2,5,5,'#fff');R(x+1,yy-2,4,2,'#6fa86f');R(x+1,yy+1,4,2,'#d9824f');R(x+7,yy-6,.5,7,OL);}
}
function eye(n,ex,ey,o){
 if(o.closed){R(ex,ey+1.5,3.5,.5,OL);R(ex-.5,ey+1,.5,.5,OL);return;}
 const h=o.wide?3.5:3,l=clamp(o.look,-.5,.75);R(ex-.5,ey-.5,4.5,h+.75,'rgba(58,45,63,.55)');R(ex,ey,3.5,h,'#fbf6ee');R(ex+.75+l,ey+.25,2,h-.5,n.iris);R(ex+1.25+l,ey+.75,1,h-1.5,'#151016');R(ex+1+l,ey+.5,.5,.5,'#fff');
 if(o.lid){R(ex-.5,ey-.5,4.5,o.lid+.5,n.skinS);R(ex-.5,ey+o.lid-.25,4.5,.5,OL);}else R(ex-.5,ey-.5,4.5,.5,OL);
 if(o.bags)R(ex,ey+h+.5,3.5,.5,'rgba(92,62,84,.5)');
}
const brow=(x,y,w,tilt,col,th=.75)=>{R(x,y+(tilt>0?tilt:0),w/2,th,col);R(x+w/2,y+(tilt<0?-tilt:0),w/2,th,col);};
function mood2(n){const tasty=n.pose==='sip'||n.pose==='eat'||n.sipT>0,rest=n.pose==='sofa',sl=n.pose==='nap'||n.pose==='sleepDesk',talk=n.sayT>0&&!sl,alert=n===WAT&&watchLevel()>0,blink=Math.sin(S.t*1.1+n.bob*3)>.985;const o={...({esb:{wide:1},pawang:{wide:1},pred:{lid:.5},f1:{lid:.5},f2:{},watch:{lid:.5},mgr:{lid:.25},spv:{},guest:{}}[n.id]),closed:sl||blink||(rest&&Math.sin(S.t*.5+n.bob)>.35)};if(tasty)o.lid=Math.max(o.lid||0,1.25);if(alert||n.fast){o.lid=0;o.wide=1;}return {o,tasty,talk,sl,alert};}
function mouth(n,mx,my,st){const c1='#7b3f42',osc=Math.floor(S.t*9)%2;if(st.talk){R(mx-1.5,my,3,1.25+osc*.5,'#6b2f36');R(mx-1,my,2,.5,'#fff');}else if(n.pose==='eat'||(n.sipT>0&&n.food?.kind==='snack'))R(mx-1,my+.25,2,.5+osc*.5,c1);else if(st.sl)R(mx-.5,my+.25,1,.75,c1);else if(st.tasty||n===ESB||n===PAW||n===FE||n===SPV){R(mx-1.5,my,.5,.5,c1);R(mx-1,my+.5,2.25,.5,c1);R(mx+1.25,my,.5,.5,c1);if(n===ESB)R(mx-1,my,2.25,.5,'#fff');}else if(n===PRED||n===GUEST){R(mx-1,my+.5,2,.5,c1);R(mx+1,my,.75,.5,c1);}else if(n===FW){R(mx-1,my+.5,2,.5,c1);R(mx+1,my+.25,.5,.5,c1);}else R(mx-1,my+.5,2.5,.5,c1);}
function face(n,x,hy){
 const ey=hy-.5,st=mood2(n),o={...st.o,look:Math.sin(S.t*.6+n.bob)*.55},lx=x-5,rx=x+1.5,by=ey-2,bc=n===PAW?'#8fa8c8':n===WAT?'#7a3519':n===PRED?'#4c3a86':n.hair;
 eye(n,lx,ey,o);eye(n,rx,ey,o);
 if(n===ESB){brow(lx,by-.25,3.5,0,bc,1);brow(rx,by-.25,3.5,0,bc,1);}
 if(n===PAW){brow(lx,by-.25,3.5,.25,bc,.5);brow(rx,by-.75,3.5,-.5,bc,.5);}
 if(n===PRED){brow(lx,by+.25,3.5,0,bc,.5);brow(rx,by-.25,3.5,-.25,bc,.5);}
 if(n===WAT){brow(lx,by,3.5,st.alert?-.75:-.5,bc);brow(rx,by,3.5,st.alert?.75:.5,bc);}
 if(n.look?.hijab||n.look?.bob){const bw=n.look.bob?n.hair:'#4a3a33';brow(lx,by-.25,3.5,.25,bw,.5);brow(rx,by-.25,3.5,-.25,bw,.5);R(lx-.5,ey-.5,.75,.75,OL);R(rx+3.25,ey-.5,.75,.75,OL);}
 if(n.look?.crew||n.look?.mid){brow(lx,by,3.5,0,n.hair,.75);brow(rx,by,3.5,0,n.hair,.75);}
 if(n.look?.glasses==='round'){c.strokeStyle='#111114';c.lineWidth=.4;c.beginPath();c.arc(lx+1.75,ey+1.5,2.75,0,7);c.stroke();c.beginPath();c.arc(rx+1.75,ey+1.5,2.75,0,7);c.stroke();R(lx+4.5,ey+1.25,1.75,.4,'#111114');R(lx+.25,ey-.25,.75,.5,'rgba(255,255,255,.7)');R(rx+.25,ey-.25,.75,.5,'rgba(255,255,255,.7)');}
 else if(n.look?.glasses){c.strokeStyle='#17202f';c.lineWidth=.6;c.strokeRect(lx-.75,ey-.75,5,4.5);c.strokeRect(rx-.75,ey-.75,5,4.5);R(lx+4.25,ey+.75,1.5,.5,'#17202f');R(lx,ey-.5,1,.5,'rgba(255,255,255,.75)');R(rx,ey-.5,1,.5,'rgba(255,255,255,.75)');}
 if(n===FW){brow(lx,by,3.5,.25,bc);brow(rx,by,3.5,-.25,bc);c.strokeStyle='#17202f';c.lineWidth=.6;c.strokeRect(lx-.75,ey-.75,5,4.5);c.strokeRect(rx-.75,ey-.75,5,4.5);R(lx+4.25,ey+.75,1.5,.5,'#17202f');R(lx,ey-.5,1,.5,'rgba(255,255,255,.75)');}
 if(n===FE){brow(lx,by-.25,3.5,.25,'#5b4036',.5);brow(rx,by-.25,3.5,-.25,'#5b4036',.5);R(lx-.5,ey-.5,.75,.75,OL);R(rx+3.25,ey-.5,.75,.75,OL);}
 if(n===SPV){brow(lx,by-.25,3.5,.25,'#4a3a33',.5);brow(rx,by-.25,3.5,-.25,'#4a3a33',.5);R(lx-.5,ey-.5,.75,.75,OL);R(rx+3.25,ey-.5,.75,.75,OL);}
 if(n===MGR){brow(lx,by,3.5,0,'#1c1716',1);brow(rx,by,3.5,0,'#1c1716',1);}
 // Tamu: kacamata hitam
 if(n===GUEST){brow(lx,by-.75,3.5,-.25,'#2a1c22',.5);brow(rx,by-.75,3.5,.25,'#2a1c22',.5);R(lx-1.25,ey-1,6,4.75,OL);R(rx-1.25,ey-1,6,4.75,OL);R(lx-.75,ey-.5,5,3.75,'#14141a');R(rx-.75,ey-.5,5,3.75,'#14141a');R(lx+4.75,ey,1.5,.75,OL);R(lx-.25,ey,1.75,.75,'rgba(255,255,255,.55)');R(rx-.25,ey,1.75,.75,'rgba(255,255,255,.55)');}
 R(x-.25,hy+1.5,.75,1.5,n.skinS);R(x-6,hy+2.5,2,.75,'rgba(214,120,110,.26)');R(x+4,hy+2.5,2,.75,'rgba(214,120,110,.26)');mouth(n,x,hy+4.25,st);
 if(n===PRED){c.strokeStyle=OL;c.lineWidth=.5;c.beginPath();c.arc(lx+1.75,ey+1.5,3,0,7);c.stroke();c.beginPath();c.arc(rx+1.75,ey+1.5,3,0,7);c.stroke();R(lx+4.5,ey+1,1.25,.5,OL);R(lx,ey-.75,1,.5,'rgba(255,255,255,.75)');}
 if(n===WAT){R(x+6,hy+3.5,.75,.75,'#ffd166');}
 if(n===ESB){R(x-7.25,hy+3.5,.75,.75,'#ffd166');}
}
function curls(cx,cy,rx,ry,base,dark){for(let i=0;i<46;i++){const a=i*2.4,r=Math.sqrt((i+.5)/46),px=cx+Math.cos(a)*r*(rx-1),py=cy+Math.sin(a)*r*(ry-1);R(px,py,1.25,1,i%3?dark:base);if(i%5===0)R(px+.5,py-.5,.5,.5,'rgba(255,255,255,.2)');}}
function headBack(n,x,hy,f){
 if(n===ESB){fe(x,hy-4,12,10.5,OL);fe(x,hy-4,11.5,10,n.hair);curls(x,hy-4,11.5,10,'#3b2b2c','#171113');}
 if(n===PRED){R(x-8.5,hy-3,17,12.5,OL);R(x-8,hy-3,16,12,n.hair);R(x-8,hy+6,16,3,'#c98bd6');}
 if(n===PAW){fe(x,hy-1,8.5,8.5,OL);fe(x,hy-1,8,8,n.hair);R(x-9.5,hy+1,2.5,2,n.hair);R(x+7,hy,2.5,2,n.hair);}
 if(n===WAT&&f!==1){const sw=Math.sin(S.t*2.2+n.bob)*.75;fe(x+8+sw,hy-3,3,4.5,OL);fe(x+8+sw,hy-3,2.5,4,n.hair);fe(x+8.5+sw*1.5,hy+2,2,3.5,OL);fe(x+8.5+sw*1.5,hy+2,1.5,3,n.hair);R(x+5,hy-6,2.5,1,'#ffd166');}
}
const HJ=[[-8.75,3],[-8.25,4.75],[-7.5,6],[-6.5,7],[-4.5,7.75],[0,8],[4,8],[6.5,8.25],[8,8],[10,6.75],[12,4.25],[13.25,1.75]];
const hjW=d=>{for(let i=1;i<HJ.length;i++)if(d<=HJ[i][0]){const [a,u]=HJ[i-1],[b,v]=HJ[i];return u+(v-u)*(d-a)/(b-a);}return HJ[HJ.length-1][1];};
function hijab(x,hy,front,pal){
 const [base,dk,lt]=pal||['#e8809f','#cc5f86','#f8b3c9'];let prev=hjW(-8.75);R(x-prev,hy-9.25,2*prev,.5,OL);
 for(let d=-8.75;d<=13.25;d+=.5){const w=hjW(d),hi=Math.max(w,prev),lo=Math.min(w,prev);
  if(front&&d>-4.25&&d<6.75){const t=Math.abs(d-1.25)/5.5,o=5.6*Math.pow(1-Math.pow(t,3.2),1/3.2);R(x-w,hy+d,w-o,.5,base);R(x+o,hy+d,w-o,.5,base);R(x-o-.5,hy+d,.5,.5,dk);R(x+o,hy+d,.5,.5,dk);}
  else R(x-w,hy+d,2*w,.5,base);
  R(x-hi-.5,hy+d,hi-lo+.5,.5,OL);R(x+lo,hy+d,hi-lo+.5,.5,OL);prev=w;}
 R(x-prev,hy+13.75,2*prev,.5,OL);R(x-5,hy-7,3,.5,lt);R(x-6,hy-5.75,2,.5,lt);
 if(front){R(x-6.75,hy-1,.5,6,dk);R(x+6.25,hy-1,.5,6,dk);for(let i=0;i<9;i++)R(x-5+i*1.1,hy+7.25+i*.6,1.2,.5,dk);R(x+2,hy+7.5,3.5,.5,dk);R(x-5.5,hy+8,1,.5,lt);}
 else{R(x-5,hy-2.5,10,.5,dk);R(x-6,hy+2.5,12,.5,dk);for(let i=0;i<6;i++){R(x-5+i*.85,hy+6.5+i,.75,.5,dk);R(x+4.25-i*.85,hy+6.5+i,.75,.5,dk);}}
}
function hair(n,x,hy,f){
 const h=n.hair,hl='rgba(255,255,255,.16)';
 if(f===1){
  if(n===ESB){fe(x,hy-4,11.5,10,h);fe(x,hy+1,8,6,h);curls(x,hy-3,11.5,11,'#3b2b2c','#171113');return;}
  fe(x,hy,7.5,7.5,h);R(x-4,hy-5,3,.75,hl);R(x+1,hy-3,2,.75,hl);
  if(n===PRED){R(x-8,hy-1,16,10,h);R(x-8,hy+6,16,3,'#c98bd6');for(let i=-6;i<7;i+=3)R(x+i,hy,.5,8,'rgba(255,255,255,.09)');}
  if(n===PAW){R(x-8,hy+1,16,5,h);for(let i=-7;i<8;i+=3)R(x+i,hy+5.5,2,1.5,h);R(x-8,hy-5,16,1.25,'#2f4a66');}
  if(n===WAT){const sw=Math.sin(S.t*2.2+n.bob)*.75;R(x-1.5,hy-7,3.5,1.25,'#ffd166');fe(x+sw,hy-1,3,5,OL);fe(x+sw,hy-1,2.5,4.5,n.hair);fe(x+sw*1.5,hy+5,2,3.5,OL);fe(x+sw*1.5,hy+5,1.5,3,n.hair);}
  if(n===FW){for(const [a,b] of [[-6,-8],[-2,-8.5],[2,-8],[5,-6.5]])R(x+a,hy+b,2,2.25,h);}
  if(n===FE)hijab(x,hy,false);
  if(n===SPV)hijab(x,hy,false,n.hj);
  if(n===MGR){R(x-7,hy-6,14,3,h);R(x-8,hy-2,16,6,h);}
  if(n===GUEST){R(x-8,hy-1,16,14,h);R(x-8,hy+12,16,1,'#3e2a32');R(x-4,hy-5,3,.75,hl);}
  if(n.look?.hijab)hijab(x,hy,false,n.hj);
  if(n.look?.crew){R(x-7.5,hy-5,15,7,h);for(let i=-6;i<7;i+=2)R(x+i,hy-4,.5,5,'rgba(255,255,255,.1)');}
  if(n.look?.mid){R(x-7.75,hy-6,15.5,9.5,h);for(const [a,b2] of [[-5,-8.25],[-1.5,-8.75],[2.5,-8.25]])R(x+a,hy+b2,3,2.5,h);R(x-7.75,hy+3,15.5,.75,'rgba(0,0,0,.2)');R(x-4,hy-5,3,.75,hl);}
  if(n.look?.bob){R(x-8,hy-1,16,9,h);R(x-8,hy+7.5,16,1,'rgba(0,0,0,.18)');R(x-4,hy-5,3,.75,hl);}
  return;
 }
 if(n===ESB){fe(x,hy-4,11.5,6,h,true);R(x-11,hy-5,22,2,h);fe(x-7.5,hy-3,3.5,2.5,h);fe(x+7.5,hy-3,3.5,2.5,h);fe(x-2.5,hy-4,3,2,h);fe(x+3,hy-4,3,2,h);curls(x,hy-6,11,6,'#3b2b2c','#171113');}
 if(n===PRED){fe(x,hy-1.5,7.5,6,h,true);R(x-8,hy-2,3,10,h);R(x+5,hy-2,3,10,h);R(x-8,hy+6,3,3,'#c98bd6');R(x+5,hy+6,3,3,'#c98bd6');R(x-6.5,hy-3,13,1.5,h);R(x-5,hy-6,3,.75,hl);}
 if(n===PAW){fe(x,hy-1.5,7.5,6,h,true);R(x-8,hy-2,2.25,4,h);R(x+5.75,hy-2,2.25,4,h);for(const [a,b] of [[-6.5,-3],[-3,-2.5],[.5,-3],[3.5,-2.5]])R(x+a,hy+b,3,1.75,h);R(x-6,hy-7,12,2.5,'#2f4a66');R(x-5,hy-6.75,4,2,'#9fe0ff');R(x+1,hy-6.75,4,2,'#9fe0ff');R(x-4.5,hy-6.5,1,.5,'#fff');R(x+1.5,hy-6.5,1,.5,'#fff');}
 if(n===WAT){fe(x,hy-1.5,7.5,6,h,true);R(x-7.5,hy-2,1.5,3.5,h);R(x+6,hy-2,1.5,3.5,h);R(x-6.5,hy-3.25,9,1.5,h);R(x-6.5,hy-2,4,.75,h);R(x-1,hy-6,4,.75,hl);}
 if(n===FW){fe(x,hy-1.5,7.5,6,h,true);R(x-7.5,hy-2,1.75,3.5,h);R(x+5.75,hy-2,1.75,3.5,h);for(const [a,b] of [[-6.5,-8],[-3,-8.75],[1,-8.5],[4.5,-7]])R(x+a,hy+b,2,2.25,h);R(x-5.5,hy-3.25,2.5,1.75,h);R(x-2.25,hy-3,3,1.25,h);R(x+1.5,hy-3.25,3.5,1.75,h);R(x-2,hy-6,3,.75,hl);}
 if(n===FE)hijab(x,hy,true);
 if(n===SPV)hijab(x,hy,true,n.hj);
 if(n.look?.hijab)hijab(x,hy,true,n.hj);
 if(n.look?.crew){fe(x,hy-2,7.5,5.5,h,true);R(x-7.25,hy-2.75,1.25,2.5,h);R(x+6,hy-2.75,1.25,2.5,h);R(x-6,hy-3.5,12,1,h);for(let i=-5;i<6;i+=2)R(x+i,hy-6.5,.5,1.5,'rgba(255,255,255,.14)');}
 if(n.look?.mid){fe(x,hy-2,7.75,6,h,true);for(const [a,b2,w] of [[-5.5,-8.75,3],[-2,-9.25,3.5],[2,-8.75,3],[4.5,-7.5,2.5]])R(x+a,hy+b2,w,2.5,h);R(x-7.75,hy-3,1.75,3.5,h);R(x+6,hy-3,1.75,3,h);R(x-6.75,hy-4,6.5,2,h);R(x-1,hy-3.5,3.5,1.25,h);R(x-6.75,hy-2.25,1.25,1.25,h);R(x-2.5,hy-7.75,3,.75,hl);R(x+2.5,hy-7,2,.75,hl);}
 if(n.look?.bob){fe(x,hy-1.5,7.5,6,h,true);R(x-8.5,hy-2,2.5,9.5,h);R(x+6,hy-2,2.5,9.5,h);R(x-7,hy-3.5,7.5,2.25,h);R(x+.5,hy-3.25,5.5,1.5,h);R(x-4,hy-6,3,.75,hl);}
 if(n===GUEST){fe(x,hy-1.5,7.5,6,h,true);R(x-8.5,hy-2,2.5,13,h);R(x+6,hy-2,2.5,13,h);R(x-6.5,hy-3.5,10,2,h);R(x+2.5,hy-3,3.5,1.25,h);R(x-4,hy-6,3,.75,hl);}
 if(n===MGR){fe(x,hy-1.5,7.5,6,h,true);R(x-7.5,hy-2,1.5,3,h);R(x+6,hy-2,1.5,3,h);R(x-6.5,hy-3.25,13,1.75,h);R(x+1,hy-6.5,.75,4,'rgba(255,255,255,.22)');R(x-5,hy-5.5,4,.75,hl);}
}
function torso(n,x,by,f){
 const b=n.bw,t=by-12,tp=n.look?.top;R(x-b-.5,t+1,2*b+1,12,OL);fe(x,t+2,b+.5,2.5,OL,true);R(x-b,t+1.5,2*b,11,n.shirt);fe(x,t+2,b,2,n.shirt,true);R(x+b-1.5,t+1.5,1.5,11,n.shade);R(x-b,by-1,2*b,1,n.shade);
 if(n===ESB){R(x-b,by-1.5,2*b,1.5,'#26222a');if(f===0){R(x-2.5,t+2,5,10,n.inner);R(x-.25,t+2,.5,10,'#c9c4b8');fe(x,t+6,2.5,2.5,'#ffd166');R(x-b,t+2,2,1,'#26222a');R(x+b-2,t+2,2,1,'#26222a');}else{R(x-3,t+5,6,3,'#26222a');R(x-2,t+6,4,1,'#ffd166');}}
 if(n===PRED){for(let i=0;i<3;i++)R(x-b,t+4+i*3,2*b,.75,n.inner);if(f===0){R(x-2.5,t+1.5,5,1.5,'#d8cbb0');}}
 if(n===PAW){if(f===0){R(x-.25,t+2,.5,10,n.inner);R(x-b+1,t+7,2.5,1.5,n.shade);R(x+b-3.5,t+7,2.5,1.5,n.shade);}R(x-b,t+6,2*b,.75,n.inner);fe(x,t+2,5.5,2.25,OL);fe(x,t+2,5,1.75,'#ff7b6e');R(x-5,t+2,10,.75,'#e85f54');}
 if(n===WAT){if(f===0){R(x-2,t+1.5,4,4.5,n.inner);R(x-.5,t+2,1,4,'#2b2732');R(x+b-3.5,t+5,2,1,'#e6c35c');}else R(x-.25,t+3,.5,9,n.shade);}
 if(n===FW){for(let i=0;i<4;i++)R(x-b,t+3+i*2.75,2*b,.5,'#6c8cc8');for(let i=-1;i<2;i++)R(x+i*3.25,t+2,.5,10,'#6c8cc8');for(let i=0;i<3;i++)R(x-b,t+4.5+i*2.75,2*b,.25,'#c9554f');if(f===0){R(x-2.25,t+2,4.5,10,n.inner);R(x-.25,t+2,.5,10,'#c9cdd2');R(x-3,t+1.5,1.75,2,n.shade);R(x+1.25,t+1.5,1.75,2,n.shade);}else R(x-3.5,t+1.5,7,1.5,n.shade);}
 if(n===GUEST){if(f===0){R(x-2.25,t+2,4.5,10,n.inner);R(x-2.75,t+2,.75,10,'#45454f');R(x+2,t+2,.75,10,'#45454f');R(x-.5,t+3,1,1,'#c9b26a');}else R(x-b,t+5,2*b,.5,'#45454f');}
 if(tp==='apron'){if(f===0){R(x-b+1,t+5,2*b-2,8,'#8a5a3b');R(x-b+1,t+5,2*b-2,.75,'#6e4529');R(x-2,t+8.5,4,2.5,'#a8744f');R(x-b+1.5,t+1.5,1,3.5,'#8a5a3b');R(x+b-2.5,t+1.5,1,3.5,'#8a5a3b');R(x-1,t+9,2,.5,'#f3e7cf');}else{R(x-b,t+7,2*b,.75,'#8a5a3b');R(x-1,t+7.5,2,1.5,'#8a5a3b');}}
 if(n===MGR){if(f===0){fe(x,t+2,2.75,1.25,n.skinS);R(x+1.5,t+5,2.5,2,'#3d3d46');}else R(x-.25,t+3,.5,9,n.shade);}
 if(tp==='kemeja'){if(f===0){R(x-3,t+1.5,2.5,1.75,'#ffffff');R(x+.5,t+1.5,2.5,1.75,'#ffffff');R(x-.25,t+3,.5,9,n.shade);for(let i=0;i<3;i++)R(x-.25,t+4.5+i*2.5,.5,.5,'#5d7290');R(x-b+1.25,t+5,2.5,2,n.shade);}else R(x-3.5,t+1.5,7,1.25,'#ffffff');}
 if(tp==='canvas'){if(f===0){R(x-2.25,t+2,4.5,10,n.inner);R(x-2.75,t+2,.75,10,n.shade);R(x+2,t+2,.75,10,n.shade);R(x-b+.75,t+6.5,2.5,2.5,n.shade);R(x+b-3.25,t+6.5,2.5,2.5,n.shade);R(x-b+.75,t+6.5,2.5,.5,'#6d532f');R(x+b-3.25,t+6.5,2.5,.5,'#6d532f');R(x-b,t+1.5,2.25,1.25,'#8e6c3e');R(x+b-2.25,t+1.5,2.25,1.25,'#8e6c3e');}else{R(x-b,t+1.5,2*b,1.25,n.shade);R(x-.25,t+3,.5,9,n.shade);}R(x-b,by-1.5,2*b,1,'#6d532f');}
 if(tp==='flannel'){for(let i=0;i<4;i++)R(x-b,t+3+i*2.75,2*b,.5,'#6e1f1f');for(let j=0;j<4;j++)R(x-b+1+j*2.75,t+1.5,.5,11,'#6e1f1f');for(let i=0;i<3;i++)R(x-b,t+4.25+i*2.75,2*b,.25,'#e0a080');if(f===0){R(x-2.25,t+2,4.5,10,n.inner);R(x-2.75,t+2,.75,10,'#6e1f1f');R(x+2,t+2,.75,10,'#6e1f1f');fe(x,t+2,2.25,1,n.skinS);}}
 if(tp==='tee'){if(f===0){fe(x,t+2,2.75,1.25,n.skinS);R(x-1.75,t+5,3.5,3,'#fff3d6');R(x-1.25,t+5.5,2.5,2,'#c9473f');R(x-.5,t+6,1,1,'#fff3d6');}}
 if(tp==='jacket'){R(x-b,t+1.5,2*b,1.25,'#243429');R(x-b,by-1.75,2*b,1.75,'#243429');if(f===0){fe(x,t+2,2,1.25,n.inner);R(x-.25,t+3,.5,9,'#c9c2b0');R(x-b+1.5,t+6.5,.5,3,n.shade);R(x+b-2,t+6.5,.5,3,n.shade);R(x+b-3,t+3,2,.75,'#c9473f');}else R(x-.25,t+3,.5,8,n.shade);}
 if(tp==='blazer'){if(f===0){R(x-2.5,t+2,5,10,n.inner);R(x-3,t+2,1,5.5,n.shade);R(x+2,t+2,1,5.5,n.shade);R(x-.5,t+8.5,1,1,'#e8d9a0');R(x-1.25,t+2.5,2.5,.75,'#d8b26a');}else R(x-.25,t+3,.5,9,n.shade);}
 if(n===FE||n===SPV||tp==='tunic'||tp==='apron'){const ac=n.hj?n.hj[0]:'#e8809f',ac2=n.hj?n.hj[2]:'#d9a4b8';R(x-b-.75,by-1.5,2*b+1.5,3.5,OL);R(x-b-.25,by-1.5,2*b+.5,3,n.shirt);R(x+b-1,by-1.5,1,3,n.shade);if(f===0){R(x-.25,t+5,.5,8,ac2);for(let i=0;i<3;i++)R(x-.5,t+6+i*2,1,.75,ac);}R(x-b,by+.75,2*b,.5,ac);}
}
function cloud(x,y,front=false){
 const col=S.weather==='hujan'?'#98a4b8':S.weather==='mendung'?'#d3d9e2':'#ffffff',sh=S.weather==='hujan'?'#76839a':S.weather==='mendung'?'#b4bdca':'#d7e8f6',pts=front?[[-8,1,4,2.5],[0,2,5,2.5],[8,1,4,2.5]]:[[-10,0,5,3.5],[-4,-2,6,4.5],[4,-2,6,4.5],[10,0,5,3.5],[0,1,10,3.5]];
 for(const [a,b,r,q] of pts)fe(x+a,y+b,r+.5,q+.5,OL);for(const [a,b,r,q] of pts)fe(x+a,y+b,r,q,col);if(!front){R(x-12,y+2,24,1.5,sh);R(x-7,y-5,4,.75,'#fff');}
 if(front)return;
 if(S.weather==='hujan'){for(let i=0;i<5;i++)R(x-8+i*4,y+5+((S.t*12+i*1.7)%4),.5,1.75,'#8fd0f5');if(Math.sin(S.t*1.7)>.93){R(x+1,y+4,2,1.5,'#ffd84d');R(x,y+5.5,2,1.5,'#ffd84d');}}
 else for(let i=0;i<3;i++){const p=(S.t*.6+i/3)%1;R(x-7+i*7,y+4+p*3,1,.5,'rgba(255,255,255,.65)');}
}
const bounceOf=(n,moving,working)=>{const rate=n===ESB?7:n===PAW?2:n===WAT?2.2:1.7,amp=moving?(n===ESB?2:n===PAW?.5:1.5):(working?(n===ESB?.75:.3):.45);return moving?Math.abs(Math.sin(n.walkT))*amp:Math.abs(Math.sin(S.t*rate+n.bob))*amp;};
const hover=n=>(Math.sin(S.t*2+n.bob)+1)*1.1;
function drawFront(n,x,y,f,atTable){
 const moving=n.path.length>0,sit=['sit','sofa','sleepDesk'].includes(n.pose)||atTable,working=n.wait&&!n.wait.walk&&n.action==='type',floats=n===PAW,yy=half(floats?y-hover(n):y-bounceOf(n,moving,working));
 if(n.pose!=='nap')ell(x,y+1,floats?10:8,2,'rgba(58,45,63,.24)');
 if(floats)cloud(x,n.pose==='sleepDesk'?yy-9:yy-3);
 if(!sit&&!floats){const a=moving?Math.sin(n.walkT)*2:0,L=6+n.tall,lg=(lx,dy)=>{R(lx-.5,yy-L+Math.max(dy,0)-.5,4,L+.5-Math.max(dy,0),OL);R(lx,yy-L+Math.max(dy,0),3,L-1-Math.max(dy,0),n.pants);R(lx-.5,yy-1.5,4.5,2,OL);R(lx,yy-1.25,3.5,1.25,n.shoes);};lg(x-4,a);lg(x+1,-a);}
 if(sit&&atTable&&!floats){R(x-5,y-1,11,4,OL);R(x-4,y,9,2,'#c99a63');}
 if(n.pose==='sleepDesk'){const py=floats?yy-3:yy;if(!floats){R(x-8,y-13,16,14,OL);R(x-7.5,y-12.5,15,12.5,'#5f5868');R(x-7.5,y-12.5,15,1.5,'#7f7788');R(x-1.5,y+1,3,2,OL);}fe(x,py-13,n.bw+1,6.5,OL);fe(x,py-13,n.bw+.5,6,n.shirt);if(n===ESB){fe(x,py-22,12,9,OL);fe(x,py-22,11.5,8.5,n.hair);curls(x,py-22,11.5,8.5,'#3b2b2c','#171113');}else{fe(x,py-20,8,7,OL);fe(x,py-20,7.5,6.5,n.hair);}if(n===WAT){fe(x,py-27,2.5,2.5,OL);fe(x,py-27,2,2,n.hair);}R(x-11,py-16,22,3,OL);R(x-10.5,py-15.5,21,2,n.shirt);R(x-3,py-15.5,6,2,n.skin);if(floats)cloud(x,yy-7,true);return;}
 const by=floats?yy-8:yy-(sit?2:6+n.tall),slump=0,hx=x+(n===PRED&&!moving?Math.sin(S.t*.5+n.bob)*.75:n===WAT&&!moving?(Math.sin(S.t*.8+n.bob)>.65?1.5:Math.sin(S.t*.8+n.bob)<-.65?-1.5:0):0),hy=by-19+slump;
 if(floats){const sw=Math.sin(S.t*5);for(let i=0;i<4;i++)R(x+5+i*2.5,by-10+i*.8+Math.sin(S.t*5+i)*.9,2.75,2,i%2?'#e85f54':'#ff7b6e');void sw;}
 headBack(n,hx,hy,f);torso(n,x,by,f);
 if(floats){R(x-3.5,by-.5,3,3,OL);R(x+.5,by-.5,3,3,OL);R(x-3,by,2,2,n.shoes);R(x+1,by,2,2,n.shoes);cloud(x,yy-1,true);}
 if(n.pose==='sit'&&f===1&&!floats){R(x-8,y-11,16,12,OL);R(x-7.5,y-10.5,15,10.5,'#5f5868');R(x-7.5,y-10.5,15,1.5,'#7f7788');R(x-1.5,y+1,3,2,OL);}
 const act=n.wait&&!n.wait.walk?n.action:null,tk=Math.floor(S.t*(act==='type'?(n===ESB?13:n===PAW?7:9):4))%2,b=n.bw,hand=(a,d)=>{R(a-.5,d-.5,3.5,3.5,OL);R(a,d,2.5,2.5,n.skin);},sleeve=(a,d,len)=>{R(a-.5,d-.5,3.5,len+.5,OL);R(a,d,2.5,len-.5,n.shirt);},food=n.food,inHand=food&&n.pose!=='nap'&&(food.where==='hand'||(n.sipT>0&&n.pose==='sit')),sipping=inHand&&n.sipT>0,scratch=n===FW&&working&&Math.sin(S.t*.9)>.93;
 if(n.pose==='nap'){sleeve(x-b-2,by-10,7);hand(x-b-2,by-3.5);sleeve(x+b-.5,by-10,7);hand(x+b-.5,by-3.5);}
 else if(act==='type'&&f===1&&!sipping){if(scratch){sleeve(x+b,by-16,7);hand(x+3,hy-6);hand(x-b-2,by-13);}else{hand(x-b-2,by-14+tk);hand(x+b-.5,by-13-tk);}}
 else if((act==='write'||act==='point'||act==='reach')&&f===1){sleeve(x+b-.5,by-18,8);hand(x+b-.5+(tk?.5:-.5),by-21);sleeve(x-b-2,by-10,7);hand(x-b-2,by-4);if(act==='write')R(x+b+2,by-25,.75,4,'#d6443a');if(act==='point')R(x+b,by-24,1,3,n.skin);}
 else if(n.carry){sleeve(x-b-2,by-10,6);sleeve(x+b-.5,by-10,6);hand(x-b-2,by-5);hand(x+b-.5,by-5);}
 else{const q=moving?Math.sin(n.walkT)*2:0;sleeve(x-b-2,by-10+q,7);hand(x-b-2,by-3.5+q);if(inHand){const up=sipping?-6:-2;sleeve(x+b-.5,by-10+up/2,6);hand(x+b-.5,by-5+up);}else{sleeve(x+b-.5,by-10-q,7);hand(x+b-.5,by-3.5-q);}}
 R(hx-2,hy+6.5,4,2,n.skinS);fe(hx,hy,7.5,7.5,OL);fe(hx,hy,7,7,n.skin);R(hx+4.5,hy+2,2,2.5,n.skinS);if(f!==1){R(hx-8,hy+.5,1.5,3,n.skinS);R(hx+6.5,hy+.5,1.5,3,n.skinS);face(n,hx,hy);}hair(n,hx,hy,f);
 if(n===WAT&&n.pose!=='sit'&&n.pose!=='nap'&&!n.carry&&!inHand&&f!==1){box(x+b+1,by-11,7,9,'#f3e7c4');R(x+b+3,by-12,3,1.5,'#7a5a3c');R(x+b+2,by-8,5,.5,'#a08f70');R(x+b+2,by-6,4,.5,'#a08f70');}
 workItem(n,x,by);
 if(inHand){const lv=food.left/food.total;let fx,fy;if(sipping){fx=f===1?x+b+1:x+2;fy=hy+1;}else{fx=x+b+1;fy=by-9;}if(n.carry){fx=x+b+2;fy=by-14;}foodAt(food.kind,fx,fy,lv);}
 if(n.moodT&&n.mood==='alert'){const ay=hy-(n===ESB?17:13);R(x-1,ay-3,2.5,6,'#e5483e');R(x-1,ay+4,2.5,2,'#e5483e');}
 if(n.moodT&&n.mood==='star'){const ay=hy-(n===ESB?17:13);R(x-3,ay+1,1.5,1.5,'#58b878');R(x-1.5,ay+2.5,1.5,1.5,'#58b878');R(x,ay+1,1.5,1.5,'#58b878');R(x+1.5,ay-.5,1.5,1.5,'#58b878');}
}
function drawNap(n){
 const breath=Math.sin(S.t*1.7)*.5;c.save();c.translate(20*T+13,10*T+23+breath*.3);c.rotate(-Math.PI/2);drawFront(n,0,0,0,false);c.restore();
 R(317,10*T+15-breath,19,15+breath,OL);R(318,10*T+16-breath,17,13+breath,'#d98c78');for(let i=0;i<3;i++)R(322+i*5,10*T+16-breath,1.5,13+breath,'#eeb29f');R(318,10*T+16-breath,2,13+breath,'#fbe7d8');
}
function drawNPC(n){
 if(n.pose==='toilet'||n.pose==='away')return;if(n.pose==='nap')return drawNap(n);
 const sofa=n.pose==='sofa',x=Math.round(n.x*T+8),y=Math.round(n.y*T+14-(sofa?8:0)),atTable=n.pose==='eat'&&n.slot&&SPOT.eat.some(q=>key(q[0],q[1])===n.slot);
 drawFront(n,x,y,n.face>=2?0:n.face,atTable);
}
// ===== Overlay teks =====
function rr(x,y,w,h,r,col){out.fillStyle=col;out.beginPath();out.roundRect(x,y,w,h,r);out.fill();}
function txt(s,x,y,size,col,a='center',wt=800){out.fillStyle=col;out.font=`${wt} ${size}px ui-rounded,"Segoe UI",system-ui,sans-serif`;out.textAlign=a;out.textBaseline='alphabetic';out.fillText(s,x,y);}
const tagBoxes=[];
function tag(n){
 if(n.pose==='toilet'||n.pose==='away')return;const sofa=n.pose==='sofa'||n.pose==='nap',px=((n.x+OX)*T+8)*Z,py=(n.y*T+14-(sofa?8:0))*Z,name=n.name,sel=S.sel===n.id,dozing=n.pose==='sleepDesk'||n.pose==='nap';
 out.font='800 18px ui-rounded,"Segoe UI",system-ui,sans-serif';const w=out.measureText(name).width+16,x=clamp(px-w/2,6,view.width-w-6);let y=py+12;while(tagBoxes.some(b=>x<b.x+b.w&&x+w>b.x&&y<b.y+27&&y+27>b.y))y+=29;tagBoxes.push({x,y,w});
 if(!dozing||sel){rr(x,y,w,26,13,sel?n.color:'rgba(58,45,63,.88)');txt(name,x+w/2,y+19,18,sel?'#2b2130':'#fff');}
 if(n.p!=null&&n.action!=='break'){const bw=88,bx=clamp(px-bw/2,6,view.width-bw-6),by=py-(sit(n)?140:150);rr(bx,by,bw,14,7,'#3a2d3f');rr(bx+3,by+3,Math.max(5,(bw-6)*n.p),8,4,n.color);}
 if(n.pose==='sleepDesk'||n.pose==='nap'){for(let i=0;i<3;i++){const p=(S.t*.45+i/3)%1;out.globalAlpha=1-p;txt('z',px+28+p*38,py-68-p*58,22+p*20,'#e7e0ff');out.globalAlpha=1;}}
 if(n.directed&&held(n)&&!n.inScene&&!/^Mengobrol/.test(n.task)){const top=n.pose==='nap'?py-104:sit(n)?py-126:py-150,yy=top-(n.p!=null&&n.action!=='break'?22:0)+Math.sin(S.t*5)*3;out.save();out.lineJoin='round';out.strokeStyle='#2b2130';out.lineWidth=5;out.fillStyle='#ffe14d';out.beginPath();out.moveTo(px-10,yy);out.lineTo(px+10,yy);out.lineTo(px,yy+13);out.closePath();out.stroke();out.fill();out.fillStyle='rgba(255,255,255,.75)';out.beginPath();out.moveTo(px-6,yy+2);out.lineTo(px+1,yy+2);out.lineTo(px-2,yy+6);out.closePath();out.fill();out.restore();}
}
const sit=n=>['sit','sofa','sleepDesk','nap'].includes(n.pose);
function wrapSay(s,max){const words=String(s).split(' '),out2=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(cur&&out.measureText(t).width>max){out2.push(cur);cur=w;}else cur=t;}if(cur)out2.push(cur);return out2;}
function bubble(n){
 const px=((n.x+OX)*T+8)*Z,base=(n.pose==='toilet'?(10*T+8)*Z:(n.y*T+14)*Z-(n.pose==='sofa'?32:0))-(n.directed&&held(n)?180:152);out.font='800 23px ui-rounded,"Segoe UI",system-ui,sans-serif';const lines=wrapSay(n.say,Math.min(470,view.width-60)),w=Math.max(...lines.map(l=>out.measureText(l).width))+30,h=14+lines.length*28,x=clamp(px-w/2,8,view.width-w-8),y=Math.max(8,base-h);
 out.globalAlpha=Math.min(1,n.sayT*4);rr(x,y,w,h,18,'#fffdf8');out.strokeStyle='#3a2d3f';out.lineWidth=3.5;out.stroke();out.fillStyle='#fffdf8';const tx=clamp(px,x+18,x+w-18);out.beginPath();out.moveTo(tx-10,y+h-2);out.lineTo(tx+10,y+h-2);out.lineTo(tx,y+h+12);out.closePath();out.fill();out.strokeStyle='#3a2d3f';out.beginPath();out.moveTo(tx-10,y+h-1);out.lineTo(tx,y+h+12);out.lineTo(tx+10,y+h-1);out.stroke();lines.forEach((l,i)=>txt(l,x+w/2,y+29+i*28,23,'#3a2d3f'));out.globalAlpha=1;
}
let lightC=null,lightAt=-9,lightKey='';
function lighting(){
 const h=hourNow();let a=0;if(h>=19||h<5)a=.62;else if(h>=17)a=(h-17)/2*.62;else if(h<7)a=(7-h)/2*.62;else if(S.weather==='hujan')a=.16;else if(S.weather==='mendung')a=.08;if(!a)return;const sl=asleep();
 c.save();c.globalCompositeOperation='multiply';c.fillStyle=`rgba(${sl?'52,44,104':'82,70,140'},${a})`;c.fillRect(-OX*T,0,VWT,VH);c.globalCompositeOperation='lighter';
 if(!lightC){lightC=document.createElement('canvas');lightC.width=VW;lightC.height=VH;}
 if(S.t-lightAt>.25||lightKey!==a+'|'+sl){lightAt=S.t;lightKey=a+'|'+sl;const main=c;c=lightC.getContext('2d');c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,VW,VH);c.globalCompositeOperation='lighter';
 const glow=(x,y,r,col,k)=>{const g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,`rgba(${col},${k})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);};
 const lamp=a*(sl?.05:.3);[[60,110],[150,110],[240,110],[140,210],[330,80],[310,200],[370,200]].forEach(([x,y])=>glow(x,y,74,'255,210,160',lamp));
 const scr=a*(sl?.14:.42);[[50,92],[112,92],[176,92],[240,92],[142,190]].forEach(([x,y])=>glow(x,y,26,'150,225,255',scr));
 const fl=['255,143,171','255,209,102','123,223,242','184,242,141','205,180,246'];for(let i=0;i<26;i+=2){const x=16+i*(VW-32)/25,y=9+Math.abs(Math.sin(i*.62))*5;glow(x,y,11,fl[i%5],a*(.45+Math.sin(S.t*2+i)*.1));}
 c=main;}
 c.imageSmoothingEnabled=true;c.drawImage(lightC,0,0,VW,VH);c.imageSmoothingEnabled=false;
 c.restore();
}
function render(){
 c=lc;c.imageSmoothingEnabled=false;c.drawImage(bgC,0,0,VWT,VH);c.save();c.translate(OX*T,0);windowP(19*T+2,6,40,22);fairy();rack();whiteboard();board();radar();
 const items=[...PROPS.map(p=>({y:p.y,d:p.d})),...NPC.map(n=>({y:n.y*T+14,d:()=>drawNPC(n)}))].sort((a,b)=>a.y-b.y);items.forEach(i=>i.d());
 const busy=NPC.some(n=>n.pose==='toilet');box(21*T+3,13*T+1,10,15,busy?'#ff8177':'#7ad192');R(21*T+5,13*T+4,6,2,'#fff');R(21*T+6,13*T+10,4,1,'#fff');lighting();c.restore();
 out.setTransform(1,0,0,1,0,0);out.imageSmoothingEnabled=false;out.drawImage(low,0,0,view.width,view.height);tagBoxes.length=0;NPC.forEach(tag);NPC.filter(n=>n.sayT>0&&n.say&&n.pose!=='away').forEach(bubble);
}

// ===== Panel =====
$('roster').innerHTML=NPC.map(n=>`<button type="button" data-id="${n.id}"><span class="dot" style="background:${n.color}"></span><b></b><small></small><span class="bar"><i></i></span></button>`).join('');
$('roster').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.sel=b.dataset.id;const n=by(b.dataset.id);if(mine(n)&&ready(n))FC=n;});
const ACTIONS=[['kopi','☕','Bikin kopi'],['snack','🍩','Ambil snack'],['makan','🍱','Makan'],['sofa','🛋️','Duduk sofa'],['nap','😴','Tidur sofa'],['toilet','🚻','Toilet'],['kerja','💻','Balik kerja']];
$('dock').innerHTML=ACTIONS.map(([id,ic,l])=>`<button type="button" data-do="${id}"><span aria-hidden="true">${ic}</span>${l}</button>`).join('');
$('dock').addEventListener('click',e=>{const b=e.target.closest('button');if(b)playerDo(b.dataset.do);});
const lv=v=>v==='lewat'?['hot','Lewat ambang']:v==='waspada'?['mid','Mulai banyak']:['ok','Masih aman'];
function panel(){
 const h=hourNow();$('clock').textContent=hhmm(h);$('phase').textContent=asleep()?'Kantor tidur':h>=19?'Lembur malam':h>=16.5?'Sore':h<11?'Pagi':'Jam kerja';
 [...$('roster').children].forEach((b,i)=>{const n=NPC[i];// Owner 2026-11-27: karakter yang muncul hanya saat login (manajer, SPV, tamu) disembunyikan dari daftar bila tidak hadir.
 b.hidden=[MGR,SPV,GUEST,...GUESTS].includes(n)&&(n.present===false||n.pose==='away');b.className=S.sel===n.id?'sel':'';b.children[1].textContent=n.name;b.children[2].textContent=n.pose==='away'?shiftText(n):n===FC&&held(n)&&!n.wait&&!n.inScene&&!/^Meng/.test(n.task)?'Sedang diarahkan':n.task;b.querySelector('.bar i').style.width=n.p!=null?n.p*100+'%':'0';});
 const [a,b]=S.statusReady?lv(S.waste):['','Belum ada'],[d,e]=S.statusReady?lv(S.lost):['','Belum ada'],w=S.weatherReady?{cerah:'Cerah',mendung:'Mendung',hujan:'Hujan'}[S.weather]:'Memuat';$('stats').innerHTML=`<div class="stat"><span>Tarikan ESB</span><b>${S.lastPull?S.lastPull+' WIB':'Belum'}</b></div><div class="stat"><span>Cuaca</span><b>${w}</b></div><div class="stat"><span>Waste</span><b class="${a}">${b}</b></div><div class="stat"><span>Lost sales</span><b class="${d}">${e}</b></div><div class="stat" style="grid-column:1/-1"><span>Jadwal forecaster</span><b>${esc(FW.short||'Forecaster 1')}: ${shiftText(FW)}<br>${esc(FE.short||'Forecaster 2')}: ${shiftText(FE)}</b></div>`;const on=NPC.filter(n=>mine(n)&&ready(n));$('dockHint').textContent=on.length?`Mengarahkan ${FC.name}${on.length>1?'. Pilih karaktermu yang lain di daftar untuk berganti.':'.'} Klik karakter lain untuk menghampiri dan mengobrol.`:(myChars().length?'Karaktermu sedang tidak ada di kantor.':'Klik karakter untuk mengobrol.');
 root.querySelectorAll('#kt-dock button').forEach(x=>x.classList.toggle('on',held(FC)&&FC.task===LABEL[x.dataset.do]));
}

// ===== Kontrol Admin =====
function holdF(f,sec=25){if(f.inScene)endScene();f.held=S.t+sec;f.directed=true;cancel(f);f.ff=0;f.carry=null;f.slot=null;}
function goF(f,cell){holdF(f);f.task='Sedang diarahkan';f.action='walk';(async()=>{try{await walk(f,cell);f.pose='stand';f.face=0;}catch(e){if(e!==CANCEL)throw e;}})();}
function actF(f,a){
 if(a==='kerja'){holdF(f,14);f.task='Kembali ke meja';f.action='walk';(async()=>{try{await sitDown(f);await doing(f,'Menyusun rencana kirim',12,'type',p=>{f.filled=p;});}catch(e){if(e!==CANCEL)throw e;}})();return;}
 const list=a==='makan'?SPOT.kulkas:SPOT[a],QUEUE={kopi:[19,6],snack:[21,6],makan:[23,6],sofa:[19,13],toilet:[20,13]};
 holdF(f,999);f.rng=seeded(`${f.id}|act|${Math.floor(Date.now()/5000)}`);S.chatCd=0;(async()=>{try{if(a!=='toilet'&&a!=='nap'&&!free(f,list)){f.task='Antre';f.action='walk';say(f,'Antre dulu ya.',2.2);await standAt(f,QUEUE[a],1);while(!free(f,list))await timer(f,.4);}await activity(f,a);f.pose='stand';f.face=0;f.task='Sedang diarahkan';f.held=S.t+7;}catch(e){if(e!==CANCEL)throw e;}})();
}
const send=(f,act,x=0,y=0)=>window.ForecastOfficeControl?.send(f.id,act,clamp(Math.round(x),-OX,25),clamp(Math.round(y),0,16));
function fcTo(cell){goF(FC,cell);send(FC,'go',cell[0],cell[1]);S.sel=FC.id;}
function playerDo(a){
 if(!pickFC())return;S.sel=FC.id;
 if(asleep()){say(FC,'Zzz... besok aja...',1.6);return;}
 actF(FC,a);send(FC,a);
}
let lastCmd={},stopControl=null;
function onRemote(c){const f=by(c.id);if(!f||c.at<=(lastCmd[c.id]||0))return;lastCmd[c.id]=c.at;if(c.own||Date.now()-c.at>25000||!ready(f)||asleep())return;if(c.act==='go')goF(f,nearestFree(c.x,c.y));else actF(f,c.act);}
function cellAt(e){const r=view.getBoundingClientRect();return [(e.clientX-r.left)/r.width*(COLS+OX)-OX,(e.clientY-r.top)/r.height*ROWS];}
view.addEventListener('pointerdown',e=>{
 view.focus({preventScroll:true});const [fx,fy]=cellAt(e),hit=NPC.find(n=>n!==FC&&n.pose!=='toilet'&&n.pose!=='away'&&Math.abs(n.x+.5-fx)<.75&&fy>n.y-1.5&&fy<n.y+1.05);if(hit){S.sel=hit.id;if(mine(hit)&&ready(hit)&&(comes(hit)||myChars().length===1)){FC=hit;return;}approach(hit);return;}if(!pickFC())return;
 if(asleep()){S.sel=FC.id;say(FC,'Zzz...',1.4);return;}const x=Math.floor(fx),y=Math.floor(fy);
 if(y>=1&&y<=5&&x>=18&&x<=19)return playerDo('kopi');if(y>=1&&y<=5&&x>=20&&x<=21)return playerDo('snack');if((y>=1&&y<=5&&x>=22&&x<=24)||(x>=20&&x<=21&&y>=7&&y<=8))return playerDo('makan');
 if(x>=18&&x<=20&&y>=10&&y<=12)return playerDo('sofa');if(x>=22&&x<=24&&y>=10&&y<=15)return playerDo('toilet');if(x>=6&&x<=11&&y>=11&&y<=14)return playerDo('kerja');fcTo(nearestFree(x,y));
});
const DIR={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]};
window.addEventListener('keydown',e=>{if(document.activeElement!==view)return;const m=DIR[e.key];if(!m)return;e.preventDefault();if(asleep()||!pickFC())return;const cur=FC.path[0]||[Math.round(FC.x),Math.round(FC.y)],nx=[cur[0]+m[0],cur[1]+m[1]];if(blocked.has(key(nx[0],nx[1])))return;S.sel=FC.id;clearTimeout(S.keySend);const f=FC;S.keySend=setTimeout(()=>send(f,'go',nx[0],nx[1]),220);if(FC.path.length&&held(FC)&&FC.wait?.walk){FC.held=S.t+25;FC.path=[FC.path[0],nx];return;}goF(FC,nx);});

buildBG();syncReal();let last=performance.now(),pt=0,running=false;
function frame(now){if(!root.isConnected){running=false;stopControl?.();stopControl=null;stopPres?.();stopPres=null;return;}const gap=Math.max(0,(now-last)/1000);last=now;if(gap>2)NPC.forEach(n=>{if(n.slotK!==null&&!held(n))n.slotK=undefined;});let rem=Math.min(gap,1);while(rem>.001){const d=Math.min(rem,.05);update(d);rem-=d;}render();pt+=gap;if(pt>.15){pt=0;panel();}requestAnimationFrame(frame);}
update(0);panel();
let stopPres=null;function watchPresence(){if(stopPres||!window.ForecastChatAPI?.listenPresence)return;stopPres=window.ForecastChatAPI.listenPresence(list=>{if(list)S.pres=list;});}
function guide(){const w=root.querySelector('#kt-guide-who');if(!w)return;const r=window.ForecastAuth?.role||{},mineN=myChars().map(by).filter(Boolean).map(n=>n.name);w.innerHTML=r.master?'Kamu <b>Master</b>: semua karakter bisa kamu arahkan.':mineN.length?`Karakter yang bisa kamu arahkan: <b>${mineN.map(esc).join(', ')}</b>.`:'Akunmu belum punya karakter. Kamu tetap bisa klik karakter lain untuk melihat obrolannya.';}
function start(){guide();watchPresence();syncReal();syncWeather();if(!stopControl)stopControl=window.ForecastOfficeControl?.listen(onRemote)||null;if(running)return;running=true;NPC.forEach(n=>{if(n.slotK!==null&&!held(n))n.slotK=undefined;});last=performance.now();requestAnimationFrame(frame);}
setInterval(()=>{if(root.isConnected){syncReal();syncWeather();}},60000);
function portrait(ctx,id,px,py,scale,f=0){const n=by(id);if(!n)return;const save=c,keep={pose:n.pose,path:n.path,wait:n.wait,carry:n.carry,food:n.food,sipT:n.sipT,sayT:n.sayT};c=ctx;ctx.save();ctx.setTransform(scale,0,0,scale,0,0);n.pose='stand';n.path=[];n.wait=null;n.carry=null;n.food=null;n.sipT=0;n.sayT=0;drawFront(n,px,py,f,false);ctx.restore();Object.assign(n,keep);c=save;}
return {root,start,portrait,sim:l=>{S.pres=l;},debug:()=>NPC.map(n=>({id:n.id,x:+n.x.toFixed(2),y:+n.y.toFixed(2),pose:n.pose,face:n.face,task:n.task,scene:!!n.inScene,say:n.sayT>0?n.say:''}))};
}
return {debug:()=>api?.debug?.(),portrait:(...a)=>api?.portrait?.(...a),sim:l=>api?.sim?.(l),render:()=>'<div class="focus-intro"><h2>Kantor Agen AI</h2><span>Tim forecast hari ini</span></div><div id="kantor-host"></div>',mount(){const h=document.getElementById('kantor-host');if(!h)return;try{api=api||boot();if(api.root.parentNode!==h)h.appendChild(api.root);api.start();}catch(err){console.error(err);h.innerHTML='<p class="workspace-note">Kantor Agen AI belum dapat ditampilkan. Muat ulang halaman.</p>';}}};
})();
