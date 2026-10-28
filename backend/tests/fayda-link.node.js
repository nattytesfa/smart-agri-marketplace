const { test } = require('node:test');
const assert = require('node:assert/strict');
const tickets = require('../src/integrations/fayda/verificationTickets');

const queries = [];
let owner;
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query: async (sql, args) => {
    queries.push({ sql, args });
    if (sql.startsWith('SELECT')) return { rows: owner ? [owner] : [] };
    return { rows: [{ user_id: args[0], fayda_verified: true }] };
  },
} };
const { linkFaydaIdentity } = require('../src/modules/users/user.service');

test('browser ticket is bound to an account and usable only once', () => {
  const ticket = tickets.issue('signed-in-user');
  assert.equal(tickets.consume(ticket), 'signed-in-user');
  assert.equal(tickets.consume(ticket), null);
  assert.equal(tickets.consume('invalid'), null);
});

test('expired browser ticket is rejected', () => {
  const now = Date.now;
  try {
    const ticket = tickets.issue('user');
    Date.now = () => now() + 6 * 60 * 1000;
    assert.equal(tickets.consume(ticket), null);
  } finally {
    Date.now = now;
  }
});

test('links only the authenticated account, not the identity phone number', async () => {
  owner = null;
  queries.length = 0;
  const result = await linkFaydaIdentity('signed-in-user', {
    sub: 'verified-subject', phone_number: 'different-phone',
  });
  assert.equal(result.user_id, 'signed-in-user');
  assert.equal(result.fayda_verified, true);
  assert.deepEqual(queries[1].args, ['signed-in-user', 'verified-subject']);
});

test('rejects identity already owned by a different account without updating it', async () => {
  owner = { user_id: 'another-user' };
  queries.length = 0;
  await assert.rejects(linkFaydaIdentity('signed-in-user', { sub: 'subject' }),
    { status: 409 });
  assert.equal(queries.length, 1);
});

test('rejects missing identity rather than claiming success', async () => {
  await assert.rejects(linkFaydaIdentity('signed-in-user', {}), { status: 502 });
});

const clientPath = require.resolve('../src/integrations/fayda/fayda.client');
require.cache[clientPath] = { id: clientPath, filename: clientPath, loaded: true, exports: {
  exchangeCodeForToken: async () => ({ access_token: 'test-token' }),
  fetchUserInfo: async () => ({ sub: 'verified-subject' }),
} };
const { faydaCallback } = require('../src/modules/users/user.controller');

test('linked browser callback shows a success page without exposing identity data', async () => {
  owner = null;
  const req = {
    query: { code: 'code', state: 'state' },
    session: { fayda_state: 'state', fayda_verifier: 'verifier',
      fayda_user_id: 'signed-in-user', fayda_expires: Date.now() + 60000 },
    get: () => 'text/html,application/xhtml+xml',
  };
  const headers = {};
  let sentFile;
  const res = {
    set: (name, value) => { headers[name] = value; },
    sendFile: (file) => { sentFile = file; },
    json: () => assert.fail('Browser must not receive identity JSON'),
  };
  await faydaCallback(req, res);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  const html = require('fs').readFileSync(sentFile, 'utf8');
  assert.match(html, /You're verified!/);
  assert.match(html, /Continue in the mobile app/);
  assert.ok(!html.includes('verified-subject'));
});

test('API callback keeps the JSON response', async () => {
  owner = null;
  let response;
  await faydaCallback({
    query: { code: 'code', state: 'state' },
    session: { fayda_state: 'state', fayda_verifier: 'verifier',
      fayda_user_id: 'signed-in-user', fayda_expires: Date.now() + 60000 },
    get: () => 'application/json',
  }, { set: () => {}, json: value => { response = value; } });
  assert.equal(response.verified, true);
  assert.equal(response.user.user_id, 'signed-in-user');
});
