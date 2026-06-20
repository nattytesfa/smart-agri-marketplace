const pool = require('../../config/db');

// Create a single listing (used by both single create and batch sync)
const createListing = async (listingData, farmerId) => {
  const {
    crop_type,
    variety,
    quantity,
    unit = 'quintal',
    price_per_unit,
    location_lat,
    location_lng,
    harvest_date,
    status = 'available',
    sync_status = 'cloud',
  } = listingData;

  // Build geometry point if coordinates provided
  let locationGps = null;
  if (location_lat != null && location_lng != null) {
    locationGps = `SRID=4326;POINT(${location_lng} ${location_lat})`;
  }

  const query = `
    INSERT INTO produce_listings (
      farmer_id, crop_type, variety, quantity, unit, price_per_unit,
      location_gps, status, sync_status, harvest_date
    ) VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326), $8, $9, $10)
    RETURNING listing_id, created_at
  `;

  const values = [
    farmerId,
    crop_type,
    variety || null,
    quantity,
    unit,
    price_per_unit,
    locationGps,
    status,
    sync_status,
    harvest_date || null,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

// Bulk insert for sync
const createListingsBatch = async (listings, farmerId) => {
  const results = [];
  for (const listing of listings) {
    const newListing = await createListing(listing, farmerId);
    results.push(newListing);
  }
  return results;
};

// Get listings for a farmer (with sync status)
const getFarmerListings = async (farmerId) => {
  const query = `
    SELECT listing_id, crop_type, variety, quantity, unit, price_per_unit,
           ST_X(location_gps) as lat, ST_Y(location_gps) as lng,
           status, sync_status, harvest_date, created_at
    FROM produce_listings
    WHERE farmer_id = $1
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [farmerId]);
  return result.rows;
};

// Get all available listings (for buyer search)
const getAvailableListings = async (filters = {}) => {
  let query = `
    SELECT l.listing_id, l.crop_type, l.variety, l.quantity, l.unit,
           l.price_per_unit, ST_X(l.location_gps) as lat, ST_Y(l.location_gps) as lng,
           l.status, l.harvest_date, l.created_at,
           u.phone_number as farmer_phone,
           fp.social_trust_score
    FROM produce_listings l
    JOIN users u ON l.farmer_id = u.user_id
    JOIN farmer_profiles fp ON l.farmer_id = fp.farmer_id
    WHERE l.status = 'available'
  `;
  const values = [];
  let paramCount = 1;

  if (filters.crop_type) {
    query += ` AND l.crop_type = $${paramCount}`;
    values.push(filters.crop_type);
    paramCount++;
  }

  if (filters.min_price) {
    query += ` AND l.price_per_unit >= $${paramCount}`;
    values.push(filters.min_price);
    paramCount++;
  }

  if (filters.max_price) {
    query += ` AND l.price_per_unit <= $${paramCount}`;
    values.push(filters.max_price);
    paramCount++;
  }

  if (filters.radius && filters.lat && filters.lng) {
    query += ` AND ST_DWithin(l.location_gps, ST_SetSRID(ST_MakePoint($${paramCount}, $${paramCount + 1}), 4326), $${paramCount + 2})`;
    values.push(filters.lng, filters.lat, filters.radius);
    paramCount += 3;
  }

  query += ` ORDER BY l.created_at DESC`;

  const result = await pool.query(query, values);
  return result.rows;
};

// Update listing status (e.g., sold, reserved)
const updateListingStatus = async (listingId, status) => {
  const query = `
    UPDATE produce_listings
    SET status = $1
    WHERE listing_id = $2
    RETURNING listing_id
  `;
  const result = await pool.query(query, [status, listingId]);
  return result.rows[0];
};

module.exports = {
  createListing,
  createListingsBatch,
  getFarmerListings,
  getAvailableListings,
  updateListingStatus,
};