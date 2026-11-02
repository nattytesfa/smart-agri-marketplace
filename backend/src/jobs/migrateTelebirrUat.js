const fs = require('fs');
const pool = require('../config/db');
(async () => {
  const db = await pool.connect();
  try {
    if (!['development','test','demo'].includes(process.env.NODE_ENV)) throw new Error('UAT migration requires a development/test/demo environment');
    await db.query("SELECT pg_advisory_lock(hashtext('012_telebirr_uat_funding'))");
    const installed = (await db.query("SELECT to_regclass('public.telebirr_uat_funding') AS name")).rows[0].name;
    if (installed) console.log('Telebirr UAT migration already installed');
    else {
      await db.query(fs.readFileSync(require.resolve('../../db/migrations/012_telebirr_uat_funding.sql'),'utf8'));
      console.log('Installed separate Telebirr UAT records; no demo wallet changes');
    }
    const context = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='telebirr_uat_funding' AND column_name='sdk_contract'")).rowCount;
    if (!context) {
      await db.query(fs.readFileSync(require.resolve('../../db/migrations/013_telebirr_uat_sdk_context.sql'),'utf8'));
      console.log('Installed validated SDK context; payment finalization and wallet credits remain blocked');
    }
  } catch (_) { await db.query('ROLLBACK'); console.error('UAT migration failed; verify database access and prerequisite migrations'); process.exitCode = 1; }
  finally { await db.query("SELECT pg_advisory_unlock(hashtext('012_telebirr_uat_funding'))"); db.release(); await pool.end(); }
})().catch(() => { console.error('UAT migration database unavailable'); process.exitCode = 1; pool.end(); });
