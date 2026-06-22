const pool = require('../../config/db');

// Get all users with pending verification
const getPendingUsers = async () => {
  const query = `
    SELECT u.user_id, u.phone_number, u.fayda_id, u.role, u.created_at,
           fp.farm_size_hectares, fp.storage_type,
           bp.business_name, bp.buyer_type
    FROM users u
    LEFT JOIN farmer_profiles fp ON u.user_id = fp.farmer_id
    LEFT JOIN buyer_profiles bp ON u.user_id = bp.buyer_id
    WHERE u.fayda_verified = false
    ORDER BY u.created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

// Verify a user
const verifyUser = async (userId) => {
  const query = `
    UPDATE users 
    SET fayda_verified = true 
    WHERE user_id = $1
    RETURNING user_id
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0];
};

// Get all listings for moderation
const getAllListings = async () => {
  const query = `
    SELECT l.listing_id, l.crop_type, l.variety, l.quantity, 
           l.price_per_unit, l.status, l.created_at,
           u.phone_number as farmer_phone,
           fp.social_trust_score
    FROM produce_listings l
    JOIN users u ON l.farmer_id = u.user_id
    LEFT JOIN farmer_profiles fp ON l.farmer_id = fp.farmer_id
    ORDER BY l.created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

// Delete a listing (admin only)
const deleteListing = async (listingId) => {
  const query = `DELETE FROM produce_listings WHERE listing_id = $1 RETURNING listing_id`;
  const result = await pool.query(query, [listingId]);
  return result.rows[0];
};

// Get all transactions for monitoring
const getAllTransactions = async () => {
  const query = `
    SELECT t.transaction_id, t.amount, t.escrow_status, 
           t.payment_method, t.created_at, t.released_at,
           t.transaction_hash,
           u1.phone_number as buyer_phone,
           u2.phone_number as farmer_phone,
           l.crop_type
    FROM transactions t
    JOIN users u1 ON t.buyer_id = u1.user_id
    JOIN users u2 ON t.farmer_id = u2.user_id
    LEFT JOIN produce_listings l ON t.listing_id = l.listing_id
    ORDER BY t.created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

// Resolve a dispute (update escrow status)
const resolveDispute = async (transactionId, status) => {
  const query = `
    UPDATE transactions 
    SET escrow_status = $2
    WHERE transaction_id = $1
    RETURNING transaction_id
  `;
  const result = await pool.query(query, [transactionId, status]);
  return result.rows[0];
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
    FROM produce_listings l
    WHERE l.status = 'available'
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
    // Region filter: assumes region is stored in farmer_profiles
    // For simplicity, we'll use a bounding box or region name
    // This is a simplified version - in production you'd have region data
    query += ` AND ST_DWithin(l.location_gps, ST_SetSRID(ST_MakePoint(38.742, 9.032), 4326), 50000)`;
  }

  query += ` 
    GROUP BY l.crop_type
    ORDER BY total_quantity DESC
  `;

  const result = await pool.query(query, values);
  return result.rows;
};

module.exports = {
  getPendingUsers,
  verifyUser,
  getAllListings,
  deleteListing,
  getAllTransactions,
  resolveDispute,
  getHeatmapData,
};