const pool = require('../../config/db');

// Get all users with pending verification
const getPendingUsers = async (status = 'pending') => {
  const query = `
    SELECT u.user_id, u.phone_number, u.fayda_id, u.fayda_verified,
           u.fayda_verified_at, u.role, u.created_at,
           fp.farm_size_hectares, fp.storage_type,
           bp.business_name, bp.buyer_type
    FROM users u
    LEFT JOIN farmer_profiles fp ON u.user_id = fp.farmer_id
    LEFT JOIN buyer_profiles bp ON u.user_id = bp.buyer_id
    WHERE ($1::boolean IS NULL OR u.fayda_verified = $1)
    ORDER BY u.created_at DESC
  `;
  const result = await pool.query(query, [status === 'all' ? null : status === 'verified']);
  return result.rows;
};

const getUser = async (userId) => {
  const result = await pool.query(`
    SELECT u.user_id, u.phone_number, u.fayda_id, u.fayda_verified,
           u.fayda_verified_at, u.role, u.created_at,
           fp.farm_size_hectares, fp.storage_type,
           bp.business_name, bp.buyer_type
    FROM users u
    LEFT JOIN farmer_profiles fp ON u.user_id = fp.farmer_id
    LEFT JOIN buyer_profiles bp ON u.user_id = bp.buyer_id
    WHERE u.user_id = $1`, [userId]);
  return result.rows[0] || null;
};

// Get all listings for moderation
const getAllListings = async () => {
  const result = await pool.query(`SELECT l.*,ST_Y(l.location_gps) AS lat,ST_X(l.location_gps) AS lng,
    u.full_name AS farmer_name,u.phone_number AS farmer_phone,fp.social_trust_score
    FROM produce_listings l JOIN users u ON u.user_id=l.farmer_id
    LEFT JOIN farmer_profiles fp ON fp.farmer_id=l.farmer_id
    WHERE l.deleted_at IS NULL ORDER BY l.created_at DESC`);
  return result.rows;
};

// Delete a listing (admin only)
const deleteListing = async (listingId) => {
  return require('../listings/listing.service').deleteListing(listingId, null, null, true);
};

// Get all transactions for monitoring
const getAllTransactions = async () => {
  await require('../transactionsEscrow/transaction.service').recoverCheckouts();
  const query = `
    SELECT t.transaction_id, t.amount, t.escrow_status, 
            t.payment_method, t.created_at, t.released_at,t.payment_status,t.payment_mode,t.checkout_status,t.checkout_expires_at,t.reconciliation_reason,
           t.transaction_hash,
           u1.phone_number as buyer_phone,
           u2.phone_number as farmer_phone,
           coalesce(l.crop_type,b.crop_type) AS crop_type,
           ARRAY(SELECT DISTINCT a.delivery_status FROM transaction_allocations a WHERE a.transaction_id=t.transaction_id) AS delivery_statuses,
           EXISTS(SELECT 1 FROM transaction_allocations a WHERE a.transaction_id=t.transaction_id AND a.dispute_status IN ('open','under_review')) AS has_dispute
    FROM transactions t
    JOIN users u1 ON t.buyer_id = u1.user_id
    LEFT JOIN users u2 ON t.farmer_id = u2.user_id
    LEFT JOIN produce_listings l ON t.listing_id = l.listing_id
    LEFT JOIN digital_debo_batches b ON t.batch_id=b.batch_id
    ORDER BY t.created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

// Resolve a dispute (update escrow status)
const resolveDispute = async (transactionId, status) => {
  return require('../transactionsEscrow/transaction.service').updateEscrowStatus(transactionId, status);
};

const getTransactionSummary = async () => {
  await require('../transactionsEscrow/transaction.service').recoverCheckouts();
  return (await pool.query(`SELECT round(coalesce(sum(amount),0),2)::text AS all,
    (SELECT (coalesce(sum(CASE WHEN event_type='hold' THEN amount_minor ELSE -amount_minor END),0)/100.0)::numeric(20,2)::text FROM simulated_escrow_ledger) AS locked,
    (SELECT count(*)::int FROM transaction_disputes WHERE status IN ('open','under_review')) AS disputed FROM transactions`)).rows[0];
};

// Get heatmap data (PostGIS aggregation)
const getHeatmapData = async (region, cropType) => {
  let query = `
    SELECT 
      ST_AsGeoJSON(ST_Centroid(ST_Collect(l.location_gps))) as geometry,
      COUNT(l.listing_id) as listing_count,
      SUM(l.quantity) as total_quantity,
      AVG(l.price_per_unit) as avg_price,
      l.crop_type
    FROM produce_listings l JOIN users u ON u.user_id=l.farmer_id
    WHERE l.status = 'available'
      AND l.deleted_at IS NULL
      AND l.location_gps IS NOT NULL
  `;
  const values = [];
  let paramCount = 1;

  if (cropType) {
    query += ` AND l.crop_type = $${paramCount}`;
    values.push(cropType);
    paramCount++;
  }

  if (region) {
    query += ` AND u.region = $${paramCount}`;
    values.push(region);
  }

  query += ` 
    GROUP BY l.crop_type
    ORDER BY total_quantity DESC
  `;

  const result = await pool.query(query, values);
  return result.rows;
};

module.exports = {
  getUser,
  getPendingUsers,
  getAllListings,
  deleteListing,
  getAllTransactions,
  resolveDispute,
  getTransactionSummary,
  getHeatmapData,
};
