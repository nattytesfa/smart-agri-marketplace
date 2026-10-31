jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const s = require('../src/modules/transactionsEscrow/simulation.service');
const token = require('../src/modules/traceabilityQr/qrToken.util');
const pool = require('../src/config/db');
const saved = { env: process.env.NODE_ENV, flag: process.env.SIMULATED_PAYMENTS_ENABLED };
afterEach(() => {
  process.env.NODE_ENV = saved.env;
  if (saved.flag === undefined) delete process.env.SIMULATED_PAYMENTS_ENABLED;
  else process.env.SIMULATED_PAYMENTS_ENABLED = saved.flag;
  jest.clearAllMocks();
});
test.each(['production', 'staging', ''])('simulation rejects unapproved environment %s', env => {
  process.env.NODE_ENV = env; process.env.SIMULATED_PAYMENTS_ENABLED = 'true';
  expect(() => s.enabled()).toThrow('disabled');
});
test.each(['development', 'test', 'demo'])('approved environment %s requires explicit opt in', env => {
  process.env.NODE_ENV = env; process.env.SIMULATED_PAYMENTS_ENABLED = 'false';
  expect(() => s.enabled()).toThrow('disabled');
  process.env.SIMULATED_PAYMENTS_ENABLED = 'true'; expect(s.enabled()).toBeUndefined();
});
test('QR utility produces unique 256-bit tokens and stable digests', () => {
  const values = Array.from({ length: 1000 }, () => token.generate());
  expect(new Set(values).size).toBe(1000);
  for (const value of values) {
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token.hash(value)).toMatch(/^[a-f0-9]{64}$/);
    expect(token.hash(value)).toBe(s.hash(value));
  }
});
test('disabled demo payment performs no database writes', async () => {
  process.env.NODE_ENV = 'production'; process.env.SIMULATED_PAYMENTS_ENABLED = 'true';
  await expect(s.pay('anything', 'buyer')).rejects.toMatchObject({ status: 503 });
  expect(pool.connect).not.toHaveBeenCalled(); expect(pool.query).not.toHaveBeenCalled();
});
