const pool = require('../../config/db');
const money = require('../../utils/money');
const { createHash } = require('crypto');
const qrToken = require('../traceabilityQr/qrToken.util');
const fail = (status, message) => Object.assign(new Error(message), { status });
const qrConflict = (code, message) => Object.assign(fail(409, message), { publicCode: code });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const enabled = () => {
  if (process.env.SIMULATED_PAYMENTS_ENABLED !== 'true' ||
      !['development', 'test', 'demo'].includes(process.env.NODE_ENV)) {
    throw fail(503, 'Simulated payment actions are disabled in this environment');
  }
};
const atomic = async action => {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await action(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};
const audit = (db, t, actor, action, allocation = null, metadata = {}) => db.query(
  'INSERT INTO transaction_audit(transaction_id,allocation_id,actor_id,action,metadata) VALUES($1,$2,$3,$4,$5)',
  [t.transaction_id, allocation, actor, action, metadata]);
const role = async (db, actor, expected) => {
  const u = (await db.query('SELECT role FROM users WHERE user_id=$1', [actor])).rows[0];
  if (!u || u.role !== expected) throw fail(403, `${expected} role required`);
};
const parent = async (db, id) => {
  if (!uuid(id)) throw fail(400, 'Invalid transaction ID');
  const t = (await db.query('SELECT * FROM transactions WHERE transaction_id=$1 FOR UPDATE', [id])).rows[0];
  if (!t || t.simulation_version !== 'v1') throw fail(404, 'Simulated transaction not found');
  return t;
};
const allocation = async (db, t, id) => {
  if (!uuid(id)) throw fail(400, 'Invalid allocation ID');
  const a = (await db.query('SELECT * FROM transaction_allocations WHERE transaction_id=$1 AND allocation_id=$2 FOR UPDATE', [t.transaction_id, id])).rows[0];
  if (!a) throw fail(404, 'Allocation not found');
  return a;
};
const funded = t => {
  enabled();
  if (t.payment_mode !== 'prototype' || t.payment_status !== 'simulated_paid' || !['fulfilling', 'partially_completed'].includes(t.checkout_status))
    throw fail(409, 'Simulated funds are not held for delivery processing');
};
const balances = async (db, id) => {
  const r = (await db.query(`SELECT
    coalesce(sum(amount_minor) FILTER(WHERE event_type='hold'),0)::text AS paid,
    coalesce(sum(amount_minor) FILTER(WHERE event_type='settlement'),0)::text AS settled,
    coalesce(sum(amount_minor) FILTER(WHERE event_type='refund'),0)::text AS refunded
    FROM simulated_escrow_ledger WHERE allocation_id=$1`, [id])).rows[0];
  return { paid: BigInt(r.paid), settled: BigInt(r.settled), refunded: BigInt(r.refunded),
    held: BigInt(r.paid) - BigInt(r.settled) - BigInt(r.refunded) };
};
const ledger = (db, a, actor, type, cents, key) => {
  enabled();
  return db.query(`INSERT INTO simulated_escrow_ledger
  (allocation_id,event_type,amount_minor,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5)`,
  [a.allocation_id, type, cents.toString(), actor, key]);
};

const create = async data => atomic(async db => {
  const { buyer_id: buyer, listing_id: listing, batch_id: batch, request_id: request, payment_method: method } = data;
  await role(db, buyer, 'buyer');
  if (!!listing === !!batch || (listing && !uuid(listing)) || (batch && !uuid(batch))) throw fail(400, 'Choose one valid listing or batch');
   if (!['telebirr', 'cbe_birr', 'demo_wallet'].includes(method)) throw fail(400, 'Choose a simulated payment method');
  if (request != null && !uuid(request)) throw fail(400, 'request_id must be a UUID');
  const quantity = data.quantity == null ? null : money.positiveDecimal(data.quantity);
  const fingerprint = hash(JSON.stringify([listing || null, batch || null, quantity, method]));
  if (listing && !request) {
    // Compatibility for older callers without request IDs: serialize and reuse
    // an identical active checkout rather than reserving the same order twice.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`checkout:${buyer}:${listing}`]);
    const old = (await db.query(`SELECT * FROM transactions WHERE buyer_id=$1 AND source_listing_id=$2
      AND checkout_status IN ('pending','fulfilling','partially_completed','reconciliation_required') ORDER BY created_at DESC LIMIT 1`, [buyer, listing])).rows[0];
    if (old) {
      if (old.request_fingerprint !== fingerprint) throw fail(409, 'An active checkout exists; reopen it or cancel before changing purchase details');
      return old;
    }
  }
  if (request) {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`checkout:${buyer}:${request}`]);
    const old = (await db.query('SELECT * FROM transactions WHERE buyer_id=$1 AND request_id=$2', [buyer, request])).rows[0];
    if (old) {
      if (old.request_fingerprint !== fingerprint) throw fail(409, 'Request ID already used with different checkout details');
      return old;
    }
  }
  let batchId = batch;
  if (listing) {
    // Single purchases use the SAME reservation ledger, not a second stock counter.
    // This internal one-contribution lot supports partial quantities safely.
    // Create/lock the new batch before the listing: transaction -> batch -> listing.
    batchId = (await db.query(`INSERT INTO digital_debo_batches(target_buyer_id,crop_type,total_quantity,unit,criteria,status,pricing_policy)
      VALUES($1,'checkout',1,'quintal','{"source":"single_listing_checkout"}','pending',$2) RETURNING batch_id`, [buyer, money.policy])).rows[0].batch_id;
    const l = (await db.query('SELECT l.*,public.debo_available(l) AS available FROM produce_listings l WHERE listing_id=$1 FOR UPDATE', [listing])).rows[0];
    if (!l || l.deleted_at || l.status !== 'available' || l.sync_status !== 'cloud' || l.farmer_id === buyer) throw fail(409, 'Listing unavailable');
    const q = quantity || l.available;
    if (money.decimal(l.available).coefficient === 0n) throw fail(409, 'Insufficient unreserved quantity');
    money.positiveDecimal(q);
    const fits = (await db.query('SELECT $1::numeric <= $2::numeric AS fits', [q, l.available])).rows[0].fits;
    if (!fits) throw fail(409, 'Insufficient unreserved quantity');
    await db.query(`UPDATE digital_debo_batches SET crop_type=$2,total_quantity=$3,unit=$4,status='filled' WHERE batch_id=$1`, [batchId, l.crop_type, q, l.unit]);
    await db.query(`INSERT INTO debo_batch_listings(batch_id,listing_id,proposed_quantity,confirmed_quantity,unit,unit_price,conversion_factor,participation_status,reservation_status,confirmed_at)
      VALUES($1,$2,$3,$3,$4,$5,1,'accepted','active',now())`, [batchId, listing, q, l.unit, l.price_per_unit]);
    await db.query('UPDATE produce_listings SET version=version+1,updated_at=now() WHERE listing_id=$1', [listing]);
  }
  const b = (await db.query('SELECT * FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE', [batchId])).rows[0];
  const existing = (await db.query('SELECT * FROM transactions WHERE batch_id=$1', [batchId])).rows[0];
  if (existing) {
    if (existing.buyer_id === buyer && existing.simulation_version === 'v1') return existing;
    throw fail(409, 'Checkout already exists');
  }
  if (!b || b.target_buyer_id !== buyer || b.status !== 'filled' || !b.criteria || new Date(b.expires_at) <= new Date()) throw fail(409, 'Batch unavailable');
  const members = (await db.query(`SELECT l.*,d.confirmed_quantity,d.unit_price,d.unit AS agreed_unit
    FROM debo_batch_listings d JOIN produce_listings l ON l.listing_id=d.listing_id
    WHERE d.batch_id=$1 AND d.reservation_status='active' ORDER BY l.listing_id FOR UPDATE OF l`, [batchId])).rows;
  const full = (await db.query(`SELECT coalesce(sum(confirmed_quantity*conversion_factor),0)>= $2::numeric AS full
    FROM debo_batch_listings WHERE batch_id=$1 AND reservation_status='active'`, [batchId, b.total_quantity])).rows[0].full;
  if (!full || !members.length || members.some(l => l.deleted_at || l.status !== 'available' || l.farmer_id === buyer || !money.sameDecimal(l.price_per_unit, l.unit_price))) throw fail(409, 'Reservations or prices changed');
  const cents = members.map(l => money.lineMinor(l.confirmed_quantity, l.unit_price));
  const total = cents.reduce((a, n) => a + n, 0n);
  if (total < 1n || total > 999999999999n || cents.some(n => n < 1n)) throw fail(400, 'Checkout/allocation amount outside supported range');
  const timeout = require('./transaction.service').pendingTimeoutSeconds();
  const t = (await db.query(`INSERT INTO transactions(batch_id,source_listing_id,buyer_id,farmer_id,amount,total_minor,payment_method,
    payment_mode,payment_status,checkout_status,escrow_status,checkout_expires_at,pricing_policy,simulation_version,request_id,request_fingerprint)
    VALUES($1,$2,$3,$4,$5,$6,$7,'prototype','pending','pending','locked',now()+($8::int*interval '1 second'),$9,'v1',$10,$11) RETURNING *`,
    [batchId, listing || null, buyer, new Set(members.map(l => l.farmer_id)).size === 1 ? members[0].farmer_id : null,
      money.formatMinor(total), total.toString(), method, timeout, money.policy, request || null, fingerprint])).rows[0];
  for (let i = 0; i < members.length; i++) {
    const l = members[i];
    await db.query(`INSERT INTO transaction_allocations(transaction_id,farmer_id,listing_id,batch_id,quantity,unit,unit_price,amount_minor,traceability)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [t.transaction_id, l.farmer_id, l.listing_id, batchId, l.confirmed_quantity, l.agreed_unit, l.unit_price,
      cents[i].toString(), { crop_type: l.crop_type, variety: l.variety, origin: l.kebele, harvest_date: l.harvest_date,
        quality_grade: l.quality_grade, quality_source: 'farmer_reported', image_url: l.image_url }]);
  }
  await audit(db, t, buyer, 'checkout_created', null, { simulated: true, pricing_policy: money.policy });
  return t;
});

const pay = async (id, buyer, input = {}) => {
  enabled();
  await require('./transaction.service').recoverCheckouts();
  return atomic(async db => {
    await role(db, buyer, 'buyer');
    const t = await parent(db, id);
    if (t.buyer_id !== buyer) throw fail(404, 'Checkout not found');
    if (['simulated_paid','refunded'].includes(t.payment_status) && ['fulfilling','partially_completed','completed'].includes(t.checkout_status)) {
      if (input.method !== t.payment_method) throw fail(409, 'Checkout already funded through another method');
      return { transaction_id: id, payment_status: t.payment_status, simulated: true };
    }
    if (t.payment_mode !== 'prototype' || t.checkout_status !== 'pending' || t.payment_status !== 'pending' || new Date(t.checkout_expires_at) <= new Date()) throw fail(409, 'Checkout is closed or requires reconciliation');
    if (!['telebirr', 'cbe_birr', 'demo_wallet'].includes(input.method)) throw fail(400, 'Invalid simulated payment method');
    if (input.outcome != null && !['success', 'failure'].includes(input.outcome)) throw fail(400, 'Invalid simulation outcome');
    if (input.outcome === 'failure') {
      await cancelUnpaid(db, t, buyer, 'failed');
      return { transaction_id: id, payment_status: 'failed', simulated: true };
    }
    await db.query("UPDATE transactions SET payment_status='simulated_paid',payment_method=$2,checkout_status='fulfilling' WHERE transaction_id=$1", [id, input.method]);
    if (input.method === 'demo_wallet') await require('./wallet.service').debit(db, t, input);
    const allocations = (await db.query('SELECT * FROM transaction_allocations WHERE transaction_id=$1 ORDER BY allocation_id FOR UPDATE', [id])).rows;
    for (const a of allocations) {
      await ledger(db, a, buyer, 'hold', BigInt(a.amount_minor), 'payment');
      await db.query("UPDATE transaction_allocations SET settlement_status='held' WHERE allocation_id=$1", [a.allocation_id]);
    }
    await audit(db, t, buyer, 'simulated_payment', null, { method: input.method, amount: t.amount, no_real_funds: true });
    return { transaction_id: id, payment_status: 'simulated_paid', amount: t.amount, simulated: true };
  });
};

const inventory = async (db, t, a, fulfilled) => {
  await db.query('SELECT batch_id FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE', [t.batch_id]);
  await db.query('SELECT listing_id FROM produce_listings WHERE listing_id=$1 FOR UPDATE', [a.listing_id]);
  const d = (await db.query('SELECT * FROM debo_batch_listings WHERE batch_id=$1 AND listing_id=$2 FOR UPDATE', [a.batch_id, a.listing_id])).rows[0];
  if (d.reservation_status === 'fulfilled') return; // refunds are NOT physical returns
  if (d.reservation_status !== 'active') throw fail(409, 'Reservation no longer active');
  await db.query('UPDATE debo_batch_listings SET reservation_status=$3 WHERE batch_id=$1 AND listing_id=$2', [a.batch_id, a.listing_id, fulfilled ? 'fulfilled' : 'released']);
  await db.query(`UPDATE produce_listings l SET status=CASE WHEN
    coalesce((SELECT sum(confirmed_quantity) FROM debo_batch_listings WHERE listing_id=l.listing_id AND reservation_status='fulfilled'),0)>=l.quantity
    AND NOT EXISTS(SELECT 1 FROM debo_batch_listings WHERE listing_id=l.listing_id AND reservation_status='active')
    THEN 'sold'::listing_status ELSE l.status END,version=version+1,updated_at=now() WHERE listing_id=$1`, [a.listing_id]);
};
const progress = async (db, t) => {
  const rows = (await db.query('SELECT settlement_status FROM transaction_allocations WHERE transaction_id=$1', [t.transaction_id])).rows;
  const done = rows.every(a => ['settled', 'refunded', 'cancelled'].includes(a.settlement_status));
  const some = rows.some(a => ['settled', 'refunded'].includes(a.settlement_status));
  const allRefund = rows.every(a => a.settlement_status === 'refunded');
  await db.query(`UPDATE transactions SET checkout_status=$2,escrow_status=$3::escrow_status,
    payment_status=CASE WHEN $4 THEN 'refunded' ELSE payment_status END,released_at=CASE WHEN $5 THEN now() ELSE released_at END WHERE transaction_id=$1`,
    [t.transaction_id, done ? 'completed' : some ? 'partially_completed' : 'fulfilling', done ? allRefund ? 'refunded' : 'released' : 'locked', allRefund, done]);
  if (done) await db.query(`UPDATE digital_debo_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM debo_batch_listings WHERE batch_id=$1 AND reservation_status='fulfilled') THEN 'fulfilled' ELSE 'cancelled' END,updated_at=now() WHERE batch_id=$1`, [t.batch_id]);
};
const cancelUnpaid = async (db, t, actor, outcome = 'unpaid') => {
  const all = (await db.query('SELECT * FROM transaction_allocations WHERE transaction_id=$1 ORDER BY listing_id FOR UPDATE', [t.transaction_id])).rows;
  for (const a of all) await inventory(db, t, a, false);
  await db.query("UPDATE digital_debo_batches SET status='cancelled',updated_at=now() WHERE batch_id=$1", [t.batch_id]);
  await db.query("UPDATE transactions SET checkout_status='cancelled',payment_status=$2,escrow_status='refunded',reconciliation_reason='Explicit simulation cancellation; no provider contacted',reconciled_at=now() WHERE transaction_id=$1", [t.transaction_id, outcome]);
  await audit(db, t, actor, outcome === 'failed' ? 'simulated_payment_failed' : 'checkout_cancelled');
};
const refund = async (db, t, a, actor, cents, key) => {
  const b = await balances(db, a.allocation_id);
  if (cents <= 0n || cents > b.held || b.settled > 0n) throw fail(409, 'Amount exceeds refundable simulated funds');
  await ledger(db, a, actor, 'refund', cents, key);
  if (cents === b.held) {
    await inventory(db, t, a, false);
    await db.query(`UPDATE transaction_allocations SET settlement_status='refunded',delivery_status=CASE WHEN delivery_status='delivered' THEN delivery_status ELSE 'cancelled' END WHERE allocation_id=$1`, [a.allocation_id]);
    await revoke(db, a.allocation_id);
  }
  await audit(db, t, actor, 'simulated_refund', a.allocation_id, { amount: money.formatMinor(cents), no_real_funds: true });
};
const cancel = async (id, buyer) => atomic(async db => {
  const t = await parent(db, id);
  if (t.buyer_id !== buyer) throw fail(404, 'Checkout not found');
  if (['expired', 'cancelled'].includes(t.checkout_status) || (t.checkout_status === 'completed' && t.payment_status === 'refunded')) return { checkout_status: t.checkout_status };
  if (t.payment_mode !== 'prototype') throw fail(409, 'External payment outcome requires reconciliation');
  if (t.checkout_status === 'pending' && t.payment_status === 'pending') await cancelUnpaid(db, t, buyer);
  else {
    funded(t);
    const all = (await db.query('SELECT * FROM transaction_allocations WHERE transaction_id=$1 ORDER BY listing_id FOR UPDATE', [id])).rows;
    if (all.some(a => a.delivery_status !== 'awaiting_fulfillment' || a.dispute_status !== 'none' || a.settlement_status !== 'held')) throw fail(409, 'Delivery has started; resolve affected allocations through disputes');
    for (const a of all) await refund(db, t, a, buyer, (await balances(db, a.allocation_id)).held, 'cancellation');
    await progress(db, t);
  }
  return { simulated: true, transaction_id: id, checkout_status: (await db.query('SELECT checkout_status FROM transactions WHERE transaction_id=$1',[id])).rows[0].checkout_status };
});
const revoke = (db, id) => db.query('UPDATE delivery_verifications SET revoked_at=now() WHERE allocation_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [id]);
const ready = async (id, aid, farmer) => atomic(async db => {
  await role(db, farmer, 'farmer');
  const t = await parent(db, id), a = await allocation(db, t, aid);
  if (a.farmer_id !== farmer) throw fail(404, 'Order not found');
  funded(t);
  if (a.dispute_status === 'open' || a.dispute_status === 'under_review' || a.settlement_status !== 'held') throw fail(409, 'Allocation is blocked');
  if (a.delivery_status === 'ready') return { delivery_status: 'ready' };
  if (a.delivery_status !== 'awaiting_fulfillment') throw fail(409, 'Invalid delivery transition');
  await db.query("UPDATE transaction_allocations SET delivery_status='ready' WHERE allocation_id=$1", [aid]);
  await audit(db, t, farmer, 'ready_for_delivery', aid);
  return { delivery_status: 'ready' };
});
const issueQr = async (id, aid, farmer) => atomic(async db => {
  await role(db, farmer, 'farmer');
  const t = await parent(db, id), a = await allocation(db, t, aid);
  if (a.farmer_id !== farmer) throw fail(404, 'Order not found');
  funded(t);
  if (a.delivery_status !== 'ready' || a.settlement_status !== 'held' || ['open', 'under_review'].includes(a.dispute_status)) throw fail(409, 'Allocation is not ready for verification');
  await revoke(db, aid);
  const token = qrToken.generate();
  const row = (await db.query(`INSERT INTO delivery_verifications(allocation_id,token_hash,expires_at)
    VALUES($1,$2,now()+interval '15 minutes') RETURNING expires_at`, [aid, hash(token)])).rows[0];
  await audit(db, t, farmer, 'delivery_qr_issued', aid);
  return { qr_token: token, allocation_id: aid, transaction_id: id, expires_at: row.expires_at };
});
const verifyQr = async (id, aid, buyer, input) => atomic(async db => {
  await role(db, buyer, 'buyer');
  const t = await parent(db, id), a = await allocation(db, t, aid);
  if (t.buyer_id !== buyer) throw fail(404, 'Checkout not found');
  funded(t);
  if (input.confirm_delivery !== true) throw fail(400, 'Explicit quantity and quality delivery confirmation required');
  if (typeof input.qr_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.qr_token)) throw fail(400, 'Invalid QR token');
  if (['open', 'under_review'].includes(a.dispute_status)) throw qrConflict('DELIVERY_DISPUTED', 'This allocation has an unresolved dispute. Delivery verification is blocked until the dispute is resolved.');
  if (a.delivery_status === 'delivered') throw qrConflict('DELIVERY_ALREADY_CONFIRMED', 'Delivery was already confirmed for this allocation. Return to the order to view its delivery and settlement status.');
  if (a.delivery_status !== 'ready' || a.settlement_status !== 'held') throw qrConflict('DELIVERY_NOT_READY', 'This allocation is not ready for delivery verification. Refresh the order and ask the farmer to mark the delivery ready.');
  // Diagnose the token using the database clock, while retaining the atomic
  // single-use UPDATE below. Do not expose token hashes in errors or responses.
  const token = (await db.query(`SELECT verification_id,expires_at<=now() AS expired,consumed_at,revoked_at
    FROM delivery_verifications WHERE allocation_id=$1 AND token_hash=$2 FOR UPDATE`, [aid, hash(input.qr_token)])).rows[0];
  if (!token) throw qrConflict('DELIVERY_QR_INVALID', 'This QR code does not match the delivery. Open the correct order and scan the farmer\'s latest delivery QR.');
  if (token.consumed_at) throw qrConflict('DELIVERY_QR_USED', 'This delivery QR was already used. Return to the order and refresh its delivery status.');
  if (token.revoked_at) throw qrConflict('DELIVERY_QR_REPLACED', 'The farmer generated a newer delivery QR. Scan the latest code; the previous code is no longer valid.');
  if (token.expired) throw qrConflict('DELIVERY_QR_EXPIRED', 'This delivery QR has expired. Ask the farmer to generate a new QR from this order, then scan the new code. No delivery or settlement was recorded.');
  const v = (await db.query(`UPDATE delivery_verifications SET consumed_at=now(),verified_by=$3
    WHERE allocation_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING verification_id`, [aid, hash(input.qr_token), buyer])).rows[0];
  if (!v) throw qrConflict('DELIVERY_QR_INVALID', 'This delivery QR is no longer valid. Refresh the order and ask the farmer for a new QR code.');
  await inventory(db, t, a, true);
  await db.query("UPDATE transaction_allocations SET delivery_status='delivered',delivered_at=now(),delivered_by=$2 WHERE allocation_id=$1", [aid, buyer]);
  await audit(db, t, buyer, 'delivery_confirmed', aid, { verification_id: v.verification_id });
  return { delivery_status: 'delivered', simulated: true, traceability: a.traceability, message: 'Delivery confirmed. Simulated funds remain held until settlement.' };
});
const settleOne = async (db, t, a, actor) => {
  if (a.settlement_status === 'settled') return { settlement_status: 'settled', simulated: true };
  funded(t);
  if (a.delivery_status !== 'delivered' || a.settlement_status !== 'held' || ['open', 'under_review'].includes(a.dispute_status)) throw fail(409, 'Confirmed undisputed delivery required');
  const b = await balances(db, a.allocation_id);
  if (b.held <= 0n || b.settled > 0n) throw fail(409, 'No simulated funds available');
  await ledger(db, a, actor, 'settlement', b.held, 'settlement');
  await db.query("UPDATE transaction_allocations SET settlement_status='settled' WHERE allocation_id=$1", [a.allocation_id]);
  await audit(db, t, actor, 'simulated_settlement', a.allocation_id, { amount: money.formatMinor(b.held), no_real_funds: true });
  await progress(db, t);
  return { settlement_status: 'settled', simulated: true };
};
const settle = async (id, aid, actor) => atomic(async db => {
  const t = await parent(db, id), a = await allocation(db, t, aid);
  if (t.buyer_id !== actor && a.farmer_id !== actor) throw fail(404, 'Allocation not found');
  return settleOne(db, t, a, actor);
});
const dispute = async (id, aid, buyer, input) => atomic(async db => {
  await role(db, buyer, 'buyer');
  const t = await parent(db, id), a = await allocation(db, t, aid);
  if (t.buyer_id !== buyer) throw fail(404, 'Checkout not found');
  funded(t);
  if (a.settlement_status !== 'held') throw fail(409, 'Allocation is already financially closed');
  const reasons = ['not_delivered', 'incorrect_quantity', 'poor_quality', 'wrong_product', 'other'];
  if (!reasons.includes(input.reason) || typeof input.description !== 'string' || input.description.trim().length < 10 || input.description.length > 4000) throw fail(400, 'Valid reason and description (10–4000 characters) required');
  const evidence = input.evidence || [];
  if (!Array.isArray(evidence) || evidence.length > 5 || evidence.some(x => typeof x !== 'string' || x.length > 2048 || !/^https:\/\//.test(x))) throw fail(400, 'Evidence must contain at most five HTTPS references');
  const old = (await db.query("SELECT * FROM transaction_disputes WHERE allocation_id=$1 AND status IN ('open','under_review')", [aid])).rows[0];
  if (old) {
    if (old.reason !== input.reason || old.description !== input.description.trim() || JSON.stringify(old.evidence) !== JSON.stringify(evidence)) throw fail(409, 'An unresolved dispute already exists');
    return old;
  }
  const d = (await db.query(`INSERT INTO transaction_disputes(allocation_id,buyer_id,reason,description,evidence) VALUES($1,$2,$3,$4,$5) RETURNING *`, [aid, buyer, input.reason, input.description.trim(), JSON.stringify(evidence)])).rows[0];
  await db.query("UPDATE transaction_allocations SET dispute_status='open' WHERE allocation_id=$1", [aid]);
  await revoke(db, aid);
  await audit(db, t, buyer, 'dispute_opened', aid, { dispute_id: d.dispute_id });
  return d;
});
const resolve = async (did, admin, input) => {
  if (!uuid(did)) throw fail(400, 'Invalid dispute ID');
  return atomic(async db => {
    await role(db, admin, 'admin');
    const ref = (await db.query('SELECT a.transaction_id,a.allocation_id FROM transaction_disputes d JOIN transaction_allocations a USING(allocation_id) WHERE dispute_id=$1', [did])).rows[0];
    if (!ref) throw fail(404, 'Dispute not found');
    const t = await parent(db, ref.transaction_id), a = await allocation(db, t, ref.allocation_id);
    const d = (await db.query('SELECT * FROM transaction_disputes WHERE dispute_id=$1 FOR UPDATE', [did])).rows[0];
    if (!['review', 'reject', 'refund', 'settle'].includes(input.decision) || typeof input.note !== 'string' || input.note.trim().length < 10 || input.note.length > 4000) throw fail(400, 'Decision and explanatory note required');
    if (['resolved', 'rejected'].includes(d.status)) {
      if (d.decision !== input.decision || d.resolution_note !== input.note.trim()) throw fail(409, 'Dispute already resolved with another decision');
      return d;
    }
    funded(t);
    if (input.decision === 'review') {
      await db.query("UPDATE transaction_disputes SET status='under_review' WHERE dispute_id=$1", [did]);
      await db.query("UPDATE transaction_allocations SET dispute_status='under_review' WHERE allocation_id=$1", [a.allocation_id]);
    } else {
      const status = input.decision === 'reject' ? 'rejected' : 'resolved';
      await db.query('UPDATE transaction_allocations SET dispute_status=$2 WHERE allocation_id=$1', [a.allocation_id, status]);
      a.dispute_status = status;
      if (input.decision === 'refund') {
        // An omitted amount means full remaining balance; partial refunds keep
        // the entire physical reservation until delivery/full financial refund.
        let cents = (await balances(db, a.allocation_id)).held;
        if (input.amount != null) {
          money.positiveDecimal(input.amount);
          cents = money.lineMinor(1, input.amount);
          if (!money.sameDecimal(input.amount, money.formatMinor(cents))) throw fail(400, 'Refund must use exact cents');
        }
        await refund(db, t, a, admin, cents, `dispute:${did}`);
        await progress(db, t);
      } else if (input.decision === 'settle') await settleOne(db, t, a, admin);
      await db.query('UPDATE transaction_disputes SET status=$2,decision=$3,resolution_note=$4,resolved_by=$5,resolved_at=now() WHERE dispute_id=$1', [did, status, input.decision, input.note.trim(), admin]);
    }
    await audit(db, t, admin, 'dispute_decision', a.allocation_id, { dispute_id: did, decision: input.decision, note: input.note.trim() });
    return (await db.query('SELECT * FROM transaction_disputes WHERE dispute_id=$1', [did])).rows[0];
  });
};

const details = async (id, actor, admin = false) => {
  if (!uuid(id)) throw fail(400, 'Invalid transaction ID');
  // A repeatable-read snapshot keeps derived balances and statuses consistent.
  return atomic(async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    if (admin) await role(db, actor, 'admin');
    const t = (await db.query('SELECT * FROM transactions WHERE transaction_id=$1', [id])).rows[0];
    if (!t) throw fail(404, 'Transaction not found');
    const all = (await db.query('SELECT a.*,u.full_name AS farmer_name FROM transaction_allocations a JOIN users u ON u.user_id=a.farmer_id WHERE transaction_id=$1 ORDER BY listing_id', [id])).rows;
    const owner = t.buyer_id === actor || admin;
    if (!owner && !all.some(a => a.farmer_id === actor) && t.farmer_id !== actor) throw fail(404, 'Transaction not found');
    const visible = owner ? all : all.filter(a => a.farmer_id === actor);
    const totals = { paid: 0n, held: 0n, settled: 0n, refunded: 0n, disputed: 0n, available_for_settlement: 0n };
    for (const a of visible) {
      const b = await balances(db, a.allocation_id);
      const blocked = ['open', 'under_review'].includes(a.dispute_status);
      const extended = { ...b, disputed: blocked ? b.held : 0n, available_for_settlement: !blocked && a.delivery_status === 'delivered' ? b.held : 0n };
      a.balances = Object.fromEntries(Object.entries(extended).map(([k, n]) => [k, money.formatMinor(n)]));
      a.amount = money.formatMinor(BigInt(a.amount_minor));
      a.refund_status = b.refunded === 0n ? 'none' : b.refunded === BigInt(a.amount_minor) ? 'full' : 'partial';
      for (const k of Object.keys(totals)) totals[k] += extended[k];
      a.disputes = (await db.query('SELECT * FROM transaction_disputes WHERE allocation_id=$1 ORDER BY created_at', [a.allocation_id])).rows;
      a.delivery_verifications = (await db.query('SELECT verification_id,expires_at,consumed_at,revoked_at,verified_by FROM delivery_verifications WHERE allocation_id=$1 ORDER BY created_at', [a.allocation_id])).rows;
      a.ledger = (await db.query('SELECT event_id,event_type,amount_minor,currency,created_at FROM simulated_escrow_ledger WHERE allocation_id=$1 ORDER BY created_at', [a.allocation_id])).rows.map(e => ({ ...e, amount: money.formatMinor(BigInt(e.amount_minor)), simulated: true }));
    }
    const history = (await db.query(`SELECT * FROM transaction_audit WHERE transaction_id=$1 AND
      ($2::boolean OR allocation_id=ANY($3::uuid[])) ORDER BY created_at,audit_id`, [id, owner, visible.map(a => a.allocation_id)])).rows;
    delete t.qr_token;
    if (!owner) { delete t.total_minor; delete t.amount; delete t.request_fingerprint; }
    return { ...t, is_buyer: t.buyer_id === actor, simulated: t.simulation_version === 'v1', allocations: visible,
      balances: Object.fromEntries(Object.entries(totals).map(([k, n]) => [k, money.formatMinor(n)])), history };
  });
};
const list = async (actor, admin = false) => {
  if (admin) await role(pool, actor, 'admin');
  await require('./transaction.service').recoverCheckouts();
  const rows = (await pool.query(`SELECT t.transaction_id FROM transactions t WHERE $2::boolean OR buyer_id=$1 OR farmer_id=$1
    OR EXISTS(SELECT 1 FROM transaction_allocations a WHERE a.transaction_id=t.transaction_id AND a.farmer_id=$1)
    ORDER BY t.created_at DESC LIMIT 100`, [actor, admin])).rows;
  return Promise.all(rows.map(t => details(t.transaction_id, actor, admin)));
};
module.exports = { create, pay, cancel, ready, issueQr, verifyQr, settle, dispute, resolve, details, list, enabled, hash };
