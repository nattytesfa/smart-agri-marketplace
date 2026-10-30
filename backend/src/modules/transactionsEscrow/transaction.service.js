const pool = require('../../config/db');
const { randomUUID, createHash } = require('crypto');
const money = require('../../utils/money');
const fail = (status,message) => Object.assign(new Error(message),{status});
const withTransaction = async action => {
  const db=await pool.connect();
  try {await db.query('BEGIN');const result=await action(db);await db.query('COMMIT');return result;}
  catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
};
const pendingTimeoutSeconds = () => {
  const seconds=Number(process.env.PENDING_PAYMENT_TIMEOUT_SECONDS || 1800);
  if (!Number.isInteger(seconds) || seconds<1 || seconds>604800) throw fail(503,'Invalid pending-payment timeout configuration');
  return seconds;
};
const recoverCheckouts = async () => (await pool.query('SELECT public.recover_expired_checkouts() AS recovered')).rows[0].recovered;

// Create a new transaction with escrow locked
const createTransaction = async (data) => {
  let {
    listing_id,
    batch_id,
    buyer_id,
    farmer_id,
    amount,
    payment_method,
  } = data;

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (listing_id && batch_id) throw Object.assign(new Error('Choose a listing or a batch, not both'), { status: 400 });
    if (listing_id) {
      const l = (await db.query('SELECT * FROM produce_listings WHERE listing_id=$1 FOR UPDATE', [listing_id])).rows[0];
      if (!l || l.deleted_at || l.status !== 'available' || l.farmer_id === buyer_id) throw Object.assign(new Error('Listing is no longer available'), { status: 409 });
      if ((await db.query("SELECT 1 FROM debo_batch_listings WHERE listing_id=$1 AND reservation_status IN ('active','fulfilled')",[listing_id])).rowCount) throw Object.assign(new Error('Listing has Digital Debo commitments. Use the aggregation workflow.'),{status:409});
      farmer_id = l.farmer_id;
      amount = money.formatMinor(money.lineMinor(l.quantity,l.price_per_unit));
      await db.query("UPDATE produce_listings SET status='reserved',version=version+1,updated_at=now() WHERE listing_id=$1", [listing_id]);
    } else if (batch_id) {
      const batch = (await db.query('SELECT * FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE', [batch_id])).rows[0];
      const existing = await db.query('SELECT 1 FROM transactions WHERE batch_id=$1', [batch_id]);
      const members = (await db.query(`SELECT l.*,d.confirmed_quantity,d.unit_price,round(d.confirmed_quantity*d.unit_price,2) AS subtotal FROM produce_listings l JOIN debo_batch_listings d ON d.listing_id=l.listing_id
        WHERE d.batch_id=$1 AND d.reservation_status='active' ORDER BY l.listing_id FOR UPDATE OF l`, [batch_id])).rows;
      if (!batch || batch.status!=='filled' || !batch.criteria || new Date(batch.expires_at)<=new Date() || batch.target_buyer_id !== buyer_id || existing.rows.length || !members.length || members.some(l => l.deleted_at || l.status !== 'available' || !money.sameDecimal(l.price_per_unit,l.unit_price))) {
        throw Object.assign(new Error('Batch unavailable or already paid'), { status: 409 });
      }
      const full=(await db.query(`SELECT coalesce(sum(confirmed_quantity*conversion_factor),0)>=$2::numeric AS full
        FROM debo_batch_listings WHERE batch_id=$1 AND reservation_status='active'`,[batch_id,batch.total_quantity])).rows[0].full;
      if (!full) throw Object.assign(new Error('Batch reservations no longer meet the target'),{status:409});
      if (new Set(members.map(l=>l.farmer_id)).size>1) throw Object.assign(new Error('Batch is ready for transaction review. Multi-farmer payout is not supported by the current single-payee escrow integration.'),{status:409});
      amount = money.sumMoney(members.map(l=>l.subtotal));
      farmer_id = members[0].farmer_id;
    }

  const cents=money.lineMinor(1,amount);
  if (cents<1n || cents>999999999999n) throw fail(400,'Transaction amount must be between ETB 0.01 and 9999999999.99');
  const query = `
    INSERT INTO transactions (
      listing_id, batch_id, buyer_id, farmer_id, 
      amount, escrow_status, payment_method, transaction_hash,
      payment_status,payment_mode,checkout_status,checkout_expires_at,pricing_policy
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,'pending','prototype','pending',now()+($9::integer*interval '1 second'),$10)
    RETURNING transaction_id, created_at,checkout_expires_at,payment_status,payment_mode,checkout_status
  `;

  const transactionHash = `PROTOTYPE_${randomUUID()}`;

  const values = [
    listing_id || null,
    batch_id || null,
    buyer_id,
    farmer_id,
    amount,
    'locked',
    payment_method,
    transactionHash,
    pendingTimeoutSeconds(),
    money.policy,
  ];

  const result = await db.query(query, values);
  await db.query('COMMIT');
  return { ...result.rows[0], amount };
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};

// Update transaction after successful payment
const confirmPayment = async () => {throw fail(503,'Verified payment processing is not configured');};

// Update escrow status
const updateEscrowStatus = async (transactionId, status) => {
  if (!['released','refunded'].includes(status)) throw fail(400,'Invalid settlement state');
  return settleBatch(transactionId,status);
};

// Trusted settlement only; never mark the whole listing sold for a partial lot.
const settleBatch = async (id,status) => {
  return withTransaction(async db => {
    const t=(await db.query('SELECT * FROM transactions WHERE transaction_id=$1 FOR UPDATE',[id])).rows[0];
    if (!t || t.escrow_status!=='locked') return null;
    if (['expired','cancelled'].includes(t.checkout_status)) throw fail(409,'Checkout is closed; payment requires reconciliation');
    if (status==='released' && t.payment_status!=='confirmed') throw fail(409,'Payment has not been verified; simulated payment cannot release escrow');
    if (status==='refunded' && !(t.payment_status==='unpaid' || (t.payment_mode==='prototype' && t.payment_status==='pending' && t.checkout_status==='pending'))) throw fail(409,'Payment must be reliably reconciled before reservations can be released');
    await changeInventory(db,t,status==='released');
    await db.query(`UPDATE transactions SET escrow_status=$2::escrow_status,
      checkout_status=$3,payment_status=CASE WHEN $2::text='refunded' THEN 'unpaid' ELSE payment_status END,
      reconciled_at=now(),released_at=CASE WHEN $2::text='released' THEN now() ELSE released_at END WHERE transaction_id=$1`,[id,status,status==='released'?'completed':'cancelled']);
    return {transaction_id:id};
  });
};

const changeInventory = async (db,t,fulfilled) => {
  if (t.batch_id) {
    await db.query('SELECT batch_id FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE',[t.batch_id]);
    await db.query('SELECT l.listing_id FROM produce_listings l JOIN debo_batch_listings d ON d.listing_id=l.listing_id WHERE d.batch_id=$1 ORDER BY l.listing_id FOR UPDATE OF l',[t.batch_id]);
    if (!fulfilled && (await db.query("SELECT 1 FROM debo_batch_listings WHERE batch_id=$1 AND reservation_status='fulfilled'",[t.batch_id])).rowCount) throw fail(409,'Fulfilled stock cannot be released');
    await db.query("UPDATE debo_batch_listings SET reservation_status=$2 WHERE batch_id=$1 AND reservation_status='active'",[t.batch_id,fulfilled?'fulfilled':'released']);
    await db.query('UPDATE digital_debo_batches SET status=$2,updated_at=now() WHERE batch_id=$1',[t.batch_id,fulfilled?'fulfilled':'cancelled']);
    // Zero available can mean OTHER batches still reserve the stock. Sold means
    // all total stock is fulfilled, with no active commitments remaining.
    await db.query(`UPDATE produce_listings l SET status=CASE WHEN
      coalesce((SELECT sum(d.confirmed_quantity) FROM debo_batch_listings d WHERE d.listing_id=l.listing_id AND d.reservation_status='fulfilled'),0)>=l.quantity
      AND NOT EXISTS(SELECT 1 FROM debo_batch_listings d WHERE d.listing_id=l.listing_id AND d.reservation_status='active')
      THEN 'sold'::listing_status ELSE l.status END,version=version+1,updated_at=now()
      WHERE EXISTS(SELECT 1 FROM debo_batch_listings d WHERE d.listing_id=l.listing_id AND d.batch_id=$1)`,[t.batch_id]);
  } else {
    await db.query('SELECT listing_id FROM produce_listings WHERE listing_id=$1 FOR UPDATE',[t.listing_id]);
    await db.query('UPDATE produce_listings SET status=$2::listing_status,version=version+1,updated_at=now() WHERE listing_id=$1',[t.listing_id,fulfilled?'sold':'available']);
  }
};

const cancelCheckout = async (id,buyerId) => {
  const result=await withTransaction(async db => {
    const t=(await db.query('SELECT * FROM transactions WHERE transaction_id=$1 FOR UPDATE',[id])).rows[0];
    if (!t || t.buyer_id!==buyerId) throw fail(404,'Checkout not found');
    if (['expired','cancelled'].includes(t.checkout_status)) return {transaction_id:id,checkout_status:t.checkout_status};
    if (t.payment_status==='confirmed' || t.escrow_status!=='locked') throw fail(409,'Confirmed or fulfilled checkout cannot be cancelled');
    if (t.payment_mode!=='prototype' || t.checkout_status==='reconciliation_required') {
      await db.query("UPDATE transactions SET checkout_status='reconciliation_required',reconciliation_reason='Cancellation requested; external payment outcome unknown',reconciled_at=now() WHERE transaction_id=$1",[id]);
      return {blocked:true};
    }
    await changeInventory(db,t,false);
    await db.query("UPDATE transactions SET checkout_status='cancelled',payment_status='unpaid',escrow_status='refunded',reconciled_at=now(),reconciliation_reason='Prototype cancellation; no external payment attempt' WHERE transaction_id=$1",[id]);
    return {transaction_id:id,checkout_status:'cancelled'};
  });
  if (result.blocked) throw fail(409,'Payment outcome is unresolved; reservations retained for reconciliation');
  return result;
};

const recordUnverifiedNotification = async (id,input) => withTransaction(async db => {
  const t=(await db.query('SELECT * FROM transactions WHERE transaction_id=$1 FOR UPDATE',[id])).rows[0];
  if (!t) throw fail(404,'Transaction not found');
  const status=String(input.status || 'unknown').slice(0,60), reference=String(input.reference || '').slice(0,160);
  const fingerprint=createHash('sha256').update(JSON.stringify({status,reference})).digest('hex');
  await db.query(`INSERT INTO payment_notifications(transaction_id,fingerprint,claimed_status,provider_reference)
    VALUES($1,$2,$3,$4) ON CONFLICT(transaction_id,fingerprint) DO NOTHING`,[id,fingerprint,status,reference]);
  // No callback is trusted in this prototype. Even late "success" must never
  // resurrect expired reservations. Ambiguous external claims remain visible.
  if (t.payment_mode!=='prototype' && t.payment_status!=='confirmed' && t.checkout_status!=='completed') {
    await db.query("UPDATE transactions SET checkout_status='reconciliation_required',reconciliation_reason='Unverified payment notification; external verification unavailable',reconciled_at=now() WHERE transaction_id=$1",[id]);
  }
  return {verified:false,simulated:t.payment_mode==='prototype'};
});

// Get transaction by ID
const getTransaction = async (transactionId) => {
  await recoverCheckouts();
  const query = `
    SELECT t.*, 
           u.phone_number as buyer_phone,
           f.phone_number as farmer_phone,
           l.crop_type,
           l.quantity,
           b.total_quantity as batch_total
    FROM transactions t
    JOIN users u ON t.buyer_id = u.user_id
    JOIN users f ON t.farmer_id = f.user_id
    LEFT JOIN produce_listings l ON t.listing_id = l.listing_id
    LEFT JOIN digital_debo_batches b ON t.batch_id = b.batch_id
    WHERE t.transaction_id = $1
  `;
  const result = await pool.query(query, [transactionId]);
  return result.rows[0] || null;
};

// Get transactions for a user (buyer or farmer)
const getUserTransactions = async (userId, role) => {
  await recoverCheckouts();
  const column = role === 'buyer' ? 'buyer_id' : 'farmer_id';
  const query = `
    SELECT t.transaction_id, t.amount, t.escrow_status, 
            t.payment_method, t.created_at, t.released_at,t.checkout_status,t.checkout_expires_at,t.payment_status,t.payment_mode,t.reconciliation_reason,
           l.crop_type,
           u.phone_number as other_party_phone
    FROM transactions t
    LEFT JOIN produce_listings l ON t.listing_id = l.listing_id
    JOIN users u ON t.${column === 'buyer_id' ? 'farmer_id' : 'buyer_id'} = u.user_id
    WHERE t.${column} = $1
    ORDER BY t.created_at DESC
  `;
  const result = await pool.query(query, [userId]);
  return result.rows;
};

// Generate QR token for a transaction
const generateQrToken = async (transactionId) => {
  const token = `QR_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const query = `
    UPDATE transactions 
    SET qr_token = $2
    WHERE transaction_id = $1
    RETURNING qr_token
  `;
  const result = await pool.query(query, [transactionId, token]);
  return result.rows[0]?.qr_token || null;
};

// Release escrow funds (called after QR scan)
const releaseEscrow = async (transactionId) => {
  return updateEscrowStatus(transactionId, 'released');
};

module.exports = {
  createTransaction,
  confirmPayment,
  updateEscrowStatus,
  getTransaction,
  getUserTransactions,
  generateQrToken,
  releaseEscrow,
  recoverCheckouts,
  cancelCheckout,
  recordUnverifiedNotification,
  pendingTimeoutSeconds,
};
