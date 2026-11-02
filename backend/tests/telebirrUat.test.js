jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
const crypto = require('crypto');
const { canonicalize, sign, config, createProvider, sdkInitialization, BASE_URL } = require('../src/modules/telebirrUat/provider');
const { createService } = require('../src/modules/telebirrUat/service');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const c = { MERCHANT_APP_ID: 'merchanttest', FABRIC_APP_ID: 'fabric-test', SHORT_CODE: '123456', APP_SECRET: 'test-only-not-a-real-secret', NOTIFY_URL: 'https://merchant.example/notify', privateKey };
const buyer = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const order = { amount_minor: '1234', merchant_reference: 'testorder' };
const environment = { NODE_ENV: 'test', TELEBIRR_UAT_ENABLED: 'true', TELEBIRR_ENV: 'uat',
  TELEBIRR_MERCHANT_APP_ID: c.MERCHANT_APP_ID, TELEBIRR_FABRIC_APP_ID: c.FABRIC_APP_ID,
  TELEBIRR_SHORT_CODE: c.SHORT_CODE, TELEBIRR_APP_SECRET: c.APP_SECRET,
  TELEBIRR_NOTIFY_URL: c.NOTIFY_URL,
  TELEBIRR_PRIVATE_KEY_BASE64: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64') };
const fixture = () => {
  let row;
  const events = new Set();
  const db = { release: jest.fn() };
  db.query = jest.fn(async (sql, args = []) => {
    if (sql.startsWith('SELECT pg_advisory') || ['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.startsWith('SELECT role')) return { rows: [{ role: 'buyer' }] };
    if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
    if (sql.startsWith('SELECT * FROM telebirr_uat_funding')) {
      const match = sql.includes('idempotency_key') ? row?.buyer_id === args[0] && row?.idempotency_key === args[1] : row?.funding_id === args[0] && row?.buyer_id === args[1];
      return { rows: match ? [{ ...row }] : [] };
    }
    if (sql.startsWith('SELECT funding_id')) return { rows: row ? [{ funding_id: row.funding_id, buyer_id: buyer }] : [] };
    if (sql.startsWith('INSERT INTO telebirr_uat_funding')) {
      row = { funding_id: id, buyer_id: args[0], amount_minor: args[1], merchant_reference: args[2], idempotency_key: args[3],
        status: 'pending', provider: 'telebirr', provider_environment: 'uat', currency: 'ETB', provider_reference: null,
        verification_attempts: 0, verified_at: null, created_at: new Date(), expires_at: new Date(Date.now()+7200000) };
      return { rows: [{ ...row }] };
    }
    if (sql.startsWith('INSERT INTO telebirr_uat_audit')) { events.add(JSON.stringify(args)); return { rows: [] }; }
    if (sql.startsWith('UPDATE telebirr_uat_funding SET provider_reference')) {
      Object.assign(row,{ provider_reference: args[1], status: args[2], reconciliation_reason: args[3],
        sdk_app_id: args[4], sdk_short_code: args[5], sdk_timeout_express: args[6], sdk_contract: args[7] });
      return { rows: [{ ...row }] };
    }
    if (sql.startsWith('UPDATE telebirr_uat_funding SET status')) {
      Object.assign(row,{ status: args[1], reconciliation_reason: args[2], verification_attempts: args[3], next_verification_at: args[3] >= 8 ? null : new Date(Date.now()+args[4]*1000) });
      return { rows: [{ ...row }] };
    }
    throw new Error('Unexpected test SQL');
  });
  db.connect = jest.fn(async () => db);
  const provider = { configuration: jest.fn(() => c), preorder: jest.fn(async () => ({ prepayId: 'prepay-test' })),
    verify: jest.fn(async () => ({ authoritative: false })) };
  return { db, provider, service: createService({ db, provider }), events, row: () => row };
};
const input = { amount: '12.34', idempotency_key: 'request-key-1234' };

test('canonicalization matches official flattened ASCII field ordering', () => {
  expect(canonicalize({ version: '1.0', sign: 'excluded', sign_type: 'ignored', biz_content: { z: 'Z', appid: 'M' }, a: 'A' }))
    .toBe('a=A&appid=M&version=1.0&z=Z');
});
test('RSA-PSS SHA256 signature uses a 32-byte salt', () => {
  const request = { timestamp: '1', biz_content: { appid: 'test' } };
  expect(crypto.verify('sha256',Buffer.from(canonicalize(request)),{ key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },Buffer.from(sign(request,privateKey),'base64'))).toBe(true);
});
test('signing failures have sanitized errors', () => expect(() => sign({ a: 'test' },'bad-key')).toThrow('SIGNING_FAILED'));
test.each([{ ...environment, NODE_ENV: 'production' },{ ...environment, TELEBIRR_ENV: 'production' },{ ...environment, TELEBIRR_UAT_ENABLED: 'false' },{ ...environment, TELEBIRR_APP_SECRET: '' },{ ...environment, TELEBIRR_PRIVATE_KEY_BASE64: 'bad' }])('invalid or production configuration fails closed', env => expect(() => config(env)).toThrow());
test('merchant-specific private key loads only on backend', () => expect(config(environment).privateKey.asymmetricKeyType).toBe('rsa'));
test('base64 DER PKCS8 imports the same signing key without rewriting key material', () => {
  const encoded = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const env = { ...environment, TELEBIRR_PRIVATE_KEY_BASE64: encoded };
  const imported = config(env).privateKey;
  const request = { timestamp: '1', biz_content: { appid: 'test' } };
  expect(crypto.verify('sha256', Buffer.from(canonicalize(request)), {
    key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  }, Buffer.from(sign(request, imported), 'base64'))).toBe(true);
  expect(env.TELEBIRR_PRIVATE_KEY_BASE64).toBe(encoded);
});
test.each([
  crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey,
  crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey,
])('DER PKCS8 still rejects non-RSA or undersized keys with sanitized errors', key => {
  const encoded = key.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  expect(() => config({ ...environment, TELEBIRR_PRIVATE_KEY_BASE64: encoded })).toThrow('UAT_PRIVATE_KEY_INVALID');
});
test('malformed DER PKCS8 has a sanitized error', () => {
  expect(() => config({ ...environment, TELEBIRR_PRIVATE_KEY_BASE64: Buffer.from([0x30, 0x01, 0x00]).toString('base64') }))
    .toThrow('UAT_PRIVATE_KEY_INVALID');
});
test.each([{ TELEBIRR_NOTIFY_URL: '' },{ TELEBIRR_NOTIFY_URL: 'http://merchant.example/notify' },
  { TELEBIRR_NOTIFY_URL: 'https://merchant.example/notify?token=not-allowed' },
  { TELEBIRR_MERCHANT_APP_ID: 'merchant-with-hyphens' },{ TELEBIRR_SHORT_CODE: '012345' }])('SDK-specific merchant configuration fails closed', override => {
  expect(() => config({ ...environment,...override })).toThrow();
});
test.each([{ a: 'unsafe&value' },{ biz_content: { x: 1 } },{ x: '1', biz_content: { x: '2' } }])('ambiguous signing input rejected', req => expect(() => canonicalize(req)).toThrow());

test('valid preorder uses official headers/endpoints, authoritative cents and verified TLS', async () => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'test-token' } }).mockResolvedValueOnce({ data: {
    result: 'SUCCESS', code: '0', biz_content: { merch_order_id: order.merchant_reference, prepay_id: 'prepaytest', receiveCode: 'TELEBIRR$BUYGOODS$123456$12.34$prepaytest$120m' },
  } }) };
  const provider = createProvider({ http, getConfig: () => c });
  expect(await provider.preorder(order)).toEqual({ prepayId: 'prepaytest', sdkContext: { appId: c.MERCHANT_APP_ID, shortCode: c.SHORT_CODE, timeoutExpress: '120m', contract: 'inapp_create_order_v1' } });
  expect(http.post.mock.calls[0]).toEqual([`${BASE_URL}/payment/v1/token`,{ appSecret: c.APP_SECRET },expect.objectContaining({ timeout: 12000, maxRedirects: 0, headers: expect.objectContaining({ 'X-APP-Key': c.FABRIC_APP_ID }) })]);
  const [url,request,options] = http.post.mock.calls[1];
  expect(url).toBe(`${BASE_URL}/payment/v1/inapp/createOrder`);
  expect(request.biz_content).toMatchObject({ total_amount: '12.34', merch_order_id: 'testorder', trans_currency: 'ETB', trade_type: 'Cross-App', business_type: 'BuyGoods', notify_url: c.NOTIFY_URL });
  expect(request.nonce_str).toMatch(/^[a-f0-9]{32}$/);
  expect(options.headers.Authorization).toBe('test-token');
  expect(options.httpsAgent.options.rejectUnauthorized).toBe(true);
  // No override of Node's default TLS hostname verification.
  expect(options.httpsAgent.options.checkServerIdentity).toBeUndefined();
});
test('Fabric authentication failure never leaks request credentials', async () => {
  const http = { post: jest.fn().mockRejectedValue(new Error(c.APP_SECRET)) };
  const p = createProvider({ http, getConfig: () => c });
  await expect(p.preorder(order)).rejects.toThrow('FABRIC_AUTH_UNCONFIRMED');
  expect(http.post).toHaveBeenCalledTimes(1);
});
test('preorder timeout is unknown and is not automatically replayed', async () => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'test-token' } }).mockRejectedValueOnce(new Error('timeout')) };
  await expect(createProvider({ http, getConfig: () => c }).preorder(order)).rejects.toThrow('PREORDER_UNCONFIRMED');
  expect(http.post).toHaveBeenCalledTimes(2);
});
test.each([{ prepay_id: '' },{ prepay_id: 'p', total_amount: '99.00' },{ prepay_id: 'p', merch_order_id: 'other' },{ prepay_id: 'p', trans_currency: 'USD' },{ prepay_id: 'p', appid: 'other' }])('invalid/mismatched preorder response rejected', async biz_content => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'test-token' } }).mockResolvedValueOnce({ data: {
    result: 'SUCCESS', code: '0', biz_content: { merch_order_id: order.merchant_reference, receiveCode: 'TELEBIRR$BUYGOODS$123456$12.34$p$120m', ...biz_content },
  } }) };
  await expect(createProvider({ http, getConfig: () => c }).preorder(order)).rejects.toThrow('PREORDER_RESPONSE_INVALID');
});
test.each(['0','-1','1.001','1e3',1,null,'1000000.01'])('invalid amount %p never reaches provider', async amount => {
  const f = fixture();
  await expect(f.service.create(buyer,{ ...input, amount })).rejects.toMatchObject({ status: 400 });
  expect(f.provider.preorder).not.toHaveBeenCalled();
});
test('durable intent precedes provider call; duplicate request/restart sends only one preorder', async () => {
  const f = fixture();
  f.provider.preorder.mockImplementationOnce(async () => {
    expect(f.row().status).toBe('pending');
    expect(f.db.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    return { prepayId: 'prepay-test' };
  });
  const first = await f.service.create(buyer,input);
  const restarted = createService({ db: f.db, provider: f.provider });
  const second = await restarted.create(buyer,input);
  expect(second.funding_id).toBe(first.funding_id);
  expect(f.provider.preorder).toHaveBeenCalledTimes(1);
  expect(second).toMatchObject({ status: 'awaiting_authorization', sdk_launch: null, spendable: false, demo_credit_event: null });
  expect(JSON.stringify(second)).not.toContain(c.APP_SECRET);
  await expect(restarted.create(buyer,{ ...input, amount: '13' })).rejects.toMatchObject({ status: 409 });
});
test('SDK cancellation/success claims cannot finalize status or write Demo Wallet/escrow', async () => {
  const f = fixture();
  await f.service.create(buyer,input);
  const result = await f.service.verify(buyer,id,true);
  expect(result).toMatchObject({ status: 'verification_pending', verified_at: null, spendable: false });
  expect(f.db.query.mock.calls.some(([sql]) => /demo_wallet|simulated_escrow|UPDATE transactions/.test(sql))).toBe(false);
});
test('duplicate and out-of-order interaction signals are deduplicated and throttled', async () => {
  const f = fixture(); await f.service.create(buyer,input);
  await f.service.verify(buyer,id,true); const count = f.events.size;
  await f.service.verify(buyer,id,true); await f.service.verify(buyer,id);
  expect(f.events.size).toBe(count);
  expect(f.provider.verify).toHaveBeenCalledTimes(1);
});
test('provider timeout persists as reconciliation_required, not failed', async () => {
  const f = fixture(); f.provider.preorder.mockRejectedValueOnce(Object.assign(new Error('sensitive-error'),{ providerCode: 'PREORDER_UNCONFIRMED' }));
  expect(await f.service.create(buyer,input)).toMatchObject({ status: 'reconciliation_required', verified_at: null });
  await f.service.create(buyer,input); expect(f.provider.preorder).toHaveBeenCalledTimes(1);
});
test('interrupted pending attempt survives restart recovery without preorder replay', async () => {
  const f = fixture(); await f.service.create(buyer,input);
  f.row().status = 'pending'; f.row().provider_reference = null;
  const restarted = createService({ db: f.db, provider: f.provider });
  await restarted.recover();
  expect(f.row().status).toBe('reconciliation_required');
  expect(f.provider.preorder).toHaveBeenCalledTimes(1);
});
test('elapsed authorization window remains unknown, not invented expired/failure', async () => {
  const f = fixture(); await f.service.create(buyer,input); f.row().expires_at = new Date(0);
  expect(await f.service.verify(buyer,id)).toMatchObject({ status: 'reconciliation_required', reconciliation_reason: 'AUTHORIZATION_WINDOW_ELAPSED_OUTCOME_UNKNOWN' });
});
test('bounded checks use exponential backoff and stop after eight attempts', async () => {
  const f = fixture(); await f.service.create(buyer,input);
  for (let n = 0; n < 8; n++) { f.row().next_verification_at = new Date(0); await f.service.verify(buyer,id); }
  await f.service.verify(buyer,id);
  expect(f.row()).toMatchObject({ verification_attempts: 8, next_verification_at: null, status: 'reconciliation_required' });
  expect(f.provider.verify).toHaveBeenCalledTimes(8);
});
test('transient query error persists sanitized backoff and is retried after restart', async () => {
  const f = fixture(); await f.service.create(buyer,input);
  f.provider.verify.mockRejectedValueOnce(new Error('secret-provider-response'));
  const first = await f.service.verify(buyer,id);
  expect(first).toMatchObject({ status: 'verification_pending', reconciliation_reason: 'QUERY_UNCONFIRMED', verification_attempts: 1 });
  expect(new Date(f.row().next_verification_at).getTime()).toBeGreaterThan(Date.now());
  await createService({ db: f.db, provider: f.provider }).verify(buyer,id);
  expect(f.provider.verify).toHaveBeenCalledTimes(1);
  f.row().next_verification_at = new Date(0);
  f.provider.verify.mockResolvedValueOnce({ authoritative: false, reason: 'QUERY_RESPONSE_CONTRACT_UNCONFIRMED', candidate_signature_valid: true });
  const second = await createService({ db: f.db, provider: f.provider }).verify(buyer,id);
  expect(second).toMatchObject({ status: 'verification_pending', reconciliation_reason: 'QUERY_RESPONSE_CONTRACT_UNCONFIRMED', verification_attempts: 2, verified_at: null, spendable: false });
  expect(second.candidate_signature_valid).toBeUndefined();
  expect(JSON.stringify([...f.events])).not.toContain('secret-provider-response');
  expect(f.db.query.mock.calls.some(([sql]) => /demo_wallet|simulated_escrow|UPDATE transactions/.test(sql))).toBe(false);
});
test('arbitrary provider reason is not copied into durable audit', async () => {
  const f = fixture(); await f.service.create(buyer,input);
  f.provider.verify.mockResolvedValueOnce({ authoritative: false, reason: 'secret-provider-response' });
  expect((await f.service.verify(buyer,id)).reconciliation_reason).toBe('VERIFICATION_DOCUMENTATION_REQUIRED');
  expect(JSON.stringify([...f.events])).not.toContain('secret-provider-response');
});
test('even a future accidental success from adapter cannot bypass missing authoritative contract', async () => {
  const f = fixture(); await f.service.create(buyer,input); f.provider.verify.mockResolvedValueOnce({ authoritative: true, status: 'success' });
  await expect(f.service.verify(buyer,id)).rejects.toMatchObject({ status: 503 });
  expect(f.row().verified_at).toBeNull();
});
test('cross-buyer access is denied', async () => {
  const f = fixture(); await f.service.create(buyer,input);
  await expect(f.service.get('33333333-3333-4333-8333-333333333333',id)).rejects.toMatchObject({ status: 404 });
});
test('actual adapter explicitly has no authoritative verification mechanism', async () => {
  expect(await createProvider({ getEnv: () => ({}) }).verify(order)).toEqual({ authoritative: false, reason: 'QUERY_DISABLED' });
});

test('receiveCode matches official SDK response sample without the prose whitespace typo', () => {
  expect(sdkInitialization({ appId: '1072905731584000', shortCode: '100100306', amountMinor: '1200',
    prepayId: '080075a4e3213924de2b3b84ad3cac0a6a6001' }).receiveCode)
    .toBe('TELEBIRR$BUYGOODS$100100306$12.00$080075a4e3213924de2b3b84ad3cac0a6a6001$120m');
});
test.each(['1','10','100','1234'])('receiveCode uses exact integer cents %s, always two decimals', amountMinor => {
  const init = sdkInitialization({ appId: 'merchanttest', shortCode: '123456', amountMinor, prepayId: 'prepaytest' });
  expect(init.receiveCode.split('$')).toHaveLength(6);
  expect(init.receiveCode.split('$')[3]).toMatch(/^\d+\.\d{2}$/);
  expect(init.receiveCode).not.toMatch(/\s/);
});
test.each([{ appId: 'merchant-test' },{ appId: 123456 },{ shortCode: 123456 },{ prepayId: 123456 },
  { shortCode: ' 123456' },{ shortCode: '0123' },{ amountMinor: '0' },
  { amountMinor: '1.00' },{ amountMinor: 100 },{ prepayId: 'prepay$injected' },{ prepayId: ' prepaytest' },
  { prepayId: 'x'.repeat(129) },{ timeoutExpress: '120' },{ timeoutExpress: '120M' }])('incomplete/ambiguous SDK fields fail closed', fields => {
  expect(() => sdkInitialization({ appId: 'merchanttest', shortCode: '123456', amountMinor: '1234', prepayId: 'prepaytest', ...fields })).toThrow('SDK_PREORDER_FIELDS_INVALID');
});
test.each(['telebirr$BUYGOODS$123456$12.34$prepaytest$120m', 'TELEBIRR$BUYGOODS$123456$12.34 $prepaytest$120m',
  'TELEBIRR$BUYGOODS$123456$12.340$prepaytest$120m','TELEBIRR$BUYGOODS$654321$12.34$prepaytest$120m',
  'TELEBIRR$BUYGOODS$123456$12.34$other$120m','TELEBIRR$BUYGOODS$123456$12.34$prepaytest$30', undefined])('SDK createOrder response must return an exact matching receiveCode', async receiveCode => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'test-token' } }).mockResolvedValueOnce({ data: {
    result: 'SUCCESS', code: '0', biz_content: { merch_order_id: order.merchant_reference, prepay_id: 'prepaytest', receiveCode },
  } }) };
  await expect(createProvider({ http, getConfig: () => c }).preorder(order)).rejects.toThrow('PREORDER_RESPONSE_INVALID');
});
test.each([{ result: 'FAIL' },{ code: '9' },{ biz_content: { prepay_id: 'prepaytest' } }])('provider success envelope and merchant correlation are mandatory', async override => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'test-token' } }).mockResolvedValueOnce({ data: {
    result: 'SUCCESS', code: '0', biz_content: { merch_order_id: order.merchant_reference, prepay_id: 'prepaytest', receiveCode: 'TELEBIRR$BUYGOODS$123456$12.34$prepaytest$120m' }, ...override,
  } }) };
  await expect(createProvider({ http, getConfig: () => c }).preorder(order)).rejects.toThrow('PREORDER_RESPONSE_INVALID');
});
test('SDK release is opt-in, request-bound and never exposed through history or verification', async () => {
  const previous = process.env.TELEBIRR_UAT_SDK_ENABLED;
  try {
    process.env.TELEBIRR_UAT_SDK_ENABLED = 'true';
    const f = fixture();
    f.provider.preorder.mockResolvedValueOnce({ prepayId: 'prepaytest', sdkContext: {
      appId: c.MERCHANT_APP_ID, shortCode: c.SHORT_CODE, timeoutExpress: '120m', contract: 'inapp_create_order_v1',
    } });
    const row = await f.service.create(buyer,input);
    expect(row.sdk_launch).toEqual({ appId: c.MERCHANT_APP_ID, shortCode: c.SHORT_CODE, receiveCode: 'TELEBIRR$BUYGOODS$123456$12.34$prepaytest$120m' });
    expect(row).toMatchObject({ status: 'awaiting_authorization', verified_at: null, spendable: false });
    expect((await f.service.get(buyer,id)).sdk_launch).toBeNull();
    expect((await f.service.verify(buyer,id,true)).sdk_launch).toBeNull();
    expect(f.row().status).toBe('verification_pending');
    expect(f.db.query.mock.calls.some(([sql]) => /demo_wallet|simulated_escrow/.test(sql))).toBe(false);
  } finally { if (previous === undefined) delete process.env.TELEBIRR_UAT_SDK_ENABLED; else process.env.TELEBIRR_UAT_SDK_ENABLED = previous; }
});
test('legacy/incomplete context cannot launch even when SDK testing is opted in', async () => {
  const previous = process.env.TELEBIRR_UAT_SDK_ENABLED;
  try {
    process.env.TELEBIRR_UAT_SDK_ENABLED = 'true';
    const f = fixture();
    expect((await f.service.create(buyer,input)).sdk_launch).toBeNull();
    expect((await f.service.create(buyer,input)).sdk_launch).toBeNull();
  } finally { if (previous === undefined) delete process.env.TELEBIRR_UAT_SDK_ENABLED; else process.env.TELEBIRR_UAT_SDK_ENABLED = previous; }
});
test('expired or forged persisted SDK context cannot launch on idempotent create', async () => {
  const previous = process.env.TELEBIRR_UAT_SDK_ENABLED;
  try {
    process.env.TELEBIRR_UAT_SDK_ENABLED = 'true';
    const f = fixture();
    f.provider.preorder.mockResolvedValueOnce({ prepayId: 'prepaytest', sdkContext: {
      appId: c.MERCHANT_APP_ID, shortCode: c.SHORT_CODE, timeoutExpress: '120m', contract: 'inapp_create_order_v1',
    } });
    expect((await f.service.create(buyer,input)).sdk_launch).not.toBeNull();
    f.row().expires_at = new Date(0);
    expect((await f.service.create(buyer,input)).sdk_launch).toBeNull();
    f.row().expires_at = new Date(Date.now()+7200000);
    f.row().sdk_short_code = '654321';
    expect((await f.service.create(buyer,input)).sdk_launch).toBeNull();
    expect(f.provider.preorder).toHaveBeenCalledTimes(1);
  } finally { if (previous === undefined) delete process.env.TELEBIRR_UAT_SDK_ENABLED; else process.env.TELEBIRR_UAT_SDK_ENABLED = previous; }
});
test('documented create-order example without separate prepay_id fails closed despite valid receiveCode', async () => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'fixture-token' } }).mockResolvedValueOnce({ data: {
    result: 'SUCCESS', code: '0', biz_content: { merch_order_id: order.merchant_reference,
      receiveCode: 'TELEBIRR$BUYGOODS$123456$12.34$prepaytest$120m' },
  } }) };
  await expect(createProvider({ http, getConfig: () => c }).preorder(order)).rejects.toThrow('PREORDER_RESPONSE_INVALID');
});
