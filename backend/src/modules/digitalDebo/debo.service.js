const pool = require('../../config/db');
const {
  findNearbyClusters,
  groupIntoClusters,
  summarizeCluster,
} = require('./clustering.util');

const createBatch = async (buyerId, listingIds, cropType) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const ids = [...new Set(listingIds)].sort();
    const { rows } = await db.query('SELECT * FROM produce_listings WHERE listing_id=ANY($1::uuid[]) ORDER BY listing_id FOR UPDATE', [ids]);
    if (rows.length !== ids.length || !rows.length || rows.some(l => l.deleted_at || l.status !== 'available' || l.crop_type.toLowerCase() !== String(cropType).toLowerCase() || l.unit !== rows[0].unit)) {
      throw Object.assign(new Error('Selected listings changed or have incompatible crops/units. Search again.'), { status: 409 });
    }
    const total = rows.reduce((sum,l) => sum + Number(l.quantity), 0);
    const result = await db.query(`INSERT INTO digital_debo_batches(target_buyer_id,status,total_quantity,crop_type)
      VALUES($1,'pending',$2,$3) RETURNING batch_id`, [buyerId,total,cropType]);
    const id = result.rows[0].batch_id;
    await db.query('INSERT INTO debo_batch_listings(batch_id,listing_id) SELECT $1,unnest($2::uuid[])', [id,ids]);
    await db.query("UPDATE produce_listings SET status='reserved',version=version+1,updated_at=now() WHERE listing_id=ANY($1::uuid[])", [ids]);
    await db.query('COMMIT');
    return { batch_id: id, total_quantity: total };
  } catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};

const linkListingsToBatch = async (batchId, listingIds) => {
  await pool.query('INSERT INTO debo_batch_listings(batch_id,listing_id) SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING', [batchId,listingIds]);
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
