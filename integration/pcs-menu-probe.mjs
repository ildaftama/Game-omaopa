import fs from'node:fs';import{createEsbClient}from'./esb-client.mjs';
const branches=new Map(JSON.parse(fs.readFileSync('integration/pcs-branches.json','utf8')).branches.map(b=>[b.id,b]));
const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
try{
 for(const[id,date]of[['undip','2025-02-04'],['muntilann','2026-04-15']]){
  const b=branches.get(id),r=await client.pages('sales-menu-cogs',{branchID:String(b.branchID),salesDate:date,salesMenuCogsType:'Standard',showMenuPackage:'1'}),groups=new Map();
  if(!r.complete)throw Error('Sampel belum lengkap.');
  for(const row of r.rows){if(row.salesType!=='Sales')continue;const key=row.menuName+'|'+row.rowType,g=groups.get(key)||{menu:row.menuName,type:row.rowType,qty:0,paid:0};g.qty+=row.qty;if(row.total-row.discountTotal>0)g.paid+=row.qty;groups.set(key,g);}
  console.log('MENU_AUDIT '+JSON.stringify({id,date,menus:[...groups.values()]}));
  const ledger=await client.report('profit-loss/daily-in-month',{year:date.slice(0,4),month:String(Number(date.slice(5,7))),branchIDs:String(b.branchID),flagShowZeroValue:'true'});
  console.log('EMPTY_AUDIT '+JSON.stringify({id,date,menuCount:r.count,salesAccounts:(ledger.sales||[]).map(row=>({description:row.description,access:row.hasViewAccess,day:row.details?.flatMap(d=>d.periods||[]).filter(p=>p.key===date.slice(-2))}))}));
  const payments=await client.report('sales-payment-summary',{salesDate:date});
  console.log('PAYMENTS_AUDIT '+JSON.stringify({id,date,records:payments.filter(row=>row.branchName===b.branchName).map(row=>({salesDate:row.salesDate,paymentCount:row.payments?.reduce((n,p)=>n+p.paymentCount,0)}))}));
 }
}finally{client.close();}
