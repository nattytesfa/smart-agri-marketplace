const fs = require('fs');
const pool = require('../config/db');
(async () => {
  const db = await pool.connect();
  try {
    if (!['development','test','demo'].includes(process.env.NODE_ENV)) throw new Error('Set NODE_ENV=development, test, or demo for this prototype migration');
    await db.query("SELECT pg_advisory_lock(hashtext('011_demo_wallets'))");
    const installed = (await db.query("SELECT to_regclass('public.demo_wallet_entries') AS name")).rows[0].name;
    if (installed) console.log('Wallet migration already installed; no changes.');
    else {
      await db.query(fs.readFileSync(require.resolve('../../db/migrations/011_demo_wallets.sql'),'utf8'));
      console.log('Installed 011: demo wallets linked to existing escrow. Historical releases imported once.');
    }
  } catch(e) { await db.query('ROLLBACK'); console.error(e.message); process.exitCode=1; }
  finally { await db.query("SELECT pg_advisory_unlock(hashtext('011_demo_wallets'))"); db.release(); await pool.end(); }
})();
