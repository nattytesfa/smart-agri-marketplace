const pool = require('../config/db');

// Only the server-managed mapping (or legacy exact UUID) is authoritative.
// No runtime phone fallback, client user ID, token role or metadata role is used.
exports.resolveAccount = async authId => (await pool.query(`SELECT user_id,role FROM users
 WHERE auth_user_id=$1 OR (auth_user_id IS NULL AND user_id=$1)
 ORDER BY (auth_user_id=$1) DESC NULLS LAST LIMIT 1`, [authId])).rows[0] || null;
exports.diagnostic = (req, event, status, extra = {}) => {
  if (process.env.AUTH_DIAGNOSTICS !== 'true') return;
  console.info(JSON.stringify({ event, method: req.method, path: req.originalUrl?.split('?')[0], status,
    supabase_user_id: req.authUser?.id, application_user_id: req.account?.user_id,
    application_role: req.account?.role, ...extra }));
};
