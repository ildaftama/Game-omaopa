'use strict';
// Peran Forecast. Akun lama (nomor HP + PIN) memakai flag di staff/{uid}. Akun baru (ID + password,
// owner 2026-11-24) memakai forecastUsers/{uid} dan dipetakan ke flag yang sama lewat fromUser().
(function(root){
 const ROLE_LABEL={master:'Master',factory:'Factory Manager',spv:'SPV Logistik',forecaster:'Forecaster',analyst:'Data Analis',esbadmin:'Admin ESB',guest:'Tamu'};
 const api={
  allowed:r=>!!r&&(r.admin===true||r.super===true||r.master===true),
  manager:r=>!!r&&(r.super===true||r.master===true),
  planner:r=>!!r&&(r.admin===true||r.super===true||r.master===true||r.forecaster===true),
  forecasterOnly:r=>!!r&&r.forecaster===true&&r.admin!==true&&r.super!==true&&r.master!==true,
  // Boleh membuka web Forecast. Data Analis hanya melihat.
  viewer:r=>api.planner(r)||(!!r&&(r.analyst===true||r.esbadmin===true)),
  // Boleh masuk web. Tamu (pihak luar) hanya Kantor Agen AI dan chat, tanpa data.
  member:r=>api.viewer(r)||(!!r&&r.guest===true),
  guestOnly:r=>!!r&&r.guest===true&&!api.viewer(r),
  // Boleh mengubah pengaturan (ambang batas, produk, tampilan, sumber data).
  settingsEditor:r=>api.planner(r)&&r.noSettings!==true,
  // Boleh membuka bagian yang dulu khusus Master (Data pendukung, Eksperimen).
  fullSettings:r=>!!r&&(r.master===true||r.factory===true||r.spv===true),
  // Hanya Master yang mengelola akun.
  accountAdmin:r=>!!r&&r.master===true,
  // Boleh mengubah rencana setelah hari H (tercatat di log) dan melihat log perubahan.
  lateEditor:r=>!!r&&(r.master===true||r.factory===true||r.spv===true),
  logViewer:r=>!!r&&(r.master===true||r.factory===true),
  fromUser:d=>{
   if(!d||d.status!=='active')return null;
   const base={name:String(d.name||d.id||'').slice(0,60),fu:d.role,loginId:String(d.id||''),char:d.char||''};
   if(d.role==='master')return {...base,master:true,super:true};
   if(d.role==='factory')return {...base,super:true,factory:true};
   if(d.role==='spv')return {...base,super:true,spv:true};
   if(d.role==='forecaster')return {...base,forecaster:true,noSettings:true};
   if(d.role==='analyst')return {...base,analyst:true,noSettings:true};
   if(d.role==='esbadmin')return {...base,esbadmin:true,noSettings:true};
   if(d.role==='guest')return {...base,guest:true,noSettings:true};
   return null;
  },
  ROLE_LABEL,
  DOMAIN:'forecast.omaopa.fun',
 };
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ForecastRolePolicy=api;
})(typeof window!=='undefined'?window:this);
