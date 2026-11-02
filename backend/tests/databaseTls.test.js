const { databaseOptions } = require('../src/config/databaseTls');
const crypto = require('crypto');
test('Supabase connection validates CA and hostname even with URL SSL overrides', () => {
  const options = databaseOptions('postgresql://user:password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=no-verify&ssl=false&uselibpqcompat=true',{});
  expect(options.ssl.rejectUnauthorized).toBe(true);
  expect(options.ssl.servername).toBe('aws-0-test.pooler.supabase.com');
  expect(new crypto.X509Certificate(options.ssl.ca).fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  expect(options.connectionString).not.toMatch(/ssl|uselibpqcompat/);
});
test('non-Supabase connections retain verified default platform trust, not Supabase trust', () => {
  expect(databaseOptions('postgresql://user:password@database.example/db',{}).ssl)
    .toEqual({ rejectUnauthorized: true, servername: 'database.example' });
});
test('missing configured CA fails closed rather than disabling verification', () => {
  expect(() => databaseOptions('postgresql://database.example/db',{ DATABASE_CA_CERT_PATH: '/missing/approved-ca.crt' })).toThrow();
});
test('configuration errors do not expose a malformed credential-bearing URL', () => {
  expect(() => databaseOptions('not-a-url-with-a-sensitive-value',{})).toThrow('Valid PostgreSQL DATABASE_URL required');
});
