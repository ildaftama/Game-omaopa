import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const [auditPath,databasePath,asOf]=process.argv.slice(2);
if(!auditPath||!databasePath||!/^\d{4}-\d{2}-\d{2}$/.test(asOf||''))throw Error('Required: PRIVATE_AUDIT_JSON PRIVATE_DATABASE YYYY-MM-DD');
const bytes=fs.readFileSync(auditPath),audit=JSON.parse(bytes),hash=createHash('sha256').update(bytes).digest('hex');
const db=new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS forecast_runs (id TEXT PRIMARY KEY, as_of TEXT NOT NULL, imported_at TEXT NOT NULL, audit_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS product_sales_versions (run_id TEXT NOT NULL REFERENCES forecast_runs(id), outlet_id TEXT NOT NULL, product TEXT NOT NULL, sales_date TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, zero_closing INTEGER NOT NULL, PRIMARY KEY(run_id,outlet_id,product,sales_date)); CREATE TABLE IF NOT EXISTS forecast_tracking_versions (run_id TEXT NOT NULL REFERENCES forecast_runs(id), outlet_id TEXT NOT NULL, sales_date TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(run_id,outlet_id,sales_date));');
const exists=db.prepare('SELECT id FROM forecast_runs WHERE id=?').get(hash);
if(!exists){
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('INSERT INTO forecast_runs VALUES (?,?,?,?)').run(hash,asOf,new Date().toISOString(),bytes.toString());
  const stock=db.prepare('INSERT INTO product_sales_versions VALUES (?,?,?,?,?,?,?)');
  for(const r of audit.stock.series)stock.run(hash,r.id,r.product,r.date,r.quantity,r.unit,Number(r.zeroClosing));
  const tracking=db.prepare('INSERT INTO forecast_tracking_versions VALUES (?,?,?,?)');
  for(const r of audit.tracking.rows)tracking.run(hash,r.id,r.date,JSON.stringify(r));
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
console.log(JSON.stringify({archived:true,alreadyPresent:!!exists,productRecords:db.prepare('SELECT COUNT(*) AS n FROM product_sales_versions WHERE run_id=?').get(hash).n,trackingRecords:db.prepare('SELECT COUNT(*) AS n FROM forecast_tracking_versions WHERE run_id=?').get(hash).n}));db.close();
