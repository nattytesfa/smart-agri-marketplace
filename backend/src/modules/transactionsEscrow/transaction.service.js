const pool = require('../../config/db');

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
      farmer_id = l.farmer_id;
      amount = Number(l.quantity) * Number(l.price_per_unit);
      await db.query("UPDATE produce_listings SET status='reserved',version=version+1,updated_at=now() WHERE listing_id=$1", [listing_id]);
    } else if (batch_id) {
      const batch = (await db.query('SELECT * FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE', [batch_id])).rows[0];
      const existing = await db.query('SELECT 1 FROM transactions WHERE batch_id=$1', [batch_id]);
      const members = (await db.query(`SELECT l.* FROM produce_listings l JOIN debo_batch_listings d ON d.listing_id=l.listing_id
        WHERE d.batch_id=$1 ORDER BY l.listing_id FOR UPDATE OF l`, [batch_id])).rows;
      if (!batch || batch.target_buyer_id !== buyer_id || existing.rows.length || !members.length || members.some(l => l.deleted_at || l.status !== 'reserved')) {
        throw Object.assign(new Error('Batch unavailable or already paid'), { status: 409 });
      }
      amount = members.reduce((sum,l) => sum + Number(l.quantity) * Number(l.price_per_unit), 0);
      // Existing transaction contract has a single farmer FK for batch payments.
      farmer_id = members[0].farmer_id;
    }

  const query = `
    INSERT INTO transactions (
      listing_id, batch_id, buyer_id, farmer_id, 
      amount, escrow_status, payment_method, transaction_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING transaction_id, created_at
  `;

  const transactionHash = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const values = [
    listing_id || null,
    batch_id || null,
    buyer_id,
    farmer_id,
    amount,
    'locked',
    payment_method,
    transactionHash,
  ];

  const result = await db.query(query, values);
  await db.query('COMMIT');
  return { ...result.rows[0], amount };
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};

// Update transaction after successful payment
const confirmPayment = async (transactionId, transactionHash) => {
  const query = `
    UPDATE transactions 
    SET escrow_status = 'locked', 
        transaction_hash = $2
    WHERE transaction_id = $1 AND escrow_status='locked'
    RETURNING transaction_id
  `;
  const result = await pool.query(query, [transactionId, transactionHash]);
  return result.rows[0];
};

// Update escrow status
const updateEscrowStatus = async (transactionId, status) => {
  const query = `WITH changed AS (
    UPDATE transactions SET escrow_status=$2::escrow_status,released_at=CASE WHEN $2::text='released' THEN now() ELSE released_at END WHERE transaction_id=$1 AND escrow_status='locked'
    RETURNING transaction_id,listing_id,batch_id
  ), listings AS (
    UPDATE produce_listings SET status=CASE WHEN $2::text='released' THEN 'sold'::listing_status ELSE 'available'::listing_status END,
      version=version+1,updated_at=now()
    WHERE listing_id IN (SELECT listing_id FROM changed UNION SELECT d.listing_id FROM debo_batch_listings d JOIN changed c ON c.batch_id=d.batch_id)
    RETURNING listing_id
  ) SELECT transaction_id FROM changed`;
  const result = await pool.query(query, [transactionId, status]);
  return result.rows[0];
};

// Get transaction by ID
const getTransaction = async (transactionId) => {
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
  const column = role === 'buyer' ? 'buyer_id' : 'farmer_id';
  const query = `
    SELECT t.transaction_id, t.amount, t.escrow_status, 
           t.payment_method, t.created_at, t.released_at,
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
};
