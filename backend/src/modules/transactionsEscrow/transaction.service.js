const pool = require('../../config/db');

// Create a new transaction with escrow locked
const createTransaction = async (data) => {
  const {
    listing_id,
    batch_id,
    buyer_id,
    farmer_id,
    amount,
    payment_method,
  } = data;

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

  const result = await pool.query(query, values);
  return result.rows[0];
};

// Update transaction after successful payment
const confirmPayment = async (transactionId, transactionHash) => {
  const query = `
    UPDATE transactions 
    SET escrow_status = 'locked', 
        transaction_hash = $2
    WHERE transaction_id = $1
    RETURNING transaction_id
  `;
  const result = await pool.query(query, [transactionId, transactionHash]);
  return result.rows[0];
};

// Update escrow status
const updateEscrowStatus = async (transactionId, status) => {
  const query = `
    UPDATE transactions 
    SET escrow_status = $2
    WHERE transaction_id = $1
    RETURNING transaction_id
  `;
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
  const query = `
    UPDATE transactions 
    SET escrow_status = 'released', 
        released_at = NOW()
    WHERE transaction_id = $1
    RETURNING transaction_id
  `;
  const result = await pool.query(query, [transactionId]);
  return result.rows[0];
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