const fs = require('fs');
const pool = require('../config/db');
(async () => {
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock(hashtext('010_account_auth_mapping'))");
    const installed = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='auth_user_id'")).rowCount;
    if (!installed) await db.query(fs.readFileSync(require.resolve('../../db/migrations/010_account_auth_mapping.sql'), 'utf8'));
    console.log(installed ? 'Migration 010 already installed; no changes.' : 'Installed migration 010; application IDs and roles preserved.');
  } catch (e) { await db.query('ROLLBACK'); console.error(e.message); process.exitCode = 1; }
  finally { await db.query("SELECT pg_advisory_unlock(hashtext('010_account_auth_mapping'))"); db.release(); await pool.end(); }
})();
