const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('study shows SKU-day error rather than cancellation-prone network error and filters groups',()=>{
 const ids=Array.from({length:28},(_,i)=>'outlet-'+i),outlets=ids.map((id,i)=>({id,name:id,wape:.3,accuracy:.7,actual:100,forecast:90,group:i<9?'high':i<19?'middle':'low'})),overall={wape:.3,networkDailyWape:.02,bias:-.1,forecast:2520,actual:2800,cells:10080,expectedCells:10080};
 const report={overall,outlets,daily:[{date:'2026-09-01',forecast:ids.map(()=>Array(12).fill(1)),actual:ids.map(()=>Array(12).fill(2))}]};
 const window={ForecastStudy:{ids,results:{fixed:report,rolling:report},baseline:{fixed:{wape:.4,networkDailyWape:.01},rolling:{wape:.4,networkDailyWape:.01}},selection:{fixed:{validationAugust:{wape:.3}},rolling:{validationAugust:{wape:.3}}},notes:[],protocolSha256:'synthetic',calendar:{sources:[]}}};
 vm.runInNewContext(fs.readFileSync('forecast/pcs-study-panel.js','utf8'),{window,Date,Intl});let html=window.PcsStudyPanel.render('blind');assert.match(html,/Akurasi seluruhnya/);assert.match(html,/>70%/);assert.match(html,/>30%/);assert.match(html,/Error total jaringan per hari: 2%/);
 window.PcsStudyPanel.change({target:{id:'study-group',value:'low'}});html=window.PcsStudyPanel.render('blind');assert.equal((html.match(/<td>Terendah<\/td>/g)||[]).length,9);
 window.PcsStudyPanel.change({target:{id:'study-mode',value:'rolling'}});assert.match(window.PcsStudyPanel.render('blind'),/penjualan tanggal 1 baru dibuka setelah prediksi itu/);
});
test('private data has no public fetch fallback; gate precedes all application execution',()=>{
 const html=fs.readFileSync('forecast/index.html','utf8'),panel=fs.readFileSync('forecast/pcs-panel.js','utf8');assert.match(html,/id="forecast-app" hidden/);assert.match(html,/data-forecast-src="outlet-workspace/);assert.ok(!/<script[^>]+\ssrc="(?:pcs-panel|outlets|analysis-data)\.js/.test(html));assert.ok(!panel.includes('await fetch('));assert.match(panel,/window.ForecastSecureData/);
 const rules=fs.readFileSync('integration/firestore-forecast-plans.rules.fragment','utf8');const staff=rules.split('function forecastStaff()')[1].split('match /forecastAccess')[0];assert.ok(!staff.includes('forecastAccess'));assert.match(staff,/'admin',false/);
});
test('trained snapshot uses per-variant point forecasts and labels tighter limits as input tolerance',()=>{
 const window={PcsMath:{},ForecastStudy:{recommendations:{ids:['a'],dates:{'2026-10-22':[Array(12).fill(10)]},through:'2026-10-20',tolerance:.1,validationAbsolute80Pcs:Array(12).fill(5),method:'pcs-pooled-locked-v2'}}};vm.runInNewContext(fs.readFileSync('forecast/forecast-planner-model.js','utf8'),{window,Date});const r=window.ForecastPlanner.recommend(null,null,'a','2026-10-22');assert.equal(r[0].central,10);assert.equal(r[0].low,9);assert.equal(r[0].high,11);assert.equal(r[0].tolerance,true);assert.equal(r[0].uncertainty80Pcs,5);assert.equal(window.ForecastPlanner.recommend(null,null,'a','2027-01-01')[0].central,null);
});

