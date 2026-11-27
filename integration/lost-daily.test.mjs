import test from 'node:test';
import assert from 'node:assert/strict';
import {computeDay,mergeLostDay,prior,mergeTf} from './lost-daily.mjs';

const flat=Array(12).fill(1);
const profile={outlets:{a:{0:[flat,flat]},b:{0:[flat,flat]}}};
const date='2026-11-25';// Rabu
const history={kind:'lost-daily',days:{}};
for(let k=1;k<=21;k++){const d=new Date(Date.parse(date+'T00:00:00Z')-k*864e5).toISOString().slice(0,10);history.days[d]={a:{0:[12,0,0,0]},b:{0:[12,0,0,0]}};}

test('acuan permintaan dari riwayat, hari habis dinaikkan',()=>{
 assert.equal(prior(history,'a',0,date),12);
 assert.equal(prior({days:{}},'a',0,date),null);
});

test('habis jam 14 dengan pola rata: lost = setengah hari',()=>{
 const live={date,daily:{a:{0:[0,6,0,0,0,null]}},snaps:[{t:'11:00',s:{a:[3]}},{t:'13:45',s:{a:[5]}},{t:'14:15',s:{a:[6]}},{t:'19:00',s:{a:[6]}}]};
 const c=computeDay(live,{profile,history}).a[0];
 assert.equal(c[0],6);assert.equal(c[3],1);assert.equal(c[2],1400);
 assert.ok(Math.abs(c[1]-6)<0.6,`lost ${c[1]}`);
});

test('tidak habis: lost 0',()=>{
 const live={date,daily:{a:{0:[0,20,0,0,0,null]}},snaps:[{t:'19:45',s:{a:[12]}}]};
 assert.deepEqual(computeDay(live,{profile,history}).a[0],[12,0,0,0]);
});

test('kosong lalu terisi transfer: lost hanya selama kosong',()=>{
 const live={date,daily:{a:{0:[0,4,0,0,0,null]},b:{0:[0,30,0,0,0,null]}},snaps:[{t:'09:45',s:{a:[2],b:[1]}},{t:'10:15',s:{a:[4],b:[1]}},{t:'12:15',s:{a:[4],b:[2]}},{t:'19:45',s:{a:[9],b:[10]}}]};
 const c=computeDay(live,{profile,history,transfers:[{date,time:'12:00',from:'b',to:'a',items:{0:5}}]}).a[0];
 assert.equal(c[3],1);// habis lagi di akhir hari (4+5 terjual 9)
 assert.ok(c[1]>0);
});

test('Daily Report menentukan jumlah, web menentukan jam',()=>{
 const ev=mergeTf([{h:13,d:5}],8,0);assert.deepEqual(ev,[{h:13,d:8}]);
 assert.deepEqual(mergeTf([],3,0),[{h:8,d:3}]);
});

test('hari dari riwayat transaksi tidak ditimpa hitungan otomatis',()=>{
 const doc=mergeLostDay(null,'2026-11-20',{a:{0:[5,1,1500,1]}},'tx');
 const next=mergeLostDay(doc,'2026-11-20',{a:{0:[5,9,1500,1]}},'live');
 assert.equal(next.days['2026-11-20'].a[0][1],1);
});
