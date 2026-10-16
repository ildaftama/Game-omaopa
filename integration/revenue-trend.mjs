// Only source blocks explicitly marked without orders can enter this series.
export function buildRevenueTrend(sources,aliases,profiles,{asOf='2026-10-16'}={}){
 const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,''),finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const records=[],issues=[],seen=new Set();
 for(const source of Object.values(sources)){
  const grid=source.values;
  for(let c=1;c<grid[0].length;c+=10){
   const serial=grid[0][c];if(!Number.isFinite(serial))continue;
   const date=new Date((serial-25569)*864e5).toISOString().slice(0,10);if(!date.startsWith('2026-')||date>=asOf)continue;
   const headers=grid[1].slice(c,c+10).map(norm),scope=norm(grid[2]?.[c]);
   if(!scope.includes('tanpapesanan')||!scope.includes('tanpaminicisfon'))throw Error('Order exclusion scope not confirmed for '+date);
   if(headers[2]!=='omsetreal'||headers[4]!=='malmil'||headers[5]!=='ogura')throw Error('Revenue columns changed');
   for(let r=3;r<grid.length;r++){
    const row=grid[r],id=aliases[norm(row[0])];if(!profiles[id])continue;
    const key=id+'|'+date;if(seen.has(key))throw Error('Duplicate outlet/date');seen.add(key);
    const actual=row[c+2],malmil=row[c+4],ogura=row[c+5];
    if(!finite(actual)){issues.push({id,date,reason:'missing-actual'});continue;}
    // Chart the recorded actual in the labelled scope. Do not replace it with a
    // family sum: their difference is retained for reconciliation, not imputed.
    if(![malmil,ogura].every(finite)||Math.abs(actual-malmil-ogura)>1)issues.push({id,date,reason:'component-reconciliation-pending'});
    records.push({id,date,amount:actual});
   }
  }
 }
 const ids=Object.keys(profiles),dates=[...new Set(records.map(r=>r.date))].sort(),first=dates[0],through=dates.at(-1);
 const allDates=[];if(first)for(let d=first;d<=through;d=new Date(Date.parse(d+'T00:00:00Z')+864e5).toISOString().slice(0,10))allDates.push(d);
 const names=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
 const summarize=rs=>{
  const byDate=new Map(rs.map(r=>[r.date,r.amount]));
  const daily=allDates.map(date=>({date,label:date,amount:byDate.get(date)??null}));
  const monthly=names.map((label,i)=>{const month='2026-'+String(i+1).padStart(2,'0'),rows=rs.filter(r=>r.date.startsWith(month));return{month,label,days:rows.length,amount:rows.length?rows.reduce((s,r)=>s+r.amount,0)/rows.length:null};});
  return {daily,monthly};
 };
 const networkRows=dates.flatMap(date=>{const rs=records.filter(r=>r.date===date);return rs.length===ids.length&&new Set(rs.map(r=>r.id)).size===ids.length?[{date,amount:rs.reduce((s,r)=>s+r.amount,0)}]:[];});
 const outlets=Object.fromEntries(ids.map(id=>[id,{name:profiles[id].name,...summarize(records.filter(r=>r.id===id))}]));
 return {public:{year:2026,metric:'Malmil & Ogura, without orders, per source scope',from:first,through,coverageLabel:first?`${Number(first.slice(8))} ${names[Number(first.slice(5,7))-1]}–${Number(through.slice(8))} ${names[Number(through.slice(5,7))-1]} 2026`:'Belum tersedia',network:summarize(networkRows),outlets},private:{records,issues,completeNetworkDays:networkRows.length}};
}
