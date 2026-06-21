const pool = require('../../config/db');
const {
  findNearbyClusters,
  groupIntoClusters,
  summarizeCluster,
} = require('./clustering.util');

const createBatch = async (buyerId, clusterSummary, cropType) => {
  const query = `
    INSERT INTO digital_debo_batches (
      target_buyer_id,
      status,
      total_quantity,
      crop_type
    ) VALUES ($1, $2, $3, $4)
    RETURNING batch_id
  `;

  const result = await pool.query(query, [
    buyerId,
    'pending',
    clusterSummary.total_quantity,
    cropType,
  ]);

  return result.rows[0].batch_id;
};

const linkListingsToBatch = async (batchId, listingIds) => {
  const values = listingIds.map(id => `('${batchId}', '${id}')`).join(',');
  const query = `
    INSERT INTO debo_batch_listings (batch_id, listing_id)
    VALUES ${values}
  `;

  await pool.query(query);
};

const getBatchDetails = async (batchId) => {
  const query = `
    SELECT 
      b.batch_id,
      b.target_buyer_id,
      b.status,
      b.total_quantity,
      b.created_at,
      json_agg(json_build_object(
        'listing_id', l.listing_id,
        'crop_type', l.crop_type,
        'quantity', l.quantity,
        'price_per_unit', l.price_per_unit,
        'farmer_id', l.farmer_id,
        'trust_score', fp.social_trust_score
      )) as listings
    FROM digital_debo_batches b
    JOIN debo_batch_listings dbl ON b.batch_id = dbl.batch_id
    JOIN produce_listings l ON dbl.listing_id = l.listing_id
    JOIN farmer_profiles fp ON l.farmer_id = fp.farmer_id
    WHERE b.batch_id = $1
    GROUP BY b.batch_id
  `;

  const result = await pool.query(query, [batchId]);
  return result.rows[0] || null;
};

module.exports = {
  createBatch,
  linkListingsToBatch,
  getBatchDetails,
};