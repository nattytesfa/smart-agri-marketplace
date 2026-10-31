const supabaseAdmin = require('../config/supabaseClient');
const { resolveAccount, diagnostic } = require('./accountIdentity');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      diagnostic(req, 'authentication_rejected', 401);
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    // Ask Supabase to verify the token and return the user
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      diagnostic(req, 'authentication_rejected', 401);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request so controllers can use it
    req.authUser = user;
    req.account = await resolveAccount(user.id);
    const path = req.originalUrl?.split('?')[0];
    if (!req.account && path !== '/api/auth/register') {
      const status = path === '/api/auth/me' ? 404 : 403;
      diagnostic(req, 'account_required', status);
      return res.status(status).json({code:'ACCOUNT_REGISTRATION_REQUIRED',error:'No linked application account was found. Complete registration or contact support if this phone was already registered.'});
    }
    // Existing controllers use req.user.id for application ownership. Preserve
    // the original verified subject separately, including for registration.
    req.user = { ...user, id: req.account?.user_id || user.id };
    diagnostic(req, 'identity_resolved', null);
    res.once?.('finish', () => diagnostic(req, 'protected_request', res.statusCode));
    next();
  } catch (err) {
    diagnostic(req, 'authentication_unavailable', 503);
    res.status(503).json({ error: 'Account verification unavailable. Please retry.' });
  }
};

module.exports = authMiddleware;
