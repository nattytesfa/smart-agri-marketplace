// All keys/signatures are synthetic. These are NOT authenticated Telebirr fixtures.
const crypto = require('crypto');
const { assessQuery, assessNotification, candidateCanonical, providerKey } = require('../src/modules/telebirrUat/evidence');
const { createProvider, canonicalize, config, BASE_URL } = require('../src/modules/telebirrUat/provider');
const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const c = { MERCHANT_APP_ID: 'merchanttest', SHORT_CODE: '123456', FABRIC_APP_ID: 'fabric-test',
  APP_SECRET: 'fixture-only-secret', NOTIFY_URL: 'https://merchant.example/notify', privateKey: merchant.privateKey };
const attempt = { buyer_id: '11111111-1111-4111-8111-111111111111', merchant_reference: 'testorder',
  amount_minor: '1234', currency: 'ETB', provider: 'telebirr', provider_environment: 'uat', status: 'verification_pending',
  provider_reference: 'prepaytest', provider_transaction_reference: null, verified_at: null,
  sdk_app_id: c.MERCHANT_APP_ID, sdk_short_code: c.SHORT_CODE };
const trust = (pair = sp, format = 'der') => ({ TELEBIRR_UAT_QUERY_ENABLED: 'true',
  TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64: Buffer.from(pair.publicKey.export({ type: 'spki', format })).toString('base64'),
  TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256: crypto.createHash('sha256').update(pair.publicKey.export({ type: 'spki', format: 'der' })).digest('hex') });
const signFixture = (payload, privateKey = sp.privateKey) => ({ ...payload, sign_type: 'SHA256WithRSA',
  sign: crypto.sign('sha256', Buffer.from(candidateCanonical(payload)), {
    key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  }).toString('base64') });
const query = (biz = {}, envelope = {}) => ({ result: 'SUCCESS', code: '0', msg: 'success', nonce_str: 'fixtureNonce123',
  biz_content: { merch_order_id: attempt.merchant_reference, order_status: 'PAY_SUCCESS', payment_order_id: 'payment123',
    trans_time: '2025-10-13 19:19:38', trans_currency: 'ETB', total_amount: '12.34', trans_id: 'TEST123', ...biz }, ...envelope });
const notify = (fields = {}) => ({ appid: c.MERCHANT_APP_ID, merch_code: c.SHORT_CODE,
  merch_order_id: attempt.merchant_reference, payment_order_id: 'payment123', total_amount: '12.34', trans_currency: 'ETB',
  trade_status: 'Completed', trans_id: 'TEST123', trans_end_time: '1670575472000', ...fields });
const assessQ = (biz = {}, row = attempt) => assessQuery(signFixture(query(biz)), row, c, sp.publicKey);
const assessN = (fields = {}, row = attempt) => assessNotification(signFixture(notify(fields)), row, c, sp.publicKey);

test.each(['der','pem'])('independently pinned provider public %s key parses', format => {
  expect(providerKey(trust(sp, format), merchant.privateKey).asymmetricKeyType).toBe('rsa');
});
test.each([
  [{}, 'PROVIDER_KEY_REQUIRED'],
  [{ ...trust(), TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256: '' }, 'PROVIDER_KEY_FINGERPRINT_REQUIRED'],
  [{ ...trust(), TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256: '0'.repeat(64) }, 'PROVIDER_KEY_UNTRUSTED'],
  [{ ...trust(), TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64: 'not-a-key' }, 'PROVIDER_KEY_INVALID'],
  [trust(merchant), 'PROVIDER_KEY_IS_MERCHANT_KEY'],
])('missing/untrusted/merchant key cannot establish provider trust', (env, error) => {
  expect(() => providerKey(env, merchant.privateKey)).toThrow(error);
});
test('provider trust configuration does not accept private or concatenated PEM material', () => {
  const privatePem = sp.privateKey.export({ format: 'pem', type: 'pkcs8' });
  for (const text of [privatePem, privatePem + sp.publicKey.export({ format: 'pem', type: 'spki' })]) {
    expect(() => providerKey({ ...trust(), TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64: Buffer.from(text).toString('base64') }, merchant.privateKey))
      .toThrow('PROVIDER_KEY_INVALID');
  }
});
test.each(['PAY_SUCCESS','PAY_FAILED','WAIT_PAY','ORDER_CLOSED','PAYING','ACCEPTED','REFUNDING','REFUND_SUCCESS','REFUND_FAILED'])(
  'query %s is recognized only as unresolved diagnostic information', state => {
    const result = assessQ({ order_status: state });
    expect(result).toMatchObject({ authoritative: false, candidate_signature_valid: true,
      reason: 'QUERY_RESPONSE_CONTRACT_UNCONFIRMED', observed_state: state });
    expect(result.status).toBeUndefined();
  });
test('schema trade_status is diagnostic only; conflicting spellings rejected', () => {
  expect(assessQ({ order_status: undefined })).toMatchObject({ authoritative: false });
  const payload = query(); delete payload.biz_content.order_status; payload.biz_content.trade_status = 'WAIT_PAY';
  expect(assessQuery(signFixture(payload), attempt, c, sp.publicKey)).toMatchObject({ observed_state: 'WAIT_PAY', authoritative: false });
  expect(assessQ({ trade_status: 'PAY_FAILED' }).reason).toBe('RESPONSE_STATUS_CONFLICT');
});
test.each([
  [{ order_status: 'NEW_STATE' }, 'RESPONSE_STATUS_UNKNOWN'],
  [{ order_status: 'paid' }, 'RESPONSE_STATUS_UNKNOWN'],
  [{ merch_order_id: 'otherorder' }, 'RESPONSE_IDENTITY_MISMATCH'],
  [{ appid: 'otherapp' }, 'RESPONSE_IDENTITY_MISMATCH'],
  [{ merch_code: '654321' }, 'RESPONSE_IDENTITY_MISMATCH'],
  [{ total_amount: '12.35' }, 'RESPONSE_AMOUNT_MISMATCH'],
  [{ total_amount: '12.340' }, 'RESPONSE_AMOUNT_MISMATCH'],
  [{ total_amount: '-12.34' }, 'RESPONSE_AMOUNT_MISMATCH'],
  [{ trans_currency: 'USD' }, 'RESPONSE_CURRENCY_MISMATCH'],
  [{ trans_currency: undefined }, 'RESPONSE_CURRENCY_MISMATCH'],
  [{ payment_order_id: '' }, 'RESPONSE_SHAPE_INVALID'],
  [{ prepay_id: 'anotherprepay' }, 'RESPONSE_REFERENCE_CONFLICT'],
  [{ trans_time: '' }, 'RESPONSE_SHAPE_INVALID'],
  [{ orderStatus: 'PAY_SUCCESS' }, 'RESPONSE_SHAPE_INVALID'],
])('signed query contradictions remain unresolved', (fields, reason) => expect(assessQ(fields)).toEqual({ authoritative: false, reason }));
test('stored final payment reference cannot be contradicted', () => {
  expect(assessQ({}, { ...attempt, provider_transaction_reference: 'other' }).reason).toBe('RESPONSE_REFERENCE_CONFLICT');
});
test.each([{ result: 'FAIL' },{ code: '9' },{ code: undefined },{ biz_content: null },{ appid: 'unboundtopfield' }])(
  'query envelope must be strictly documented, never just HTTP success', fields => {
    const payload = query({}, fields);
    if (fields.biz_content === null) {
      expect(assessQuery(payload, attempt, c, sp.publicKey).authoritative).toBe(false);
    } else expect(assessQuery(signFixture(payload), attempt, c, sp.publicKey).reason).toBe('RESPONSE_SHAPE_INVALID');
  });
test('invalid, missing, tampered and wrong-key signatures cannot authenticate', () => {
  const signed = signFixture(query());
  expect(assessQuery(query(), attempt, c, sp.publicKey).reason).toBe('PROVIDER_SIGNATURE_MISSING');
  expect(assessQuery(signed, attempt, c, null).reason).toBe('PROVIDER_KEY_REQUIRED');
  expect(assessQuery(signed, attempt, c, other.publicKey).reason).toBe('PROVIDER_SIGNATURE_INVALID');
  expect(assessQuery({ ...signed, sign_type: 'other' }, attempt, c, sp.publicKey).reason).toBe('PROVIDER_SIGNATURE_INVALID');
  expect(assessQuery({ ...signed, biz_content: { ...signed.biz_content, total_amount: '99.00' } }, attempt, c, sp.publicKey).reason).toBe('PROVIDER_SIGNATURE_INVALID');
});
test.each([{ x: 'a&b' },{ x: 1 },{ x: '1', biz_content: { x: '2' } },{ biz_content: { sign: 'nested' } }])(
  'candidate profile rejects ambiguous fields', payload => expect(() => candidateCanonical(payload)).toThrow('RESPONSE_SHAPE_INVALID'));
test.each([{ provider_environment: 'production' },{ provider: 'simulation' },{ currency: 'USD' },{ buyer_id: '' },
  { status: 'verified_success' },{ amount_minor: '1.001' },{ sdk_app_id: 'forged' }])('invalid funding identity/state prevents query', async override => {
  const http = { post: jest.fn() };
  expect(await createProvider({ http, getConfig: () => c, getEnv: () => trust() }).verify({ ...attempt, ...override }))
    .toEqual({ authoritative: false, reason: 'QUERY_ATTEMPT_INVALID' });
  expect(http.post).not.toHaveBeenCalled();
});

test('query reuses Fabric auth, signs exact documented request and uses verified TLS', async () => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'Bearer fixture-token' } })
    .mockResolvedValueOnce({ data: signFixture(query()) }) };
  const result = await createProvider({ http, getConfig: () => c, getEnv: () => trust() }).verify(attempt);
  expect(result).toMatchObject({ authoritative: false, candidate_signature_valid: true });
  expect(http.post.mock.calls[0]).toEqual([`${BASE_URL}/payment/v1/token`, { appSecret: c.APP_SECRET },
    expect.objectContaining({ headers: expect.objectContaining({ 'X-APP-Key': c.FABRIC_APP_ID }) })]);
  const [url, body, options] = http.post.mock.calls[1];
  expect(url).toBe(`${BASE_URL}/payment/v1/merchant/queryOrder`);
  expect(body).toMatchObject({ method: 'payment.queryorder', version: '1.0', sign_type: 'SHA256WithRSA',
    biz_content: { appid: c.MERCHANT_APP_ID, merch_code: c.SHORT_CODE, merch_order_id: attempt.merchant_reference } });
  expect(Object.keys(body.biz_content).sort()).toEqual(['appid','merch_code','merch_order_id']);
  expect(body.nonce_str).toMatch(/^[a-f0-9]{32}$/);
  expect(Number(body.timestamp)).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  expect(crypto.verify('sha256', Buffer.from(canonicalize(body)), { key: merchant.publicKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(body.sign, 'base64'))).toBe(true);
  expect(options.headers.Authorization).toBe('Bearer fixture-token');
  expect(options).toMatchObject({ maxRedirects: 0, timeout: 12000, maxContentLength: 65536 });
  expect(options.httpsAgent.options.rejectUnauthorized).toBe(true);
  expect(options.httpsAgent.options.checkServerIdentity).toBeUndefined();
  expect(JSON.stringify(result)).not.toMatch(/fixture-token|fixture-only-secret|payment123/);
});
test.each([
  [{}, 'QUERY_DISABLED'],
  [{ TELEBIRR_UAT_QUERY_ENABLED: 'true' }, 'PROVIDER_KEY_REQUIRED'],
  [{ ...trust(), TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256: '' }, 'PROVIDER_KEY_FINGERPRINT_REQUIRED'],
])('disabled or untrusted query never makes a token request', async (env, reason) => {
  const http = { post: jest.fn() };
  expect(await createProvider({ http, getConfig: () => c, getEnv: () => env }).verify(attempt)).toEqual({ authoritative: false, reason });
  expect(http.post).not.toHaveBeenCalled();
});
test('disabled UAT environment cannot make queries even with diagnostic flag and local key', async () => {
  const http = { post: jest.fn() };
  const p = createProvider({ http, getConfig: () => config({ NODE_ENV: 'production', TELEBIRR_UAT_ENABLED: 'false' }), getEnv: () => trust() });
  expect(await p.verify(attempt)).toEqual({ authoritative: false, reason: 'UAT_DISABLED' });
  expect(http.post).not.toHaveBeenCalled();
});
test('Fabric failure stays unconfirmed without leaking credentials', async () => {
  const http = { post: jest.fn().mockRejectedValue(new Error(c.APP_SECRET)) };
  expect(await createProvider({ http, getConfig: () => c, getEnv: () => trust() }).verify(attempt))
    .toEqual({ authoritative: false, reason: 'FABRIC_AUTH_UNCONFIRMED' });
  expect(http.post).toHaveBeenCalledTimes(1);
});
test.each([{}, { token: '' }, { token: 'bad\r\nheader' }])('invalid Fabric token never reaches status endpoint', async data => {
  const http = { post: jest.fn().mockResolvedValue({ data }) };
  expect((await createProvider({ http, getConfig: () => c, getEnv: () => trust() }).verify(attempt)).reason).toBe('FABRIC_AUTH_INVALID');
  expect(http.post).toHaveBeenCalledTimes(1);
});
test.each(['ETIMEDOUT','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'])('query %s stays unknown; no insecure retry', async code => {
  const http = { post: jest.fn().mockResolvedValueOnce({ data: { token: 'fixture-token' } })
    .mockRejectedValueOnce(Object.assign(new Error('sensitive-body'), { code })) };
  expect(await createProvider({ http, getConfig: () => c, getEnv: () => trust() }).verify(attempt))
    .toEqual({ authoritative: false, reason: 'QUERY_UNCONFIRMED' });
  expect(http.post).toHaveBeenCalledTimes(2);
});

test.each(['Completed','Paying','Pending','Expired','Failure'])('signed notification %s is diagnostic only, not accepted payment', trade_status => {
  expect(assessN({ trade_status })).toMatchObject({ authoritative: false, candidate_signature_valid: true,
    reason: 'NOTIFY_RESPONSE_CONTRACT_UNCONFIRMED', observed_state: trade_status });
});
test.each([
  [{ trade_status: 'Unknown' }, 'RESPONSE_STATUS_UNKNOWN'],
  [{ total_amount: '0.01' }, 'RESPONSE_AMOUNT_MISMATCH'],
  [{ merch_order_id: 'wrong' }, 'RESPONSE_IDENTITY_MISMATCH'],
  [{ appid: 'wrong' }, 'RESPONSE_IDENTITY_MISMATCH'],
  [{ merch_code: '654321' }, 'RESPONSE_IDENTITY_MISMATCH'],
  [{ trans_currency: 'USD' }, 'RESPONSE_CURRENCY_MISMATCH'],
  [{ trans_end_time: 'invalid' }, 'RESPONSE_SHAPE_INVALID'],
  [{ transId: 'alias' }, 'RESPONSE_SHAPE_INVALID'],
])('signed notification contradictions rejected', (fields, reason) => expect(assessN(fields)).toEqual({ authoritative: false, reason }));
test('unsigned/untrusted notification and disabled funding state never accepted', () => {
  expect(assessNotification(notify(), attempt, c, sp.publicKey).reason).toBe('PROVIDER_SIGNATURE_MISSING');
  expect(assessNotification(signFixture(notify(), other.privateKey), attempt, c, sp.publicKey).reason).toBe('PROVIDER_SIGNATURE_INVALID');
  expect(assessN({}, { ...attempt, provider_environment: 'production' }).reason).toBe('QUERY_ATTEMPT_INVALID');
});
test('duplicate and out-of-order notification assessments are side-effect-free, never final', () => {
  const signed = signFixture(notify());
  const before = JSON.stringify(attempt);
  expect(assessNotification(signed, attempt, c, sp.publicKey)).toEqual(assessNotification(signed, attempt, c, sp.publicKey));
  expect(assessN({ trade_status: 'Pending' }).authoritative).toBe(false);
  expect(assessN({ trade_status: 'Failure' }).authoritative).toBe(false);
  expect(assessN().authoritative).toBe(false);
  expect(JSON.stringify(attempt)).toBe(before);
});
