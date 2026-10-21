import fs from'node:fs';import{createEsbClient}from'./esb-client.mjs';
const branches=new Map(JSON.parse(fs.readFileSync('integration/pcs-branches.json','utf8')).branches.map(b=>[b.id,b]));
const client=createEsbClient({username:process.env.ESB_USERNAME,password:process.env.ESB_PASSWORD});
try{
 for(const[id,date]of[['gajah-raya','2025-01-01'],['ngaliyan','2025-01-05'],['undip','2025-04-01'],['undip','2025-06-01'],['udinus','2026-02-13']]){
  const b=branches.get(id),r=await client.pages('sales-menu-cogs',{branchID:String(b.branchID),salesDate:date,salesMenuCogsType:'Standard',showMenuPackage:'1'}),groups=new Map();
  if(!r.complete)throw Error('Sampel belum lengkap.');
  for(const row of r.rows){if(row.salesType!=='Sales')continue;const key=row.menuName+'|'+row.rowType,g=groups.get(key)||{menu:row.menuName,type:row.rowType,qty:0,paid:0};g.qty+=row.qty;if(row.total-row.discountTotal>0)g.paid+=row.qty;groups.set(key,g);}
  console.log('MENU_AUDIT '+JSON.stringify({id,date,menus:[...groups.values()]}));
 }
}finally{client.close();}
