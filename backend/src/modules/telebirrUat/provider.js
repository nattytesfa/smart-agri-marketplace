const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const money = require('../../utils/money');
const evidence = require('./evidence');

// Only the UAT origin/path evidenced by the supplied official Node demo.
const BASE_URL = 'https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway';
const BLOCKER = 'Provider signing-key trust and clarification of query status/notification contracts are required for authoritative payment confirmation';
// The UAT gateway omits its GlobalSign intermediate. This public intermediate
// was obtained over verified HTTPS from its issuing CA, not trusted from a peer.
const tlsAgent = new https.Agent({ rejectUnauthorized: true, ca: [
  ...tls.rootCertificates,
  fs.readFileSync(path.resolve(__dirname, '../../../certs/globalsign-gcc-r3-ev-tls-ca-2025.crt'), 'utf8'),
] });
const TIMEOUT_EXPRESS = '120m';
const fail = (code) => Object.assign(new Error(code), { status: 503, providerCode: code });
const excluded = new Set(['sign', 'sign_type', 'header', 'refund_info', 'openType', 'raw_request', 'biz_content']);

// Mirrors tools.js: flatten biz_content, ASCII sort, no URL encoding.
function canonicalize(input) {
  const fields = {};
  for (const source of [input, input.biz_content || {}]) {
    for (const [key, value] of Object.entries(source)) {
      if (excluded.has(key)) continue;
      if (Object.hasOwn(fields, key) || typeof value !== 'string' || /[&=]/.test(value)) throw fail('SIGNING_INPUT_INVALID');
      fields[key] = value;
    }
  }
  return Object.keys(fields).sort().map(key => `${key}=${fields[key]}`).join('&');
}
function sign(input, privateKey) {
  try {
    // Demo implementation uses SHA256withRSAandMGF1, NOT PKCS#1 v1.5,
    // despite sending sign_type=SHA256WithRSA. Its default salt is hash length.
    return crypto.sign('sha256', Buffer.from(canonicalize(input)), {
      key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
    }).toString('base64');
  } catch (_) { throw fail('SIGNING_FAILED'); }
}
function config(env = process.env) {
  if (env.TELEBIRR_UAT_ENABLED !== 'true' || env.TELEBIRR_ENV !== 'uat' ||
      !['development', 'test', 'demo'].includes(env.NODE_ENV)) throw fail('UAT_DISABLED');
  const values = {};
  for (const name of ['MERCHANT_APP_ID', 'FABRIC_APP_ID', 'SHORT_CODE', 'APP_SECRET', 'PRIVATE_KEY_BASE64']) {
    const value = env[`TELEBIRR_${name}`];
    if (!value || !value.trim()) throw fail('UAT_CONFIG_INCOMPLETE');
    values[name] = value;
  }
  if (!/^[A-Za-z0-9]{1,32}$/.test(values.MERCHANT_APP_ID) ||
      !/^[1-9][0-9]{1,15}$/.test(values.SHORT_CODE) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(values.FABRIC_APP_ID)) throw fail('UAT_CONFIG_INVALID');
  // Required by the SDK createOrder specification. No unsigned receiver is
  // installed here: this must be a merchant-controlled, provider-whitelisted
  // authenticated notification destination. Its trust setup remains external.
  try {
    const notify = new URL(env.TELEBIRR_NOTIFY_URL);
    if (notify.protocol !== 'https:' || notify.username || notify.password || notify.hash || notify.search) throw new Error();
    values.NOTIFY_URL = notify.toString();
  } catch (_) { throw fail('UAT_NOTIFY_URL_REQUIRED'); }
  try {
    const decoded = Buffer.from(values.PRIVATE_KEY_BASE64, 'base64');
    try {
      // Preserve existing base64-of-PEM configuration.
      values.privateKey = crypto.createPrivateKey(decoded);
    } catch (_) {
      // Bare base64 DER needs explicit format/type; Node defaults to PEM.
      // Parse in memory only: never rewrite, log or export merchant key material.
      values.privateKey = crypto.createPrivateKey({ key: decoded, format: 'der', type: 'pkcs8' });
    }
    if (values.privateKey.asymmetricKeyType !== 'rsa' || values.privateKey.asymmetricKeyDetails.modulusLength < 2048) throw new Error();
  } catch (_) { throw fail('UAT_PRIVATE_KEY_INVALID'); }
  return values;
}

// Official RequestCreateOrder success sample is authoritative for serialization:
// uppercase constants, six $-delimited fields, no spaces, two-decimal ETB, 120m.
// "total_amount $prepay_id" in the prose is a typo, NOT a literal space.
function sdkInitialization({ appId, shortCode, amountMinor, prepayId, timeoutExpress = TIMEOUT_EXPRESS }) {
  if (typeof appId !== 'string' || typeof shortCode !== 'string' || typeof prepayId !== 'string' ||
      !/^[A-Za-z0-9]{1,32}$/.test(appId) || !/^[1-9][0-9]{1,15}$/.test(shortCode) ||
      typeof amountMinor !== 'string' || !/^[1-9][0-9]*$/.test(amountMinor) || BigInt(amountMinor) > 100000000n ||
      !/^[A-Za-z0-9]{1,128}$/.test(prepayId) || timeoutExpress !== TIMEOUT_EXPRESS) throw fail('SDK_PREORDER_FIELDS_INVALID');
  return { appId, shortCode, receiveCode: ['TELEBIRR','BUYGOODS',shortCode,money.formatMinor(BigInt(amountMinor)),prepayId,timeoutExpress].join('$') };
}
function createProvider({ http = axios, getConfig = config, getEnv = () => process.env } = {}) {
  async function post(path, body, headers, phase) {
    try {
      const response = await http.post(`${BASE_URL}${path}`, body, {
        headers: { 'Content-Type': 'application/json', ...headers }, timeout: 12000,
        maxRedirects: 0, maxContentLength: 65536, maxBodyLength: 65536,
        // Explicit verified TLS; never copy the demo's TLS bypass.
        httpsAgent: tlsAgent,
      });
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw new Error();
      return response.data;
    } catch (_) {
      // Never propagate Axios errors (which contain secrets and signed bodies).
      // A preorder transport error is an UNKNOWN outcome, never a failed payment.
      throw fail(`${phase}_UNCONFIRMED`);
    }
  }
  async function fabricToken(c) {
    const token = await post('/payment/v1/token', { appSecret: c.APP_SECRET }, { 'X-APP-Key': c.FABRIC_APP_ID }, 'FABRIC_AUTH');
    if (typeof token.token !== 'string' || !token.token || token.token.length > 8192 || /[\r\n]/.test(token.token)) throw fail('FABRIC_AUTH_INVALID');
    return token.token;
  }
  return {
    configuration: getConfig,
    async preorder(attempt) {
      const c = getConfig();
      const request = {
        timestamp: String(Math.round(Date.now() / 1000)), nonce_str: crypto.randomBytes(16).toString('hex'),
        method: 'payment.preorder', version: '1.0',
        biz_content: {
          trade_type: 'Cross-App', business_type: 'BuyGoods', notify_url: c.NOTIFY_URL,
          appid: c.MERCHANT_APP_ID, merch_code: c.SHORT_CODE,
          merch_order_id: attempt.merchant_reference, title: 'Marketplace UAT wallet funding',
          total_amount: money.formatMinor(BigInt(attempt.amount_minor)), trans_currency: 'ETB',
          timeout_express: TIMEOUT_EXPRESS,
        },
      };
      // Sign before any network operation; no credentials from the demo are read.
      request.sign = sign(request, c.privateKey);
      request.sign_type = 'SHA256WithRSA';
      const token = await fabricToken(c);
      // SDK-specific endpoint; the old demo's merchant/preOrder + H5 raw_request
      // is a different checkout contract and must not be passed to the AAR.
      const result = await post('/payment/v1/inapp/createOrder', request,
        { 'X-APP-Key': c.FABRIC_APP_ID, Authorization: token }, 'PREORDER');
      const prepay = result.biz_content?.prepay_id;
      if (result.result !== 'SUCCESS' || result.code !== '0' || result.biz_content?.merch_order_id !== attempt.merchant_reference ||
          typeof prepay !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(prepay)) throw fail('PREORDER_RESPONSE_INVALID');
      for (const field of ['appid','merch_code','merch_order_id','total_amount','trans_currency','timeout_express']) {
        if (Object.hasOwn(result.biz_content,field) && result.biz_content[field] !== request.biz_content[field]) throw fail('PREORDER_RESPONSE_INVALID');
      }
      const initialization = sdkInitialization({ appId: c.MERCHANT_APP_ID, shortCode: c.SHORT_CODE,
        amountMinor: attempt.amount_minor, prepayId: prepay });
      // This endpoint documents receiveCode as a returned field. Require the
      // actual value to match the independently constructed, exact request-bound
      // format before releasing any SDK initialization data. Never trim it.
      if (result.biz_content.receiveCode !== initialization.receiveCode) throw fail('PREORDER_RESPONSE_INVALID');
      return { prepayId: prepay, sdkContext: { appId: c.MERCHANT_APP_ID, shortCode: c.SHORT_CODE,
        timeoutExpress: TIMEOUT_EXPRESS, contract: 'inapp_create_order_v1' } };
    },
    async verify(attempt) {
      // Separate diagnostic opt-in; never enables finalization/credit. Missing
      // key/fingerprint fails BEFORE Fabric auth or any network operation.
      if (getEnv().TELEBIRR_UAT_QUERY_ENABLED !== 'true') return { authoritative: false, reason: 'QUERY_DISABLED' };
      try {
        const c = getConfig();
        evidence.validateAttempt(attempt, c);
        const key = evidence.providerKey(getEnv(), c.privateKey);
        const request = {
          timestamp: String(Math.floor(Date.now() / 1000)), nonce_str: crypto.randomBytes(16).toString('hex'),
          method: 'payment.queryorder', version: '1.0',
          biz_content: { appid: c.MERCHANT_APP_ID, merch_code: c.SHORT_CODE, merch_order_id: attempt.merchant_reference },
        };
        request.sign = sign(request, c.privateKey);
        request.sign_type = 'SHA256WithRSA';
        const token = await fabricToken(c);
        const result = await post('/payment/v1/merchant/queryOrder', request,
          { 'X-APP-Key': c.FABRIC_APP_ID, Authorization: token }, 'QUERY');
        return evidence.assessQuery(result, attempt, c, key);
      } catch (e) {
        const reason = e.providerCode || e.message;
        return { authoritative: false, reason: evidence.reasons.has(reason) ? reason : 'QUERY_UNCONFIRMED' };
      }
    },
  };
}
module.exports = { BASE_URL, BLOCKER, TIMEOUT_EXPRESS, sdkInitialization, canonicalize, sign, config, createProvider };
