import test from 'node:test';import assert from 'node:assert/strict';
import {calendarDays,parseMonthly,compareCohort,fitMonthly,monthlyForecast,MONTHLY_METHODS} from './seasonality.mjs';
const row=(date,daily)=>({date,amount:daily*calendarDays(date),daily,status:'observed'});
const series=()=>Array.from({length:36},(_,i)=>{const y=2024+Math.floor(i/12),m=i%12+1,date=y+'-'+String(m).padStart(2,'0');return row(date,1000*Math.exp(-.02*i)*(m===12?1.4:1));});
test('confirmed renames preserve history and closures across old and current source names',()=>{
 const cell=x=>({effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:x}}),names=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
 const source=(year,outlets)=>({sheets:[{properties:{title:'OUTLET '+year},data:outlets.map(name=>({startRow:1,startColumn:1,rowData:[{values:[cell(name+' (BUKA 1 JANUARI 2023)')]},{values:[cell('Bulan'),cell('Omzet')]},...names.map(m=>({values:[cell(m),cell(100)]}))]}))}]});
 const r=parseMonthly([source(2025,['Tlogosari','Masjid Riyadh','Banyumanik']),source(2026,['Chiffon Gajah','Borobudur','Pleburan'])],{}).rows;
 assert.deepEqual([...new Set(r.map(x=>x.id))].sort(),['borobudur','gajah-raya','pleburan']);
 assert.equal(r.filter(x=>x.id==='gajah-raya'&&x.status==='observed').length,21);
 for(const id of ['borobudur','pleburan']){assert.equal(r.find(x=>x.id===id&&x.date==='2026-01').status,'observed');assert.equal(r.find(x=>x.id===id&&x.date==='2026-02').status,'closed');}
 assert.equal(r.find(x=>x.id==='gajah-raya'&&x.date==='2025-01').name,'Tlogosari');
 assert.throws(()=>parseMonthly([source(2025,['Tlogosari','Chiffon Gajah'])],{}),/Duplicate monthly/);
});
test('calendar normalization handles leap years; month totals are not treated as daily means',()=>{assert.equal(calendarDays('2024-02'),29);assert.equal(calendarDays('2025-02'),28);assert.equal(calendarDays('2026-12'),31);const rs=['2025-10','2025-11','2025-12'].map(d=>row(d,100));assert.equal(monthlyForecast(rs,'2026-01','median-3').prediction,3100);});
test('opening partial month and confirmed closure do not become low-demand observations',()=>{
 const cell=x=>({effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:x}}),names=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
 const block={startRow:1,startColumn:1,rowData:[{values:[cell('A (BUKA 15 FEBRUARI 2024)')]},{values:[cell('Bulan'),cell('Omzet')]},...names.map(m=>({values:[cell(m),cell(100)]}))]};
 const result=parseMonthly([{sheets:[{properties:{title:'OUTLET 2024'},data:[block]}]}],{a:'a'},{through:'2024-12',closures:{a:'2024-09'}});
 assert.equal(result.rows[0].status,'not-open');assert.equal(result.rows[1].status,'opening-partial');assert.equal(result.rows[2].status,'observed');assert.equal(result.rows[8].status,'closed');assert.equal(result.rows[2].sourceCell,'C6');
});
test('every monthly candidate ignores target and later actuals',()=>{
 const rs=series(),target='2026-04',changed=rs.map(r=>r.date>=target?row(r.date,r.daily*999):r);
 for(const m of MONTHLY_METHODS)assert.deepEqual(monthlyForecast(rs,target,m),monthlyForecast(changed,target,m));
 const a=fitMonthly(rs,target),b=fitMonthly(changed,target);assert.equal(a.predict('2026-12'),b.predict('2026-12'));assert.ok(a.annualTrendPercent<0);assert.ok(a.predict('2026-12')>a.predict('2026-11'));
});
test('cohort comparison keeps identical outlets and months; missing cannot become zero',()=>{
 const rows=[{id:'a',...row('2024-09',100)},{id:'a',...row('2025-09',80)},{id:'b',...row('2024-09',100)}],r=compareCohort(rows,['a','b'],['2024-09'],['2025-09']);
 assert.equal(r.outlets,1);assert.ok(Math.abs(r.changePercent+20)<1e-8);assert.deepEqual(r.excluded,['b']);
});
