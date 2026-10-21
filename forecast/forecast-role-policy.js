'use strict';
(function(root){const api={allowed:r=>!!r&&(r.admin===true||r.super===true||r.master===true),manager:r=>!!r&&(r.super===true||r.master===true)};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ForecastRolePolicy=api;})(typeof window!=='undefined'?window:this);
