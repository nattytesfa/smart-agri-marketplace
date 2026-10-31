// Explicit, development-only installation of additive migration 009.
const fs = require('fs');
const pool = require('../config/db');
(async () => {
  const db = await pool.connect();
  try {
    if (process.env.NODE_ENV === 'production') throw new Error('Prototype migration command is restricted to development/demo databases');
    await db.query("SELECT pg_advisory_lock(hashtext('009_simulated_transactions'))");
    const installed = (await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='simulation_version'")).rowCount;
    if (installed) {
      for (const name of ['transaction_allocations','simulated_escrow_ledger','delivery_verifications','transaction_disputes','transaction_audit']) {
        if (!(await db.query('SELECT to_regclass($1) AS name', [`public.${name}`])).rows[0].name) throw new Error('Incomplete simulation migration; investigate before retrying');
      }
      console.log('Migration 009 is already installed; no records changed.');
    } else {
      await db.query(fs.readFileSync(require.resolve('../../db/migrations/009_simulated_transactions.sql'), 'utf8'));
      console.log('Installed migration 009 atomically. Existing checkouts and inventory retained. Simulation remains opt-in.');
    }
  } catch (e) { await db.query('ROLLBACK'); console.error(e.message); process.exitCode = 1; }
  finally {
    await db.query("SELECT pg_advisory_unlock(hashtext('009_simulated_transactions'))");
    db.release(); await pool.end();
  }
})();
