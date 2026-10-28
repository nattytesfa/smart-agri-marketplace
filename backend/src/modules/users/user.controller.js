// src/modules/users/user.controller.js
//
// Thin HTTP layer. Session usage here assumes `express-session` (or
// equivalent) is mounted in app.js — state/verifier must survive the
// redirect out to Fayda and back.

const crypto = require('crypto');
const faydaClient = require('../../integrations/fayda/fayda.client');
const userService = require('./user.service');
const verificationTickets = require('../../integrations/fayda/verificationTickets');

async function register(req, res) {
  // Plain phone-based registration — creates the base user row.
  // Fayda verification happens separately via /auth/fayda/login ->
  // /auth/fayda/callback; call that from the mobile app's "Verify
  // with Fayda" step and it'll link onto this same phone number.
  try {
    const { phone, faydaId = null, role, passwordHash, details } = req.body;

    const existing = await userService.findUserByPhone(phone);
    if (existing) {
      return res.status(409).json({ error: 'phone_already_registered' });
    }

    const userId = crypto.randomUUID();
    await userService.createUser(userId, phone, faydaId, role, passwordHash, details);

    if (role === 'farmer') {
      await userService.createFarmerProfile(userId, details?.storageType, details?.farmSize);
    } else if (role === 'buyer') {
      await userService.createBuyerProfile(userId, details?.buyerType, details?.businessName);
    }

    const user = await userService.getUserById(userId);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function login(req, res) {
  // Credential check itself happens via Supabase Auth on the client;
  // this just resolves the phone number to your own user row.
  try {
    const { phone } = req.body;
    const match = await userService.findUserByPhone(phone);
    if (!match) return res.status(404).json({ error: 'not_found' });

    const user = await userService.getUserById(match.user_id);
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

async function getUser(req, res) {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function startFaydaVerification(req, res, next) {
  try {
    const user = await userService.getUserById(req.user.id, req.user);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    res.set('Cache-Control', 'no-store');
    res.json({ ticket: verificationTickets.issue(user.user_id) });
  } catch (error) {
    next(error);
  }
}

function faydaLogin(req, res) {
  const userId = req.query.ticket
    ? verificationTickets.consume(req.query.ticket)
    : null;
  if (req.query.ticket && !userId) {
    return res.status(400).json({ error: 'Verification link expired. Start again from your profile.' });
  }
  const { authorizeUrl, state, verifier } = faydaClient.buildAuthorizeUrl();
  req.session.fayda_state = state;
  req.session.fayda_verifier = verifier;
  req.session.fayda_user_id = userId;
  req.session.fayda_expires = Date.now() + 10 * 60 * 1000;
  req.session.save((error) => {
    if (error) return res.status(500).json({ error: 'Could not start verification' });
    res.redirect(authorizeUrl);
  });
}

async function faydaCallback(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({ error, error_description });
  }
  if (!state || state !== req.session.fayda_state || Date.now() >= req.session.fayda_expires) {
    return res.status(400).json({ error: 'invalid_state', error_description: 'Possible CSRF — please retry login.' });
  }

  const verifier = req.session.fayda_verifier;
  const userId = req.session.fayda_user_id;
  delete req.session.fayda_state;
  delete req.session.fayda_verifier;
  delete req.session.fayda_user_id;
  delete req.session.fayda_expires;

  try {
    const tokens = await faydaClient.exchangeCodeForToken(code, verifier);
    const identity = await faydaClient.fetchUserInfo(tokens.access_token);

    // role can be passed through state/query from the mobile app's role
    // screen if you want it to vary; defaults to 'farmer' otherwise.
    const user = userId
      ? await userService.linkFaydaIdentity(userId, identity)
      : await userService.findOrCreateFromFayda(identity, req.query.role || 'farmer');

    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    if (userId && req.get('Accept')?.includes('text/html')) {
      return res.sendFile(require('path').join(__dirname, '../../../public/fayda/success.html'));
    }
    res.json({ verified: true, user });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(502).json({ error: 'fayda_verification_failed', detail: err.message });
  }
}

module.exports = { register, login, getUser, startFaydaVerification, faydaLogin, faydaCallback };
