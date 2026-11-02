const pool = require('../../config/db');
const money = require('../../utils/money');
const fail = (status, message) => Object.assign(new Error(message), { status });
const enabled = () => {
  require('./simulation.service').enabled();
  if (process.env.DEMO_WALLETS_ENABLED !== 'true') throw fail(503, 'Demo wallets are disabled');
};
const amount = value => {
  if (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw fail(400, 'Amount must be a positive decimal string with at most two decimal places');
  const n = money.lineMinor('1', value);
  if (n <= 0n) throw fail(400, 'Amount must be positive');
  return n;
};
const key = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(value)) throw fail(400, 'Valid idempotency key (8–128 characters) required');
  return value;
};
const atomic = async action => {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const r = await action(db); await db.query('COMMIT'); return r; }
  catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};
const account = async (db, owner, expected) => {
  if (typeof owner !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)) throw fail(400,'Invalid wallet owner ID');
  const u = (await db.query('SELECT role FROM users WHERE user_id=$1', [owner])).rows[0];
  if (!u || !['buyer','farmer'].includes(u.role) || (expected && u.role !== expected)) throw fail(403, `${expected || 'Buyer or farmer'} role required`);
  await db.query('INSERT INTO demo_wallet_accounts(owner_id,wallet_type) VALUES($1,$2) ON CONFLICT(owner_id) DO NOTHING', [owner,u.role]);
  return (await db.query('SELECT * FROM demo_wallet_accounts WHERE owner_id=$1 FOR UPDATE', [owner])).rows[0];
};
const balance = async (db, wid) => BigInt((await db.query('SELECT coalesce(sum(amount_minor),0)::text AS amount FROM demo_wallet_entries WHERE wallet_id=$1', [wid])).rows[0].amount);
const uatAvailable = () => {
  // Preserve the independent UAT capability gates. Disabled UAT never reads
  // merchant configuration, and simulation never supplies UAT readiness/proof.
  if (process.env.TELEBIRR_UAT_ENABLED !== 'true' || process.env.TELEBIRR_UAT_SDK_ENABLED !== 'true') return false;
  try {
    const c = require('../telebirrUat/service').capabilities();
    return c.preorder_enabled === true && c.sdk_launch_enabled === true;
  } catch (_) { return false; }
};
const topUp = async (owner, input) => {
  enabled();
  if (String(input.idempotency_key).startsWith('telebirr-demo:')) throw fail(400, 'Reserved funding key');
  return atomic(db => creditTopUp(db,owner,input));
};
// Shared authoritative credit path. Caller owns the database transaction.
const creditTopUp = async (db, owner, input) => {
  enabled();
  const cents = amount(input.amount), idempotency = key(input.idempotency_key);
  if (input.confirm_demo !== true) throw fail(400, 'Explicit confirmation that funds are virtual is required');
  const max = amount(process.env.DEMO_WALLET_MAX_TOP_UP || '1000000.00');
  const cap = amount(process.env.DEMO_WALLET_MAX_BALANCE || '5000000.00');
  if (cents > max) throw fail(400, `Maximum demo top-up is ETB ${money.formatMinor(max)}`);
  const w = await account(db, owner, 'buyer');
  const old = (await db.query('SELECT * FROM demo_wallet_entries WHERE wallet_id=$1 AND idempotency_key=$2', [w.wallet_id,idempotency])).rows[0];
  if (old && (old.event_type !== 'demo_top_up' || BigInt(old.amount_minor) !== cents)) throw fail(409, 'Idempotency key already used with different details');
  let event = old;
  if (!old) {
    if ((await balance(db,w.wallet_id)) + cents > cap) throw fail(409, 'Demo balance limit reached');
    const recent = (await db.query("SELECT count(*)::int AS count FROM demo_wallet_entries WHERE wallet_id=$1 AND event_type='demo_top_up' AND created_at>now()-interval '1 hour'", [w.wallet_id])).rows[0].count;
    const limit = Number(process.env.DEMO_WALLET_TOP_UPS_PER_HOUR || '10');
    if (!Number.isSafeInteger(limit) || limit < 1) throw fail(503, 'Invalid demo top-up rate configuration');
    if (recent >= limit) throw fail(429, 'Demo top-up hourly limit reached');
    event = (await db.query("INSERT INTO demo_wallet_entries(wallet_id,event_type,amount_minor,idempotency_key) VALUES($1,'demo_top_up',$2,$3) RETURNING *", [w.wallet_id,cents.toString(),idempotency])).rows[0];
  }
  return { simulated:true, reference:event.event_id, created_at:event.created_at, available:money.formatMinor(await balance(db,w.wallet_id)) };
};
// Called within the existing payment transaction, never as a separate operation.
const debit = async (db,t,input) => {
  enabled(); key(input.idempotency_key);
  if (input.confirm_demo !== true) throw fail(400, 'Explicit demo wallet payment confirmation required');
  const w = await account(db,t.buyer_id,'buyer');
  const available = await balance(db,w.wallet_id), required = BigInt(t.total_minor);
  if (available < required) throw fail(409, `Insufficient demo funds. Available ETB ${money.formatMinor(available)}; additional ETB ${money.formatMinor(required-available)} required. Top up your demo wallet and retry this checkout.`);
  await db.query("INSERT INTO demo_wallet_entries(wallet_id,event_type,amount_minor,transaction_id,idempotency_key) VALUES($1,'checkout_debit',$2,$3,$4)", [w.wallet_id,(-required).toString(),t.transaction_id,input.idempotency_key]);
};
const summary = owner => atomic(async db => {
  // A locked account serializes writes; read all financial summaries in one snapshot.
  const w = await account(db,owner);
  const r = (await db.query(`SELECT coalesce(sum(amount_minor),0)::text AS available,
    coalesce(sum(amount_minor) FILTER(WHERE event_type='buyer_refund'),0)::text AS refunds,
    coalesce(sum(amount_minor) FILTER(WHERE event_type='farmer_settlement'),0)::text AS settlements
    FROM demo_wallet_entries WHERE wallet_id=$1`,[w.wallet_id])).rows[0];
  const e = (await db.query(`SELECT coalesce(sum(held) FILTER(WHERE dispute_status NOT IN ('open','under_review')),0)::text AS pending,
    coalesce(sum(held) FILTER(WHERE dispute_status IN ('open','under_review')),0)::text AS disputed,
    coalesce(sum(held),0)::text AS held FROM (
    SELECT a.allocation_id,a.dispute_status,coalesce(sum(CASE WHEN e.event_type='hold' THEN e.amount_minor ELSE -e.amount_minor END),0) AS held
    FROM transaction_allocations a JOIN transactions t USING(transaction_id) LEFT JOIN simulated_escrow_ledger e USING(allocation_id)
    WHERE ($2='buyer' AND t.buyer_id=$1) OR ($2='farmer' AND a.farmer_id=$1)
    GROUP BY a.allocation_id) x`,[owner,w.wallet_type])).rows[0];
  const pending = (await db.query("SELECT coalesce(sum(total_minor),0)::text AS amount FROM transactions WHERE buyer_id=$1 AND checkout_status='pending' AND payment_status='pending' AND checkout_expires_at>now()",[owner])).rows[0].amount;
  return { ...w, simulated:true, telebirr_simulation_enabled:require('../telebirrSimulation/config').available(), telebirr_uat_enabled:uatAvailable(), top_up_enabled:process.env.DEMO_WALLETS_ENABLED==='true' && process.env.SIMULATED_PAYMENTS_ENABLED==='true' && ['test','demo','development'].includes(process.env.NODE_ENV),
    ...Object.fromEntries(Object.entries({...r,...e,pending_checkout:pending}).map(([k,v])=>[k,money.formatMinor(BigInt(v))])) };
});
const pagination = query => {
  const limit = Number(query.limit || 25), offset = Number(query.offset || 0);
  if (!Number.isSafeInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(offset) || offset<0 || offset>100000) throw fail(400,'Invalid pagination');
  return {limit,offset};
};
const history = async (owner,query={}) => {
  const {limit,offset} = pagination(query);
  const source = query.funding_source || 'all';
  if (!['all','instant','telebirr-demo'].includes(source)) throw fail(400,'Invalid wallet funding source');
  return atomic(async db => {
    const w = await account(db,owner);
    const rows = (await db.query(`SELECT e.*,
      CASE WHEN e.idempotency_key LIKE 'telebirr-demo:%' THEN substring(e.idempotency_key FROM 15) END AS simulation_payment_id,
      CASE WHEN e.idempotency_key LIKE 'telebirr-demo:%' THEN 'DEMO-TB-'||substring(e.idempotency_key FROM 15) END AS simulation_reference,
      CASE WHEN e.idempotency_key LIKE 'telebirr-demo:%' THEN 'Telebirr Demo Payment — Simulation' END AS funding_label
      FROM demo_wallet_entries e
      WHERE e.wallet_id=$1 AND ($4='all' OR (e.event_type='demo_top_up' AND
        (($4='instant' AND e.idempotency_key NOT LIKE 'telebirr-demo:%') OR ($4='telebirr-demo' AND e.idempotency_key LIKE 'telebirr-demo:%'))))
      ORDER BY e.created_at DESC,e.event_id DESC LIMIT $2 OFFSET $3`,[w.wallet_id,limit+1,offset,source])).rows;
    return { items:rows.slice(0,limit).map(e=>({...e,amount:money.formatMinor(BigInt(e.amount_minor)),status:'completed',simulated:true})),has_more:rows.length>limit,offset,limit };
  });
};
const admin = async query => atomic(async db => {
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const {limit,offset} = pagination(query);
  const wallets = (await db.query(`SELECT w.*,u.full_name,coalesce(sum(e.amount_minor),0)::text AS available_minor
    FROM demo_wallet_accounts w JOIN users u ON u.user_id=w.owner_id LEFT JOIN demo_wallet_entries e USING(wallet_id)
    GROUP BY w.wallet_id,u.full_name ORDER BY w.created_at DESC,w.wallet_id LIMIT $1 OFFSET $2`,[limit+1,offset])).rows;
  const mismatch = (await db.query(`SELECT e.event_id,a.transaction_id,'missing_wallet_credit' AS issue FROM simulated_escrow_ledger e
    JOIN transaction_allocations a USING(allocation_id) LEFT JOIN demo_wallet_entries w ON w.escrow_event_id=e.event_id
    WHERE e.event_type IN ('settlement','refund') AND w.event_id IS NULL
    UNION ALL SELECT NULL,t.transaction_id,'funding_mismatch' FROM transactions t
    WHERE t.simulation_version='v1' AND t.payment_status IN ('simulated_paid','refunded') AND (
    t.total_minor<>(SELECT coalesce(sum(e.amount_minor),0) FROM simulated_escrow_ledger e JOIN transaction_allocations a USING(allocation_id) WHERE a.transaction_id=t.transaction_id AND e.event_type='hold')
    OR (t.payment_method='demo_wallet' AND t.total_minor<>(SELECT coalesce(sum(-amount_minor),0) FROM demo_wallet_entries WHERE transaction_id=t.transaction_id AND event_type='checkout_debit')))`)).rows;
  const totals = (await db.query(`SELECT
    (SELECT coalesce(sum(amount_minor),0) FROM demo_wallet_entries WHERE event_type='demo_top_up')+
    (SELECT coalesce(sum(e.amount_minor),0) FROM simulated_escrow_ledger e JOIN transaction_allocations a USING(allocation_id)
     JOIN transactions t USING(transaction_id) WHERE e.event_type='hold' AND t.payment_method<>'demo_wallet') AS sources,
    (SELECT coalesce(sum(amount_minor),0) FROM demo_wallet_entries) AS wallets,
    (SELECT coalesce(sum(CASE WHEN event_type='hold' THEN amount_minor ELSE -amount_minor END),0) FROM simulated_escrow_ledger) AS escrow`)).rows[0];
  const conserved = BigInt(totals.sources)===BigInt(totals.wallets)+BigInt(totals.escrow);
  return { simulated:true,items:wallets.slice(0,limit).map(w=>({...w,available:money.formatMinor(BigInt(w.available_minor))})),has_more:wallets.length>limit,mismatches:mismatch,
    conservation:{...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,money.formatMinor(BigInt(v))])),balanced:conserved} };
});
const quote = (owner,id) => atomic(async db => {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw fail(400,'Invalid checkout ID');
  const w = await account(db,owner,'buyer');
  const t = (await db.query("SELECT total_minor,checkout_status,payment_status FROM transactions WHERE transaction_id=$1 AND buyer_id=$2 AND simulation_version='v1'",[id,owner])).rows[0];
  if (!t) throw fail(404,'Checkout not found');
  const available=await balance(db,w.wallet_id),total=BigInt(t.total_minor);
  return {simulated:true,available:money.formatMinor(available),total:money.formatMinor(total),remaining:money.formatMinor(available-total),additional_required:money.formatMinor(total>available?total-available:0n)};
});
module.exports = {enabled,amount,key,account,balance,topUp,creditTopUp,debit,summary,history,admin,quote};
