const pool = require('../config/db');
const { diagnostic } = require('./accountIdentity');

// Generic role-based access control middleware
const rbac = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT role FROM users WHERE user_id = $1',
        [req.user.id]
      );
      if (result.rows.length === 0 || !allowedRoles.includes(result.rows[0].role)) {
        const actual = result.rows[0]?.role;
        diagnostic(req, 'role_rejected', 403, { required_roles: allowedRoles });
        return res.status(403).json({
          error: actual ? `This account is registered as ${actual}. ${allowedRoles.join(' or ')} access is required. Sign in with the appropriate account.` : 'Complete account registration before starting checkout.',
          code: actual ? 'ROLE_REQUIRED' : 'ACCOUNT_REGISTRATION_REQUIRED',
          required_roles: allowedRoles, current_role: actual || null,
        });
      }
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

// Admin-only middleware
const isAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { rbac, isAdmin };
