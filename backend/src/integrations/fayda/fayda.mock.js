// src/integrations/fayda/fayda.mock.js
//
// NOT part of the Implementation Guide's structure — this is a dev-only
// addition so you can build and test the whole flow before NIDP approves
// real sandbox credentials. Only mounted when FAYDA_MODE=mock (see
// modules/users/user.routes.js). Delete this file once you're fully on
// sandbox/production if you don't want it in the final submission.

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const issuedCodes = new Map();
const issuedTokens = new Map();

const FAKE_USERS = [
  {
    sub: 'fayda-mock-0001',
    fin: '6140798523917',
    name: 'Natnael Tesfaye',
    email: 'natnael.test@example.com',
    phone_number: '+251911000111',
    birthdate: '2001-03-14',
    gender: 'Male',
    picture: null,
    address: 'Adama, Oromia, Ethiopia',
  },
  {
    sub: 'fayda-mock-0002',
    fin: '2938471650284',
    name: 'Selamawit Bekele',
    email: 'selamawit.test@example.com',
    phone_number: '+251911000222',
    birthdate: '1998-07-02',
    gender: 'Female',
    picture: null,
    address: 'Hawassa, Sidama, Ethiopia',
  },
];

router.get('/authorize', (req, res) => {
  const { redirect_uri, state } = req.query;
  if (!redirect_uri) return res.status(400).send('Missing redirect_uri');

  const links = FAKE_USERS.map((u) => {
    const code = crypto.randomBytes(16).toString('hex');
    issuedCodes.set(code, u);
    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    return `<li><a href="${url.toString()}">Log in as ${u.name} (FIN: ${u.fin})</a></li>`;
  }).join('');

  res.send(`<h2>Mock Fayda — choose a test identity</h2><ul>${links}</ul>`);
});

router.post('/token', express.urlencoded({ extended: true }), (req, res) => {
  const { code } = req.body;
  const user = issuedCodes.get(code);
  if (!user) return res.status(400).json({ error: 'invalid_grant' });
  issuedCodes.delete(code);

  const access_token = crypto.randomBytes(24).toString('hex');
  issuedTokens.set(access_token, user);

  res.json({ access_token, token_type: 'Bearer', expires_in: 3600 });
});

router.get('/userinfo', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = issuedTokens.get(token);
  if (!user) return res.status(401).json({ error: 'invalid_token' });
  res.json(user);
});

module.exports = router;