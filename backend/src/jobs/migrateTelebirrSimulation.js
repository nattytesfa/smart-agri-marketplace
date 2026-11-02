const fs=require('fs');
const pool=require('../config/db');
(async()=>{
 const db=await pool.connect();
 try {
  if(!['development','demo','test'].includes(process.env.NODE_ENV)) throw new Error('Demo migration requires a non-production development environment');
  await db.query("SELECT pg_advisory_lock(hashtext('014_telebirr_simulation'))");
  for(const table of ['demo_wallet_entries','telebirr_uat_funding']) {
   if(!(await db.query('SELECT to_regclass($1) AS name',[`public.${table}`])).rows[0].name) throw new Error('Install unchanged prerequisite migrations 011, 012 and 013 first');
  }
  if(!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='telebirr_uat_funding' AND column_name='sdk_contract'")).rowCount) throw new Error('Install unchanged migration 013 first');
  if((await db.query("SELECT to_regclass('public.telebirr_demo_payments') AS name")).rows[0].name) console.log('014 already installed');
  else {await db.query(fs.readFileSync(require.resolve('../../db/migrations/014_telebirr_simulation.sql'),'utf8'));console.log('Installed 014: virtual simulation only');}
 } catch(e){await db.query('ROLLBACK');console.error(e.message);process.exitCode=1;}
 finally {await db.query("SELECT pg_advisory_unlock(hashtext('014_telebirr_simulation'))");db.release();await pool.end();}
})().catch(()=>{console.error('Simulation migration database unavailable');process.exitCode=1;pool.end();});
