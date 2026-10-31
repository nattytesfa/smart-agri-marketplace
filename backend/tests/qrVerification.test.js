jest.mock('../src/config/db', () => ({ connect: jest.fn(), query: jest.fn() }));
const pool = require('../src/config/db');
const service = require('../src/modules/transactionsEscrow/simulation.service');
const id = '11111111-1111-4111-8111-111111111111';
const aid = '22222222-2222-4222-8222-222222222222';
const buyer = '33333333-3333-4333-8333-333333333333';
const originalFlag = process.env.SIMULATED_PAYMENTS_ENABLED;
let db;
beforeEach(() => {
  process.env.SIMULATED_PAYMENTS_ENABLED = 'true';
  db = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(db);
});
afterEach(() => {
  if (originalFlag === undefined) delete process.env.SIMULATED_PAYMENTS_ENABLED;
  else process.env.SIMULATED_PAYMENTS_ENABLED = originalFlag;
  jest.clearAllMocks();
});

const setup = (token, allocation = {}) => {
  db.query.mockImplementation(async sql => {
    if (sql.startsWith('SELECT role')) return { rows: [{ role: 'buyer' }] };
    if (sql.startsWith('SELECT * FROM transactions')) return { rows: [{ transaction_id: id, buyer_id: buyer, simulation_version: 'v1', payment_mode: 'prototype', payment_status: 'simulated_paid', checkout_status: 'fulfilling' }] };
    if (sql.startsWith('SELECT * FROM transaction_allocations')) return { rows: [{ allocation_id: aid, transaction_id: id, delivery_status: 'ready', settlement_status: 'held', dispute_status: 'none', ...allocation }] };
    if (sql.startsWith('SELECT verification_id')) return { rows: token ? [token] : [] };
    return { rows: [] };
  });
};
const verify = () => service.verifyQr(id, aid, buyer, { qr_token: 'a'.repeat(43), confirm_delivery: true });

test.each([
  [{ expired: true }, 'DELIVERY_QR_EXPIRED'],
  [{ revoked_at: '2026-10-30', expired: true }, 'DELIVERY_QR_REPLACED'],
  [{ consumed_at: '2026-10-30' }, 'DELIVERY_QR_USED'],
  [null, 'DELIVERY_QR_INVALID'],
])('rejected QR has an actionable code and never mutates delivery: %s', async (token, code) => {
  setup(token);
  await expect(verify()).rejects.toMatchObject({ status: 409, publicCode: code });
  const sql = db.query.mock.calls.map(([query]) => query);
  expect(sql.some(query => /^(INSERT|UPDATE|DELETE)/.test(query))).toBe(false);
  expect(sql).toContain('ROLLBACK');
  expect(db.release).toHaveBeenCalled();
});

test.each([
  [{ dispute_status: 'open' }, 'DELIVERY_DISPUTED'],
  [{ delivery_status: 'delivered' }, 'DELIVERY_ALREADY_CONFIRMED'],
  [{ delivery_status: 'awaiting_fulfillment' }, 'DELIVERY_NOT_READY'],
])('state conflicts never consume a QR: %s', async (allocation, code) => {
  setup({ expired: false }, allocation);
  await expect(verify()).rejects.toMatchObject({ status: 409, publicCode: code });
  expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE delivery_verifications'))).toBe(false);
});

test('HTTP errors retain the reason and stable QR code without exposing internal details', () => {
  jest.spyOn(require('../src/config/logger'), 'error').mockImplementation(() => {});
  const handler = require('../src/middleware/errorHandler');
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  handler(Object.assign(new Error('QR expired. Ask the farmer for a new code.'), { status: 409, publicCode: 'DELIVERY_QR_EXPIRED' }), {}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: 'QR expired. Ask the farmer for a new code.', code: 'DELIVERY_QR_EXPIRED' });
  jest.restoreAllMocks();
});
