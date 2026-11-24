// Obrolan Kantor Agen AI (owner 2026-11-24). Kalimat dipilih dari peran, jam, dan data yang sedang ada.
// Kalimat berisi data hanya muncul kalau datanya tersedia. Tidak ada nama staf di file publik ini.
window.ForecastOfficeTalk=(()=>{
'use strict';
const seeded=str=>{let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);let a=h>>>0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
const join=(a,max=2)=>{const x=(a||[]).slice(0,max);return x.length<2?x[0]||'':x.slice(0,-1).join(', ')+' dan '+x.at(-1);};
const dur=t=>Math.min(7.5,Math.max(2.8,1.7+String(t).length*.062));
const on=(c,...x)=>c?x:[];
const call=f=>f.who?`${f.who}, `:'';
const low=s=>String(s||'').toLowerCase();
const roti=a=>a.length&&a.every(x=>/^Roti/.test(x))?'roti manis':join(a,3);

// ===== Data per peran =====
function dataLines(id,f){
 const bd=f.notSell[0]||{},wOut=f.wasteOutlets[0],wOut2=f.wasteOutlets[1],lOut=f.lostOutlets[0],lOut2=f.lostOutlets[1],bad=f.notSell[0],hit=f.laris[0],move=f.place[0],o=f.omzet;
 if(id==='esb')return [
  ...on(f.pull,`Tarikan terakhir jam ${f.pull}, datanya masih anget.`,`Data ESB terakhir masuk ${f.pull}. Aman, nggak ada yang nyangkut.`,`Barusan sinkron jam ${f.pull}. Server lagi anteng.`,`Kalau butuh angka terbaru, patokannya tarikan ${f.pull} ya.`),
  ...on(!f.pull&&f.h>=9,'Tarikan hari ini belum masuk, aku pantau terus.'),
  ...on(!f.pull&&f.h<9,'ESB baru mulai ditarik jam 9, sabar ya.'),
  ...on(o,`Omzet sementara ${o?.text}, itu baru sampai tarikan terakhir.`,`Sampai tarikan terakhir sudah masuk ${o?.text}.`),
  ...on(o&&o.outlets>=28,'Semua 28 outlet kebaca. Lengkap, nggak ada yang bolos.'),
  ...on(o&&o.outlets<28,`Baru ${o?.outlets} dari 28 outlet yang kebaca, sisanya kutunggu.`),
  ...on(f.h>=19&&f.h<22,'Angka final lagi kutarik, tunggu sampai jam 22 ya.'),
  ...on(f.h>=9&&f.h<19,'Tiap jam aku tarik data. Rajin kan?'),
 ];
 if(id==='pawang')return [
  ...on(f.weatherKnown&&f.weather==='hujan','Hari ini rawan hujan, biasanya pembeli jalan kaki berkurang.','Awan hari ini berat. Payungnya siap?'),
  ...on(f.weatherKnown&&f.weather==='mendung','Langit lagi galau, mendung tapi belum tentu hujan.','Mendung tipis. Masih aman buat jualan.'),
  ...on(f.weatherKnown&&f.weather==='cerah','Hari ini cerah, enak buat orang keluar beli kue.','Langit bersih. Awanku sampai nganggur.'),
  ...on(f.tomorrowW==='hujan',`Besok ${f.tomorrow} kayaknya hujan. Kirimannya dipikir lagi ya.`,`Radar bilang ${f.tomorrow} basah. Hati-hati kebanyakan stok.`),
  ...on(f.tomorrowW==='mendung',`Besok ${f.tomorrow} cenderung mendung.`,`${f.tomorrow} berawan, belum perlu panik.`),
  ...on(f.tomorrowW==='cerah',`Besok ${f.tomorrow} cerah, stok bisa lebih pede.`,`${f.tomorrow} kelihatannya terang. Kabar bagus buat outlet.`),
  ...on(f.tomorrowW==='hujan'&&f.weekendTomorrow,'Akhir pekan hujan itu tricky. Jangan asal naikin.'),
  ...on(f.tomorrowW==='cerah'&&f.weekendTomorrow,'Akhir pekan cerah biasanya ramai. Siap-siap!'),
 ];
 if(id==='pred'){const stop=f.notSell.map(x=>x.label),add=f.laris.filter(l=>f.soldOut.some(s=>s.label===l)),tr=f.trend;return [
  ...on(stop.length,`Saran saya: hentikan dulu ${roti(stop)}. Lebih banyak terbuang daripada laku.`,`Kalau belum mau berhenti, kurangi drastis ${roti(stop)}.`,`${roti(stop)} sebaiknya diganti produk yang lebih laku.`),
  ...on(f.slow.length,`Kurangi ${join(f.slow)} pelan-pelan, jangan sekaligus.`),
  ...on(add.length,`Tambah ${join(add)}, sering habis duluan.`,`${join(add)} masih bisa dinaikkan, permintaannya belum terpenuhi.`),
  ...on(!add.length&&f.laris.length,`${join(f.laris)} sehat, pertahankan jumlahnya.`),
  ...on(f.place.length,`${join(f.place)}: totalnya cukup, pembagian antar-outlet yang perlu dibenahi.`),
  ...on(f.status&&f.waste==='lewat',`Performa waste buruk. Kurangi kiriman di outlet yang sisanya berulang${f.outletW?', mulai dari '+f.outletW.name:''}.`),
  ...on(f.status&&f.waste==='aman','Performa waste aman. Fokus berikutnya mengurangi kehabisan.'),
  ...on(f.outletL,`Tambah kiriman ${f.outletL?.name}, paling sering kehabisan.`),
  ...on(tr?.dir==='naik',`Tren omzet cenderung naik, ${tr?.pct}% dibanding minggu sebelumnya.`,`Omzet seminggu terakhir naik ${tr?.pct}%. Stok outlet ramai jangan sampai kurang.`),
  ...on(tr?.dir==='turun',`Tren omzet cenderung turun, ${tr?.pct}% dibanding minggu sebelumnya.`,`Omzet melemah ${tr?.pct}%. Tahan kiriman, jangan ikut angka minggu lalu.`),
  ...on(tr?.dir==='stabil','Tren omzet stabil. Rencana bisa mengikuti pola minggu lalu.'),
  ...on(stop.length&&add.length,`Kesimpulan saya: kurangi ${roti(stop)}, alihkan ke ${join(add)}.`),
  ...on(f.model,'Model semalam sudah update, prediksi besok siap dipakai.'),
  ...on(!f.model,'Model besok belum selesai, sementara pakai metode cadangan.'),
  ...on(o?.pct!=null&&f.h>=19,`Omzet hari ini ${o?.pct}% dari prediksi.`),
  ...on(f.weekendTomorrow,`Besok ${f.tomorrow}, polanya biasanya beda dari hari kerja.`),
  ...on(f.tomorrow==='Senin','Besok Senin, biasanya turun setelah akhir pekan. Jangan ikut angka Minggu.'),
 ];}
 if(id==='watch')return [
  ...on(f.wasteProd,`Produk paling boros 28 hari terakhir: ${f.wasteProd?.label}, waste ${f.wasteProd?.rp}.`),
  ...on(f.lostProd,`Lost terbesar ada di ${f.lostProd?.label}, kira-kira ${f.lostProd?.pcs} pcs dalam 28 hari.`),
  ...on(f.soldOut[0],`${f.soldOut[0]?.label} habis di ${f.soldOut[0]?.rate}% hari berstok.`),
  ...on(bd.label,`${bd.label}: ${bd.pct}% kirimannya jadi waste.`,`${bd.label} masih berstatus tidak laku.`),
  ...on(f.slow[0],`${f.slow[0]} kurang laku, sisanya sering banyak.`),
  ...on(f.place[0],`${f.place[0]} sisa di satu outlet, habis di outlet lain.`),
  ...on(f.areaW,`Area ${f.areaW?.name} waste-nya paling tinggi, ${f.areaW?.pct}% dari omzet.`),
  ...on(f.areaBest&&f.areaW&&f.areaBest.name!==f.areaW.name,`Area paling rapi: ${f.areaBest?.name}, waste ${f.areaBest?.pct}% dari omzet.`),
  ...on(f.areaL,`Area ${f.areaL?.name} paling banyak kehilangan penjualan.`),
  ...on(f.outletW,`Outlet dengan waste tertinggi: ${f.outletW?.name}, ${f.outletW?.pct}% dari omzet.`),
  ...on(f.outletL,`${f.outletL?.name} paling sering kehabisan stok.`),
  ...on(wOut,`Hati-hati, waste ${wOut} lagi tinggi.`,`Tolong cek kiriman ${wOut}, sisanya sering banyak.`),
  ...on(lOut,`${lOut} sering kehabisan. Jangan sampai lost lagi.`),
  ...on(f.status&&f.waste==='lewat','Waste bulan ini sudah lewat batas.'),
  ...on(f.status&&f.waste==='waspada','Waste mulai mendekati batas, jangan lengah.'),
  ...on(f.status&&f.waste==='aman','Waste masih aman. Pertahankan.'),
  ...on(f.status&&f.lost==='lewat','Lost sales sudah lewat batas.'),
  ...on(f.status&&f.lost==='waspada','Lost sales mulai banyak.'),
  ...on(f.wasteTrend==='naik','Tren waste lagi naik.'),
  ...on(f.wasteTrend==='turun','Waste mulai turun. Kabar baik.'),
  ...on(f.lostTrend==='naik','Lost sales juga naik, jadi jangan asal potong kiriman.'),
  ...on(f.lostTrend==='turun','Lost sales mulai turun.'),
 ];
 return [
  ...on(f.plan!=null&&f.plan<28&&f.plan>0,`Rencana besok baru ${f.plan} dari 28 outlet.`,`Masih ada ${28-(f.plan||0)} outlet yang belum kusimpan.`),
  ...on(f.plan===0&&f.h>=10,'Rencana besok belum mulai disimpan. Ini antrian berikutnya.'),
  ...on(f.plan===28,'Rencana besok sudah lengkap 28 outlet. Lega!','28 outlet aman. Tinggal cek rincian kirim.'),
  ...on(wOut,`Aku lagi mikirin kiriman ${wOut}, waste-nya tinggi.`),
  ...on(lOut,`${lOut} kayaknya perlu ditambah sedikit.`),
  ...on(bad,`${bd.label} kayaknya harus kukurangi deh.`),
  ...on(hit,`${hit} jangan sampai kurang, itu lagi laris.`),
  ...on(f.tomorrowW==='hujan','Besok hujan, rencananya kujaga biar nggak berlebihan.'),
  ...on(f.weekendTomorrow,`Besok ${f.tomorrow}, stok outlet ramai harus aman.`),
 ];
}

// ===== Tips sesuai peran =====
const TIPS={
 esb:['Kalau angka aneh, cek dulu jam tarikannya.','Data jam 10 jangan dibandingkan dengan data final ya.','Jangan lupa refresh kalau datanya kelihatan lama.','Backup itu kayak sarapan. Sering dilewatin, nyesel kemudian.','Sabar sama server, dia juga punya perasaan.','Simpan draft sering-sering, sinyal nggak bisa dipercaya.'],
 pawang:['Cek cuaca sebelum finalin kiriman, jangan feeling doang.','Hujan sore beda dampaknya sama hujan pagi.','Bawa payung, aku nggak tanggung jawab kalau basah.','Peluang hujan itu peluang, bukan janji.','Jangan salahkan awan kalau omzet turun. Cek dulu datanya.','Minum air putih, badan juga butuh hujan lokal.'],
 pred:['Jangan lihat satu hari saja, lihat polanya.','Bandingkan dengan hari yang sama minggu lalu.','Rata-rata bisa menipu, median lebih jujur.','Satu outlier jangan langsung jadi kesimpulan.','Kalau ragu, cek 4 minggu terakhir dulu.','Prediksi itu alat bantu. Keputusan tetap di kamu.','Tanggal merah dan gajian bisa mengubah pola, dicek ya.'],
 watch:['Waste kecil tiap hari kalau dikumpulin jadi besar.','Cek outlet yang sisanya berulang, bukan yang sekali saja.','Kirim lebih bukan solusi kalau outletnya memang sepi.','Jangan cuma kejar waste rendah, lost juga kerugian.','Produk tidak laku jangan ditambah karena kasihan.','Stok akhir nol belum tentu bagus, cek jam habisnya.'],
 f:['Cek ulang angka sebelum klik simpan.','Mulai dari outlet besar dulu, biar cepat kelihatan.','Catat alasan kalau ubah angka, besok pasti lupa.','Lihat Rincian kirim sebelum dibagikan ke dapur.','Kalau pusing, tutup sheet dua menit.'],
};
const CARE=['Jangan lupa istirahat ya.','Ngopi dulu biar santai.','Mata jangan kelamaan lihat layar.','Minum air dulu, jangan cuma kopi.','Regangkan bahu sebentar, kelihatan tegang tuh.','Santai, angka nggak bakal kabur.','Berdiri sebentar, jalan ke pantry gih.','Kerjaan banyak, tapi kamu juga perlu napas.','Ada snack di rak, ambil aja.','Kerja bagus hari ini. Serius.'];

// ===== Suasana sesuai jam dan hari =====
function timeLines(f){
 const a=[];
 if(f.h<9)a.push('Pagi! Sudah sarapan belum?','Masih pagi, otak baru loading.','Kopi pertama hari ini sudah?','Semangat pagi, data baru menanti.');
 else if(f.h<11)a.push('Jam segini outlet mulai ramai.','Pagi yang produktif, semoga.','Kopi kedua sudah boleh belum?');
 else if(f.h<13)a.push('Sudah mau jam makan, bekalnya apa?','Perut mulai protes nih.','Istirahat siang jangan dilewatin ya.','Makan dulu, revisi belakangan.');
 else if(f.h<15)a.push('Habis makan ngantuk banget ya.','Jam rawan ketiduran nih.','Kopi siang wajib hukumnya.','Tahan, jangan merem di depan sheet.');
 else if(f.h<17)a.push('Sore gini biasanya mulai ada kabar stok habis.','Jam transfer nih, pantau grup ya.','Snack sore dulu yuk.');
 else if(f.h<19)a.push('Langitnya bagus, sempat lihat keluar?','Sebentar lagi jam ramai pulang kerja.','Yang shift pagi sudah pulang kan?');
 else if(f.h<20)a.push('Satu jam lagi outlet tutup.','Malam gini outlet lagi puncak-puncaknya.','Masih lembur? Semangat.');
 else a.push('Outlet sudah tutup, tinggal nunggu angka final.','Sudah malam, jangan kemalaman pulangnya.','Hari ini cukup panjang ya.','Besok lagi ya, istirahat yang benar.');
 if(f.day==='Senin')a.push('Senin lagi. Kuat kan?','Awal minggu, mari pura-pura semangat.');
 if(f.day==='Jumat')a.push('Jumat! Sedikit lagi akhir pekan.','Jumat berkah, semoga omzetnya juga.');
 if(f.weekendToday)a.push('Akhir pekan tetap kerja, kita hebat.','Outlet biasanya ramai kalau akhir pekan.');
 if(f.date>=25||f.date<=2)a.push('Tanggal gajian, biasanya orang lebih gampang jajan.');
 return a;
}

// ===== Candaan sesuai karakter =====
const FUN={
 esb:['Hidupku cuma tarik data dan tarik napas.','Kalau aku diam, berarti servernya aman.','Kabel ini lebih rapi dari hidupku.','Aku lari biar datanya nggak telat.','Error 404: semangat tidak ditemukan.','Aku nggak ngebut, datanya aja yang lambat.'],
 pawang:['Awan ini sudah kuanggap peliharaan.','Aku bisa ramal cuaca, tapi nggak bisa ramal jodoh.','Tadi aku geser awan dikit, jangan bilang-bilang.','Kalau aku bersin, Semarang gerimis.','Hari ini mood-ku berawan sebagian.'],
 pred:['Peluang saya ngopi lagi: 94 persen.','Secara statistik, kamu butuh istirahat.','Rambut ungu ini tidak memengaruhi akurasi.','Saya tidak menebak. Saya menghitung, lalu berharap.','Korelasi saya dengan kopi sangat kuat.'],
 watch:['Saya melihat semuanya. Termasuk snack kedua kamu.','Remah di meja itu juga waste.','Saya tidak galak, standar saya saja tinggi.','Donat itu dihabiskan ya. Nol waste.','Jangan tatap saya begitu, tatap datanya.'],
 f:['Kalau ada revisi lagi, aku pura-pura offline.','Sheet ini lama-lama muncul di mimpi.','Aku bisa hitung 28 outlet, tapi nggak bisa hitung utang kopi.','Hidup ini cuma simpan, revisi, simpan lagi.','Tolong jangan tambah kolom baru.'],
};

// ===== Saat karakter sedang melakukan sesuatu =====
const STATE={
 coffee:['Bentar, kopinya masih panas.','Tanya aja, aku lagi ngopi.','Seruput dulu, baru mikir.','Mau dibikinin juga?'],
 eat:['Nyam, sebentar, mulut penuh.','Mau? Ambil sendiri di rak.','Makan dulu ya, jangan bahas waste.','Enak nih, kamu sudah makan?'],
 sofa:['Lima menit lagi, janji.','Sofa ini terlalu nyaman.','Jangan bilang-bilang aku di sini.','Lagi mengisi ulang tenaga.'],
 nap:['Zzz... jangan revisi... zzz...','Mmh... lima menit lagi...','Zzz... datanya aman... zzz...','Hah? Oh... tidur lagi ya.'],
 night:['Zzz... besok aja ya...','Kantor sudah tutup, tidur sana.','Mmh... data final... zzz...','Sudah malam, kamu kok masih di sini?','Zzz... jangan lupa matikan lampu...'],
};
const FC_REPLY={
 warn:['Oke, aku cek sekarang.','Waduh, makasih sudah diingetin.','Siap, kukurangi nanti.','Hmm, bener juga ya.','Noted, masuk daftar.'],
 data:['Oke, noted.','Sip, makasih infonya.','Mantap, lanjut.','Nah, itu yang kucari.','Oke, kupakai buat rencana.'],
 tip:['Siap!','Bener juga, makasih.','Oke, kucoba.','Noted, Suhu.','Kamu perhatian banget.'],
 care:['Iya deh, bentar lagi.','Makasih ya.','Habis ini ngopi, janji.','Kelihatan capek banget ya?'],
 time:['Iya nih.','Bener banget.','Nggak kerasa ya.','Hehe, iya.'],
 fun:['Hahaha, ada-ada aja.','Astaga.','Kamu ini ya.','Wkwk, kerja woy.','Nggak jelas, tapi lucu.'],
 state:['Oke, lanjut aja.','Sisain ya!','Enak banget hidupmu.','Hehe, maaf ganggu.'],
};

function reply(id,f,ctx,memo){
 const role=id==='f1'||id==='f2'?'f':id,seen=memo[id]||(memo[id]=[]),r=Math.random;
 const fresh=a=>{const x=a.filter(t=>!seen.includes(t));return x.length?x:a;};
 const take=(arr,tag)=>{const c=fresh(arr),text=c[Math.floor(r()*c.length)];seen.push(text);if(seen.length>18)seen.shift();return {text,tag};};
 if(ctx.asleep)return take(STATE.night,'state');
 if(ctx.state==='nap')return take(STATE.nap,'state');
 if(ctx.state&&r()<.55)return take(STATE[ctx.state],'state');
 const data=dataLines(role,f),warn=data.filter(t=>/hati-hati|waste|lost|tidak laku|kurang laku|keberatan|habis|cek/i.test(t)),plain=data.filter(t=>!warn.includes(t));
 const task=ctx.task&&!/Kembali|Bersiap|diarahkan/i.test(ctx.task)?[`Lagi ${low(ctx.task)} nih.`,`Bentar ya, aku lagi ${low(ctx.task)}.`,`Progres: masih ${low(ctx.task)}.`]:[];
 const bag=[[plain,'data',.34],[warn,'warn',role==='watch'?.42:.22],[TIPS[role],'tip',.14],[CARE,'care',.1],[timeLines(f),'time',.12],[FUN[role],'fun',.12],[task,'state',.06]].filter(x=>x[0].length);
 let w=bag.reduce((s,x)=>s+x[2],0)*r();for(const x of bag){w-=x[2];if(w<=0){const res=take(x[0],x[1]);if((x[1]==='tip'||x[1]==='care')&&f.who&&r()<.3)res.text=call(f)+res.text[0].toLowerCase()+res.text.slice(1);return res;}}
 return take(CARE,'care');
}
const fcReply=tag=>{const a=FC_REPLY[tag]||FC_REPLY.time;return a[Math.floor(Math.random()*a.length)];};

// ===== Percakapan antar karakter =====
const S=(need,when,lines)=>({need,when,lines});
const SCENES=[
 S(['watch','f'],f=>f.wasteOutlets[0],(f,P)=>[['watch',P(`${f.wasteOutlets[0]} sisanya banyak lagi. Kirimannya siapa yang atur?`,`Saya lihat ${f.wasteOutlets[0]} waste-nya masih tinggi.`)],['f',P('Waduh, kemarin sudah kukurangi lho.','Hmm, padahal sudah kuturunin sedikit.')],['watch','Coba lihat produk apa yang paling banyak sisa.'],['f',P('Oke, aku buka tab waste dulu.','Siap, nanti kurapikan di rencana besok.')],['watch',P('Bagus. Saya pantau.','Jangan cuma janji ya.')]]),
 S(['watch','f'],f=>f.lostOutlets[0],(f,P)=>[['f',`Eh, ${f.lostOutlets[0]} kok sering kehabisan ya?`],['watch',P('Iya, lost-nya naik. Stoknya kurang terus.','Sudah masuk daftar saya dari kemarin.')],['f','Kalau kutambah, waste-nya aman nggak?'],['watch',P('Tambah sedikit dulu, lalu lihat dua hari.','Naikkan pelan-pelan, jangan langsung banyak.')],['f','Oke, masuk akal.']]),
 S(['watch','pred'],f=>f.notSell[0],(f,P)=>[['watch',`${f.notSell[0].label} ${f.notSell[0].pct}% jadi waste. Ini sudah keterlaluan.`],['pred','Datanya memang konsisten, bukan kebetulan.'],['watch','Jadi harus dipotong?'],['pred',P('Kurangi bertahap, lalu ukur lagi.','Potong, tapi pantau outlet yang masih ada pembeli.')],['watch','Setuju. Akhirnya kita sepakat.'],['pred','Catat tanggalnya, ini langka.']]),
 S(['pred','f'],f=>f.laris[0],(f,P)=>[['pred',`${f.laris[0]} lagi bagus banget datanya.`],['f','Berarti besok aman kalau kutambah?'],['pred',P('Boleh, tapi lihat outlet mana yang habis duluan.','Tambah di outlet yang sering habis saja.')],['f','Oke, jadi bukan naik rata ya.'],['pred','Tepat. Kamu mulai berpikir seperti model.'],['f','Itu pujian atau hinaan?']]),
 S(['pred','watch'],f=>f.place[0],(f)=>[['watch',`${f.place[0]} ini aneh. Waste tinggi, tapi sering habis juga.`],['pred','Artinya total mungkin pas, pembagiannya yang meleset.'],['watch','Jadi outlet A sisa, outlet B kehabisan?'],['pred','Persis. Itu kerjaan transfer.'],['watch','Baik, saya tandai.']]),
 S(['pawang','f'],f=>f.tomorrowW==='hujan',(f,P)=>[['pawang',`Besok ${f.tomorrow} kayaknya hujan.`],['f',P('Serius? Parah nggak?','Hujan dari pagi atau sore?')],['pawang',P('Awannya lumayan tebal. Siap-siap aja.','Belum bisa dipastikan jamnya, tapi peluangnya besar.')],['f','Berarti kirimannya kutahan sedikit.'],['pawang','Bijak. Awanku bangga.']]),
 S(['pawang','f'],f=>f.tomorrowW==='cerah',(f,P)=>[['f','Besok cuacanya gimana?'],['pawang',P(`${f.tomorrow} cerah, tenang aja.`,'Terang benderang, awanku libur.')],['f','Asik, stok bisa lebih berani dong.'],['pawang','Boleh, asal tetap lihat datanya.'],['f','Iya iya, Pak Awan.']]),
 S(['pawang','esb'],f=>f.weatherKnown&&f.weather==='hujan',()=>[['esb','Eh, di luar hujan ya? Sinyalku ikut turun.'],['pawang','Itu bukan salahku.'],['esb','Tiap hujan kamu selalu bilang gitu.'],['pawang','Awannya yang kerja, aku cuma manajer.'],['esb','Manajer apaan, kerjanya bengong.']]),
 S(['pawang','pred'],f=>f.tomorrowW,(f,P)=>[['pred','Peluang hujan besok berapa?'],['pawang',f.tomorrowW==='hujan'?'Tinggi. Bawa payung.':f.tomorrowW==='mendung'?'Tanggung. Bisa iya, bisa nggak.':'Rendah. Aman.'],['pred','Bisa lebih presisi?'],['pawang',P('Kamu mau angka, aku punya firasat.','Langit nggak pakai desimal, Kak.')],['pred','Ini kenapa kita butuh model.']]),
 S(['esb','pred'],f=>f.pull,(f,P)=>[['esb',`Data jam ${f.pull} sudah masuk, siap dipakai.`],['pred','Lengkap semua outlet?'],['esb',f.omzet?.outlets>=28?'Lengkap, 28-28.':P('Hampir, sisanya kutarik lagi.','Masih ada yang nyusul.')],['pred','Oke, kuhitung ulang progresnya.'],['esb','Jangan lupa bilang makasih.'],['pred','Terima kasih. Sudah tercatat.']]),
 S(['esb','f'],f=>f.pull,(f,P)=>[['f','Datanya sudah update belum?'],['esb',P(`Sudah, terakhir jam ${f.pull}.`,`Baru aja, jam ${f.pull}.`)],['f','Cepet juga.'],['esb','Aku kan lari, bukan jalan.'],['f','Pantes ngos-ngosan.']]),
 S(['esb','watch'],f=>f.status,(f,P)=>[['watch','Data waste kemarin sudah lengkap?'],['esb','Sudah kuantar. Ada yang salah?'],['watch',P('Belum tahu. Saya periksa dulu.','Saya selalu curiga dulu.')],['esb','Kamu kapan sih nggak curiga?'],['watch','Saat tidur.'],['esb','Itu pun matanya kayak masih ngawasin.']]),
 S(['pred','f'],f=>f.omzet?.pct!=null&&f.h>=12,(f,P)=>[['f','Omzet hari ini gimana?'],['pred',`Sementara ${f.omzet.pct}% dari prediksi.`],['f',f.h>=19?(f.omzet.pct>=100?'Wih, tembus!':'Masih bisa kekejar nggak?'):'Itu bagus atau biasa aja?'],['pred',f.h>=19?P('Tunggu angka final dulu.','Lihat sampai jam 22.'):'Tergantung jam. Jam segini belum bisa disimpulkan.'],['f','Jawabanmu selalu aman ya.'],['pred','Itu namanya metodologi.']]),
 S(['f','g'],f=>f.plan!=null&&f.plan<28,(f,P)=>[['f',`Rencana besok baru ${f.plan} outlet nih.`],['g',P('Mau kubantu bagian Solo?','Sisanya kita bagi dua yuk.')],['f','Boleh, aku lanjut Semarang.'],['g','Oke. Jangan lupa cek cuacanya.'],['f','Siap, partner.']]),
 S(['f','g'],f=>f.plan===28,()=>[['f','Rencana besok sudah lengkap!'],['g','Akhirnya. Sudah dicek ulang?'],['f','Sudah dua kali.'],['g','Tiga kali dong, biar tenang.'],['f','Kamu ini ya.']]),
 S(['f','g'],f=>f.h>=11&&f.h<14,(f,P)=>[['f','Makan apa hari ini?'],['g',P('Bawa bekal dong.','Belum kepikiran, kamu?')],['f','Kayaknya nasi padang lagi.'],['g','Kemarin juga itu.'],['f','Konsisten itu kunci.']]),
 S(['f','g'],f=>f.h>=14&&f.h<17,()=>[['g','Ngantuk banget nggak sih?'],['f','Banget. Angkanya mulai goyang.'],['g','Ngopi yuk.'],['f','Kamu yang bikin ya.'],['g','Gantian dong.']]),
 S(['f','g'],f=>f.h>=19,()=>[['f','Capek juga hari ini.'],['g','Sama. Tapi rencananya aman kan?'],['f','Aman. Besok tinggal pantau.'],['g','Pulang nanti hati-hati ya.']]),
 S(['esb','pawang'],f=>f.h<11,(f,P)=>[['esb','Pagi! Langit hari ini gimana?'],['pawang',f.weatherKnown?(f.weather==='hujan'?'Basah, siap-siap.':f.weather==='mendung'?'Agak galau.':'Cerah, kayak masa depanmu.'):'Masih kubaca.'],['esb',P('Server juga aman sih.','Semoga datanya secerah itu.')],['pawang','Kopi dulu?'],['esb','Kuy, kilat.']]),
 S(['watch','esb'],f=>f.h>=11&&f.h<14,()=>[['esb','Makan yuk!'],['watch','Bekal kamu kemarin sisa.'],['esb','Kamu ngecek bekalku juga?'],['watch','Waste tetap waste.'],['esb','Ya ampun.']]),
 S(['pred','pawang'],f=>f.h>=13&&f.h<16,()=>[['pawang','Kamu pernah salah prediksi nggak?'],['pred','Pernah. Tapi selalu dalam rentang.'],['pawang','Enak ya, salah pakai rentang.'],['pred','Kamu kalau salah bilang apa?'],['pawang','Anginnya berubah.'],['pred','Itu juga rentang, versi kamu.']]),
 S(['watch','pawang'],()=>true,()=>[['watch','Awan kamu itu boros tempat.'],['pawang','Dia nggak makan apa-apa kok.'],['watch','Tetap saya catat.'],['pawang','Catat apa?'],['watch','Satu awan, tidak produktif.'],['pawang','Awan, jangan didengerin.']]),
 S(['esb','pred'],()=>true,()=>[['esb','Kalau datanya kupercepat, prediksimu lebih bagus?'],['pred','Tidak selalu.'],['esb','Terus aku lari buat apa?'],['pred','Untuk kesehatan.'],['esb','...oke, masuk akal.']]),
 S(['pred','watch'],()=>true,()=>[['pred','Kopi ketiga hari ini.'],['watch','Ampasnya dibuang di mana?'],['pred','Kamu serius?'],['watch','Saya selalu serius.'],['pred','Itu yang saya khawatirkan.']]),
 S(['pawang','f'],()=>true,(f,P)=>[['pawang','Kamu kelihatan mendung.'],['f',P('Capek aja, banyak revisi.','Kurang tidur kayaknya.')],['pawang','Mau kupanggilkan matahari?'],['f','Kopi aja cukup.'],['pawang','Siap, cerah berawan.']]),
 S(['esb','f'],()=>true,(f,P)=>[['esb','Kamu pernah coba matiin HP sehari?'],['f','Nggak bisa, grup outlet rame.'],['esb',P('Sama, serverku juga nggak pernah libur.','Kita ini senasib ya.')],['f','Ayo buat serikat.'],['esb','Gas, tapi habis tarikan berikutnya.']]),
 S(['watch','f'],f=>f.wasteTrend==='turun',()=>[['watch','Waste mulai turun.'],['f','Wih, dipuji nih?'],['watch','Belum. Itu baru laporan.'],['f','Dikit aja, senang dong.'],['watch','...Kerja bagus.'],['f','Tolong direkam!']]),
 S(['watch','pred'],f=>f.wasteTrend==='naik',()=>[['watch','Tren waste naik.'],['pred','Sudah cek karena stok atau karena pembeli turun?'],['watch','Itu yang sedang saya cari.'],['pred','Kalau dua-duanya, kita perlu lihat per produk.'],['watch','Baik, saya mulai dari yang terbesar.']]),
 S(['pred','f'],f=>f.weekendTomorrow,(f)=>[['f',`Besok ${f.tomorrow}, stok dinaikin nggak?`],['pred','Akhir pekan memang lebih tinggi, tapi tiap outlet beda.'],['f','Outlet kampus biasanya malah sepi ya.'],['pred','Nah, itu pengamatan bagus.'],['f','Akhirnya kamu mengakui aku.']]),
 S(['pred','f'],f=>f.tomorrow==='Senin',()=>[['f','Senin kok suka turun ya?'],['pred','Efek setelah akhir pekan.'],['f','Jadi kirimannya jangan ikut Minggu?'],['pred','Betul, pakai pola Senin.'],['f','Oke, catat.']]),
 S(['esb','watch'],f=>f.h>=19&&f.h<22,()=>[['watch','Angka final sudah masuk?'],['esb','Sebentar, outlet baru tutup.'],['watch','Saya tunggu.'],['esb','Tolong jangan berdiri di belakangku.'],['watch','Saya cuma memantau.']]),
 S(['watch','pred'],f=>f.areaW&&f.outletW,(f)=>[['watch',`Area ${f.areaW.name} waste-nya ${f.areaW.pct}% dari omzet, paling tinggi.`],['pred','Merata satu area, atau satu-dua outlet saja?'],['watch',`Paling besar di ${f.outletW.name}.`],['pred',`Berarti kurangi kiriman ${f.outletW.name} dulu, jangan potong satu area.`],['watch','Masuk akal. Saya pantau dua hari.']]),
 S(['pred','f'],f=>f.trend,(f)=>[['pred',f.trend.dir==='naik'?`Tren omzet seminggu ini naik ${f.trend.pct}%.`:f.trend.dir==='turun'?`Tren omzet seminggu ini turun ${f.trend.pct}%.`:'Omzet seminggu ini stabil.'],['f','Terus rencana besok gimana?'],['pred',f.trend.dir==='naik'?'Naikkan sedikit di outlet yang sering habis, bukan semua.':f.trend.dir==='turun'?'Tahan dulu. Jangan kirim seperti minggu lalu.':'Ikuti pola minggu lalu, sesuaikan cuaca.'],['f','Oke, kucatat.']]),
 S(['pred','f'],f=>f.notSell.length,(f)=>[['pred',`Saran saya, ${roti(f.notSell.map(x=>x.label))} dihentikan dulu.`],['f','Serius? Nanti outlet protes nggak?'],['pred',`${f.notSell[0].label} ${f.notSell[0].pct}% kirimannya jadi waste. Datanya jelas.`],['f','Oke, kubahas dulu sama owner.'],['pred','Bawa datanya, biar diskusinya cepat.']]),
 S(['watch','f'],f=>f.lostProd,(f)=>[['watch',`${f.lostProd.label} paling banyak lost, kira-kira ${f.lostProd.pcs} pcs.`],['f','Waduh, sebanyak itu?'],['watch','Itu perkiraan, tapi arahnya jelas.'],['f','Berarti outlet yang sering habis kutambah ya.'],['watch','Tambah di outlet yang habis, bukan semua.']]),
 S(['watch','pred'],f=>f.areaL,(f)=>[['pred','Area mana yang paling sering kehabisan?'],['watch',`${f.areaL.name}.`],['pred','Waste-nya di sana gimana?'],['watch',f.areaW&&f.areaW.name===f.areaL.name?'Tinggi juga. Pembagiannya berantakan.':'Masih wajar.'],['pred',f.areaW&&f.areaW.name===f.areaL.name?'Berarti masalahnya penempatan, bukan jumlah.':'Berarti area itu bisa ditambah sedikit.']]),
];
function scene(k,f,avail){
 const rng=seeded(`scene|${f.today}|${k}`),P=(...a)=>a[Math.floor(rng()*a.length)];
 if(rng()>.82)return null;
 const fa=avail.find(x=>x==='f1'||x==='f2'),fb=avail.find(x=>(x==='f1'||x==='f2')&&x!==fa),real=w=>w==='f'?fa:w==='g'?fb:w;
 const list=SCENES.map((s,i)=>({s,i,o:seeded(`order|${f.today}|${i}`)()})).sort((a,b)=>a.o-b.o).filter(({s})=>s.need.every(w=>real(w)&&avail.includes(real(w)))&&s.when(f));
 if(!list.length)return null;
 const data=list.filter(x=>x.s.when.length>0&&x.s.when.toString()!=='()=>true'),pool=data.length&&rng()<.7?data:list,sc=pool[k%pool.length].s;
 const lines=sc.lines(f,P).map(([w,text])=>({id:real(w),text,dur:dur(text)+.5}));
 const total=lines.reduce((s,l)=>s+l.dur,0);
 return {lines,total,offset:4+rng()*Math.max(1,82-total)};
}
return {reply,fcReply,scene,dur};
})();
