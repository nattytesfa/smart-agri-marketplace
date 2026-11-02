const crypto = require('crypto');
const pool = require('../../config/db');
const wallet = require('../transactionsEscrow/wallet.service');
const money = require('../../utils/money');
const { createProvider, BLOCKER, sdkInitialization } = require('./provider');
const { reasons: verificationReasons } = require('./evidence');
const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const view = row => ({ ...Object.fromEntries([
  'funding_id','buyer_id','amount_minor','currency','provider','provider_environment','merchant_reference',
  'provider_reference','provider_transaction_reference','status','created_at','updated_at','expires_at','verified_at','reconciliation_reason','verification_attempts','next_verification_at',
].map(key => [key, row[key]])), amount: money.formatMinor(BigInt(row.amount_minor)),
  demo_credit_event: null, spendable: false, sdk_launch: null, blocker: BLOCKER });
function createService({ db = pool, provider = createProvider() } = {}) {
  const sdkEnabled = () => {
    if (process.env.TELEBIRR_UAT_SDK_ENABLED !== 'true') return false;
    try { provider.configuration(); return true; } catch (_) { return false; }
  };
  const launchView = row => {
    const result = view(row);
    if (!sdkEnabled() || row.sdk_contract !== 'inapp_create_order_v1' || row.status !== 'awaiting_authorization' ||
        new Date(row.expires_at) <= new Date()) return result;
    const c = provider.configuration();
    if (row.sdk_app_id !== c.MERCHANT_APP_ID || row.sdk_short_code !== c.SHORT_CODE) return result;
    try {
      result.sdk_launch = sdkInitialization({ appId: row.sdk_app_id, shortCode: row.sdk_short_code,
        amountMinor: row.amount_minor, prepayId: row.provider_reference, timeoutExpress: row.sdk_timeout_express });
    } catch (_) { /* Legacy/incomplete/mismatched context never launches. */ }
    return result;
  };
  const atomic = async action => {
    const client = await db.connect();
    try { await client.query('BEGIN'); const r = await action(client); await client.query('COMMIT'); return r; }
    catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  };
  const audit = (client, id, event, reason) => client.query(
    'INSERT INTO telebirr_uat_audit(funding_id,event_type,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id,event,reason]);
  async function owned(client, buyer, id, lock = false) {
    if (!uuid(id)) throw fail(400, 'Invalid funding ID');
    const row = (await client.query(`SELECT * FROM telebirr_uat_funding WHERE funding_id=$1 AND buyer_id=$2${lock ? ' FOR UPDATE' : ''}`, [id,buyer])).rows[0];
    if (!row) throw fail(404, 'Funding attempt not found');
    return row;
  }
  return {
    capabilities() {
      let ready = false;
      try { provider.configuration(); ready = true; } catch (_) { /* sanitized readiness only */ }
      return { environment: 'uat', preorder_enabled: ready, sdk_launch_enabled: sdkEnabled(), verification_enabled: false, demo_conversion_enabled: false, blocker: BLOCKER };
    },
    async create(buyer, input) {
      const cents = wallet.amount(input.amount), key = wallet.key(input.idempotency_key);
      if (cents > 100000000n) throw fail(400, 'Maximum UAT amount is ETB 1000000.00');
      provider.configuration();
      // Commit the durable intent BEFORE making any external request. Only the
      // creator sends a preorder; retries/restarts never resubmit ambiguously.
      const { row, fresh } = await atomic(async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`telebirr:${buyer}`]);
        const old = (await client.query('SELECT * FROM telebirr_uat_funding WHERE buyer_id=$1 AND idempotency_key=$2', [buyer,key])).rows[0];
        if (old) {
          if (BigInt(old.amount_minor) !== cents) throw fail(409, 'Idempotency key already used with different details');
          return { row: old, fresh: false };
        }
        const user = (await client.query('SELECT role FROM users WHERE user_id=$1', [buyer])).rows[0];
        if (user?.role !== 'buyer') throw fail(403, 'Buyer role required');
        const recent = (await client.query("SELECT count(*)::int AS count FROM telebirr_uat_funding WHERE buyer_id=$1 AND created_at>now()-interval '1 hour'", [buyer])).rows[0].count;
        if (recent >= 10) throw fail(429, 'UAT funding hourly limit reached');
        const row = (await client.query(`INSERT INTO telebirr_uat_funding(buyer_id,amount_minor,merchant_reference,idempotency_key)
          VALUES($1,$2,$3,$4) RETURNING *`, [buyer,cents.toString(),crypto.randomBytes(16).toString('hex'),key])).rows[0];
        await audit(client,row.funding_id,'created','UAT_ONLY_NO_WALLET_CREDIT');
        return { row, fresh: true };
      });
      if (!fresh) return launchView(row);
      let result, reason;
      try { result = await provider.preorder(row); }
      catch (e) {
        const allowed = new Set(['SIGNING_FAILED','FABRIC_AUTH_UNCONFIRMED','FABRIC_AUTH_INVALID','PREORDER_UNCONFIRMED','PREORDER_RESPONSE_INVALID']);
        reason = allowed.has(e.providerCode) ? e.providerCode : 'PREORDER_UNCONFIRMED';
      }
      return atomic(async client => {
        const current = await owned(client,buyer,row.funding_id,true);
        const updated = (await client.query(`UPDATE telebirr_uat_funding SET provider_reference=$2,
          status=$3,reconciliation_reason=$4,sdk_app_id=$5,sdk_short_code=$6,sdk_timeout_express=$7,sdk_contract=$8,
          updated_at=now() WHERE funding_id=$1 RETURNING *`,
        [current.funding_id,result?.prepayId || null,result ? 'awaiting_authorization' : 'reconciliation_required',
          result ? 'PROVIDER_VERIFICATION_CONFIGURATION_REQUIRED' : reason,
          result?.sdkContext?.appId || null,result?.sdkContext?.shortCode || null,
          result?.sdkContext?.timeoutExpress || null,result?.sdkContext?.contract || null])).rows[0];
        await audit(client,row.funding_id,result ? 'preorder_created' : 'preorder_unconfirmed',result ? 'SDK_RESPONSE_VALIDATED_NOT_PAYMENT_PROOF' : reason);
        return launchView(updated);
      });
    },
    async get(buyer, id) { return view(await owned(db,buyer,id)); },
    async list(buyer, query = {}) {
      const limit = Number(query.limit || 25), offset = Number(query.offset || 0);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw fail(400,'Invalid pagination');
      const rows = (await db.query(`SELECT * FROM telebirr_uat_funding ${buyer ? 'WHERE buyer_id=$3' : ''}
        ORDER BY created_at DESC,funding_id DESC LIMIT $1 OFFSET $2`, buyer ? [limit+1,offset,buyer] : [limit+1,offset])).rows;
      return { items: rows.slice(0,limit).map(view), has_more: rows.length > limit, offset, limit };
    },
    async verify(buyer, id, interactionEnded = false) {
      // There is deliberately NO caller-supplied status/reference/amount. Even a
      // forged exported-service callback cannot finalize this database record.
      return atomic(async client => {
        const row = await owned(client,buyer,id,true);
        if (interactionEnded) await audit(client,id,'sdk_interaction_ended','UNTRUSTED_CLIENT_SIGNAL');
        if (row.verification_attempts >= 8 || (row.verification_attempts > 0 && new Date(row.next_verification_at) > new Date())) return view(row);
        let evidence;
        try { evidence = await provider.verify(row); }
        catch (_) { evidence = { authoritative: false, reason: 'QUERY_UNCONFIRMED' }; }
        if (evidence.authoritative !== false) throw fail(503,'Authoritative provider contract has not been implemented');
        const expired = new Date(row.expires_at) <= new Date();
        const tries = row.verification_attempts+1;
        const updated = (await client.query(`UPDATE telebirr_uat_funding SET status=$2,
          reconciliation_reason=$3,verification_attempts=$4,
          next_verification_at=CASE WHEN $4::int>=8 THEN NULL ELSE now()+($5::int*interval '1 second') END,
          updated_at=now() WHERE funding_id=$1 RETURNING *`, [id,
          expired || !row.provider_reference || tries >= 8 ? 'reconciliation_required' : 'verification_pending',
          expired ? 'AUTHORIZATION_WINDOW_ELAPSED_OUTCOME_UNKNOWN' :
            (verificationReasons.has(evidence.reason) ? evidence.reason : 'VERIFICATION_DOCUMENTATION_REQUIRED'),
          tries,Math.min(3600,30*2**tries)])).rows[0];
        await audit(client,id,'verification_blocked',updated.reconciliation_reason);
        return view(updated);
      });
    },
    async recover() {
      // Durable bounded scheduling, same cron/job pattern as checkout recovery.
      // No automatic preorder replay and no invented expiry/failure/refund.
      const rows = (await db.query(`SELECT funding_id,buyer_id FROM telebirr_uat_funding
        WHERE next_verification_at<=now() AND verification_attempts<8 ORDER BY next_verification_at LIMIT 100`)).rows;
      for (const row of rows) await this.verify(row.buyer_id,row.funding_id);
      return rows.length;
    },
  };
}
module.exports = { createService, view, ...createService() };
