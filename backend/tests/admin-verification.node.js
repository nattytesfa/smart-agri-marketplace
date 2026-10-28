const { test } = require('node:test');
const assert = require('node:assert/strict');
const calls = [];
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query: async (sql, args) => {
    calls.push({ sql, args });
    return { rows: [{ user_id: 'test-user', fayda_verified: true, fayda_verified_at: '2026-10-28' }] };
  },
} };
const service = require('../src/modules/admin/admin.service');
const controller = require('../src/modules/admin/admin.controller');

test('admin verification is read-only; manual approval handlers are removed', () => {
  assert.equal(controller.verifyUser, undefined);
  assert.equal(service.verifyUser, undefined);
});

test('pending remains the default; verified and all are supported', async () => {
  for (const [status, expected] of [[undefined, false], ['verified', true], ['all', null]]) {
    const rows = await service.getPendingUsers(status);
    assert.deepEqual(calls.at(-1).args, [expected]);
    assert.match(calls.at(-1).sql, /u.fayda_verified_at/);
    assert.equal(rows[0].fayda_verified, true);
  }
});

test('detail lookup includes verified users instead of searching the pending queue', async () => {
  const user = await service.getUser('test-user');
  assert.deepEqual(calls.at(-1).args, ['test-user']);
  assert.match(calls.at(-1).sql, /WHERE u.user_id = \$1/);
  assert.equal(user.fayda_verified, true);
});

test('invalid verification filter is rejected without querying the database', async () => {
  const before = calls.length;
  let status;
  await controller.getPendingUsers({ query: { status: 'invalid' } }, {
    status: value => { status = value; return { json: () => {} }; },
  }, error => { throw error; });
  assert.equal(status, 400);
  assert.equal(calls.length, before);
});
