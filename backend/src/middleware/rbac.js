const pool = require('../config/db');

// Generic role-based access control middleware
const rbac = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT role FROM users WHERE user_id = $1',
        [req.user.id]
      );
      if (result.rows.length === 0 || !allowedRoles.includes(result.rows[0].role)) {
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
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