const crypto = require('crypto');

// Candidate profile ONLY: the upload specifies request PSS signing, not complete
// response coverage/parameters or an authenticated SP key distribution mechanism.
// This module cannot produce authoritative:true or a final funding state.
const unresolved = reason => ({ authoritative: false, reason });
const fail = reason => { throw new Error(reason); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const queryStates = Object.freeze({ PAY_SUCCESS: 'success_candidate', PAY_FAILED: 'unsuccessful_candidate',
  WAIT_PAY: 'pending', ORDER_CLOSED: 'closed_candidate', PAYING: 'pending',
  ACCEPTED: 'refund_unresolved', REFUNDING: 'refund_unresolved', REFUND_SUCCESS: 'refund_unresolved', REFUND_FAILED: 'refund_unresolved' });
const notifyStates = Object.freeze({ Completed: 'success_candidate', Paying: 'pending', Pending: 'pending',
  Expired: 'unresolved', Failure: 'unsuccessful_candidate' });
const reasons = new Set(['QUERY_DISABLED', 'UAT_DISABLED', 'UAT_CONFIG_INCOMPLETE', 'UAT_CONFIG_INVALID',
  'UAT_NOTIFY_URL_REQUIRED', 'UAT_PRIVATE_KEY_INVALID', 'PROVIDER_KEY_REQUIRED', 'PROVIDER_KEY_INVALID',
  'PROVIDER_KEY_FINGERPRINT_REQUIRED', 'PROVIDER_KEY_UNTRUSTED', 'PROVIDER_KEY_IS_MERCHANT_KEY',
  'QUERY_ATTEMPT_INVALID', 'FABRIC_AUTH_UNCONFIRMED', 'FABRIC_AUTH_INVALID', 'QUERY_UNCONFIRMED',
  'SIGNING_FAILED', 'PROVIDER_SIGNATURE_MISSING', 'PROVIDER_SIGNATURE_INVALID', 'RESPONSE_SHAPE_INVALID',
  'RESPONSE_IDENTITY_MISMATCH', 'RESPONSE_AMOUNT_MISMATCH', 'RESPONSE_CURRENCY_MISMATCH',
  'RESPONSE_REFERENCE_CONFLICT', 'RESPONSE_STATUS_CONFLICT', 'RESPONSE_STATUS_UNKNOWN',
  'QUERY_RESPONSE_CONTRACT_UNCONFIRMED', 'NOTIFY_RESPONSE_CONTRACT_UNCONFIRMED', 'VERIFICATION_DOCUMENTATION_REQUIRED']);

function providerKey(env, merchantPrivateKey) {
  if (!env.TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64) fail('PROVIDER_KEY_REQUIRED');
  if (!/^[a-fA-F0-9]{64}$/.test(env.TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256 || '')) fail('PROVIDER_KEY_FINGERPRINT_REQUIRED');
  let key;
  try {
    const decoded = Buffer.from(env.TELEBIRR_PROVIDER_PUBLIC_KEY_BASE64, 'base64');
    // Public PEM or DER SPKI only; no private-key/certificate guessing.
    const text = decoded.toString('ascii').trim();
    if (text.includes('-----BEGIN')) {
      if (!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----$/.test(text)) throw new Error();
      key = crypto.createPublicKey(text);
    } else key = crypto.createPublicKey({ key: decoded, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw new Error();
  } catch (_) { fail('PROVIDER_KEY_INVALID'); }
  const der = key.export({ type: 'spki', format: 'der' });
  const fingerprint = crypto.createHash('sha256').update(der).digest('hex');
  if (fingerprint !== env.TELEBIRR_PROVIDER_PUBLIC_KEY_SHA256.toLowerCase()) fail('PROVIDER_KEY_UNTRUSTED');
  if (merchantPrivateKey && der.equals(crypto.createPublicKey(merchantPrivateKey).export({ type: 'spki', format: 'der' }))) {
    fail('PROVIDER_KEY_IS_MERCHANT_KEY');
  }
  return key;
}

function validateAttempt(attempt, merchant) {
  if (!attempt || attempt.provider !== 'telebirr' || attempt.provider_environment !== 'uat' || attempt.currency !== 'ETB' ||
      typeof attempt.buyer_id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(attempt.buyer_id) ||
      !['pending','awaiting_authorization','verification_pending','reconciliation_required'].includes(attempt.status) ||
      attempt.verified_at != null || typeof attempt.merchant_reference !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(attempt.merchant_reference) ||
      typeof attempt.amount_minor !== 'string' || !/^[1-9][0-9]{0,8}$/.test(attempt.amount_minor) || BigInt(attempt.amount_minor) > 100000000n ||
      (attempt.sdk_app_id != null && attempt.sdk_app_id !== merchant.MERCHANT_APP_ID) ||
      (attempt.sdk_short_code != null && attempt.sdk_short_code !== merchant.SHORT_CODE)) fail('QUERY_ATTEMPT_INVALID');
}

// No coercion, field renaming, URL decoding, ambiguous delimiters, nested objects
// or duplicate flattened keys. Empty fields are omitted per request preparation;
// adoption of this precise profile for responses remains unconfirmed.
function candidateCanonical(input) {
  if (!object(input)) fail('RESPONSE_SHAPE_INVALID');
  const fields = new Map();
  for (const source of [input, ...(Object.hasOwn(input, 'biz_content') ? [input.biz_content] : [])]) {
    if (!object(source)) fail('RESPONSE_SHAPE_INVALID');
    for (const [key, value] of Object.entries(source)) {
      if (['sign','sign_type','biz_content'].includes(key)) {
        if (source !== input) fail('RESPONSE_SHAPE_INVALID');
        continue;
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || fields.has(key)) fail('RESPONSE_SHAPE_INVALID');
      fields.set(key, value);
      if (value != null && (typeof value !== 'string' || /[&=\r\n]/.test(value))) fail('RESPONSE_SHAPE_INVALID');
    }
  }
  return [...fields.keys()].sort().filter(key => fields.get(key) != null && fields.get(key) !== '')
    .map(key => `${key}=${fields.get(key)}`).join('&');
}

function checkSignature(payload, key) {
  if (!object(payload) || !payload.sign) fail('PROVIDER_SIGNATURE_MISSING');
  if (!key) fail('PROVIDER_KEY_REQUIRED');
  if (payload.sign_type !== 'SHA256WithRSA' || typeof payload.sign !== 'string' ||
      payload.sign.length > 2048 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.sign)) fail('PROVIDER_SIGNATURE_INVALID');
  const bytes = Buffer.from(payload.sign, 'base64');
  if (bytes.toString('base64') !== payload.sign || bytes.length !== Math.ceil(key.asymmetricKeyDetails.modulusLength / 8)) fail('PROVIDER_SIGNATURE_INVALID');
  const canonical = candidateCanonical(payload);
  if (!crypto.verify('sha256', Buffer.from(canonical), {
    key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  }, bytes)) fail('PROVIDER_SIGNATURE_INVALID');
}

function identity(biz, attempt, merchant) {
  if (biz.merch_order_id !== attempt.merchant_reference ||
      (Object.hasOwn(biz, 'appid') && biz.appid !== merchant.MERCHANT_APP_ID) ||
      (Object.hasOwn(biz, 'merch_code') && biz.merch_code !== merchant.SHORT_CODE)) fail('RESPONSE_IDENTITY_MISMATCH');
  if (biz.trans_currency !== 'ETB') fail('RESPONSE_CURRENCY_MISMATCH');
  if (typeof biz.total_amount !== 'string' || !/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,2})?$/.test(biz.total_amount)) fail('RESPONSE_AMOUNT_MISMATCH');
  const [whole, fraction = ''] = biz.total_amount.split('.');
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) !== BigInt(attempt.amount_minor)) fail('RESPONSE_AMOUNT_MISMATCH');
  if (typeof biz.payment_order_id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(biz.payment_order_id)) fail('RESPONSE_SHAPE_INVALID');
  if ((attempt.provider_transaction_reference != null && biz.payment_order_id !== attempt.provider_transaction_reference) ||
      (Object.hasOwn(biz, 'prepay_id') && biz.prepay_id !== attempt.provider_reference)) fail('RESPONSE_REFERENCE_CONFLICT');
}

function assess(payload, attempt, merchant, key, channel) {
  try {
    validateAttempt(attempt, merchant);
    checkSignature(payload, key);
    let biz, state, category;
    if (channel === 'query') {
      if (payload.result !== 'SUCCESS' || payload.code !== '0' || !object(payload.biz_content)) fail('RESPONSE_SHAPE_INVALID');
      if (Object.keys(payload).some(key => !['result','code','msg','nonce_str','sign','sign_type','biz_content'].includes(key)) ||
          typeof payload.nonce_str !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(payload.nonce_str)) fail('RESPONSE_SHAPE_INVALID');
      biz = payload.biz_content;
      if (Object.keys(biz).some(key => !['merch_order_id','appid','merch_code','prepay_id','order_status','trade_status',
        'payment_order_id','trans_time','trans_currency','total_amount','trans_id'].includes(key)) ||
          typeof biz.trans_time !== 'string' || !biz.trans_time || biz.trans_time.length > 64) fail('RESPONSE_SHAPE_INVALID');
      if (Object.hasOwn(biz, 'order_status') && Object.hasOwn(biz, 'trade_status') && biz.order_status !== biz.trade_status) fail('RESPONSE_STATUS_CONFLICT');
      // Both spellings recognized for diagnostics ONLY, never a final verdict.
      state = biz.order_status ?? biz.trade_status;
      category = Object.hasOwn(queryStates, state) ? queryStates[state] : null;
    } else {
      if (Object.hasOwn(payload, 'biz_content') || Object.hasOwn(payload, 'data') || Object.hasOwn(payload, 'order_status') ||
          Object.hasOwn(payload, 'transId')) fail('RESPONSE_SHAPE_INVALID');
      biz = payload;
      state = biz.trade_status;
      category = Object.hasOwn(notifyStates, state) ? notifyStates[state] : null;
      if (biz.appid !== merchant.MERCHANT_APP_ID || biz.merch_code !== merchant.SHORT_CODE) fail('RESPONSE_IDENTITY_MISMATCH');
      if (Object.hasOwn(biz, 'notify_url') && biz.notify_url !== merchant.NOTIFY_URL) fail('RESPONSE_IDENTITY_MISMATCH');
      if (typeof biz.trans_end_time !== 'string' || !/^[0-9]{1,13}$/.test(biz.trans_end_time)) fail('RESPONSE_SHAPE_INVALID');
    }
    identity(biz, attempt, merchant);
    if (typeof state !== 'string' || !category) fail('RESPONSE_STATUS_UNKNOWN');
    return { ...unresolved(channel === 'query' ? 'QUERY_RESPONSE_CONTRACT_UNCONFIRMED' : 'NOTIFY_RESPONSE_CONTRACT_UNCONFIRMED'),
      candidate_signature_valid: true, observed_state: state, observation: category };
  } catch (e) {
    return unresolved(reasons.has(e.message) ? e.message : 'RESPONSE_SHAPE_INVALID');
  }
}

module.exports = { providerKey, validateAttempt, candidateCanonical, reasons,
  assessQuery: (payload, attempt, merchant, key) => assess(payload, attempt, merchant, key, 'query'),
  // Offline validation only: deliberately not mounted as an HTTP receiver.
  assessNotification: (payload, attempt, merchant, key) => assess(payload, attempt, merchant, key, 'notify') };
