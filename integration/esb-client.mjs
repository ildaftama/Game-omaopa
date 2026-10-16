const BASE='https://services.esb.co.id/core/';
const REPORTS=new Set(['stock-movement','sales-menu-cogs','sales-payment-summary']);
export function createEsbClient({username,password,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let token=null;
 async function request(path,options){
  for(let attempt=0;attempt<3;attempt++){
   const response=await fetcher(BASE+path,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
   if((response.status===429||response.status>=500)&&attempt<2){const seconds=Number(response.headers?.get('retry-after'));await pause(Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,3000):500*(attempt+1));continue;}
   return response;
  }
 }
 async function login(){
  if(!username||!password)throw Error('Akses ESB belum dikonfigurasi.');
  const response=await request('auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  if(!response.ok)throw Error('Login API ESB gagal (HTTP '+response.status+').');
  const body=await response.json();token=body.result?.accessToken;
  if(typeof token!=='string'||!token){token=null;throw Error('Token API ESB tidak tersedia.');}
 }
 async function report(name,params={}){
  if(!REPORTS.has(name))throw Error('Jenis laporan tidak didukung.');
  const path='report/'+name+'?'+new URLSearchParams(params);
  if(!token)await login();
  let response=await request(path,{headers:{Authorization:'Bearer '+token}});
  if(response.status===401){token=null;await login();response=await request(path,{headers:{Authorization:'Bearer '+token}});}
  if(!response.ok)throw Error('Laporan ESB gagal (HTTP '+response.status+').');
  const body=await response.json();if(body.result==null)throw Error('Hasil laporan ESB tidak tersedia.');return body.result;
 }
 async function pages(name,params={}){
  const rows=[];let expected=null;
  for(let page=1;page<=10000;page++){
   const result=await report(name,{...params,page});
   if(!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count<0)throw Error('Format halaman ESB tidak sesuai.');
   if(expected===null)expected=result.count;
   if(result.count!==expected)throw Error('Jumlah laporan berubah saat penarikan; ulangi snapshot.');
   rows.push(...result.data);
   if(rows.length>expected)throw Error('Jumlah baris ESB melebihi total laporan.');
   if(rows.length===expected)return{complete:true,count:expected,pages:page,rows};
   if(!result.data.length)throw Error('Penarikan ESB belum lengkap.');
  }
  throw Error('Batas halaman laporan terlampaui.');
 }
 return{report,pages,close(){token=null;username=null;password=null;}};
}
