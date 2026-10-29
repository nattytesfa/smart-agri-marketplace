const pool = require('../../config/db');
const { randomUUID } = require('crypto');
const fail = (status, message) => Object.assign(new Error(message), { status });
const columns = `l.*, l.harvest_date::text AS harvest_date, ST_Y(l.location_gps) AS lat, ST_X(l.location_gps) AS lng,
  u.full_name AS farmer_name`;
const getListing = async (id, db = pool, includeDeleted = false) => {
  const r = await db.query(`SELECT ${columns} FROM produce_listings l JOIN users u ON u.user_id=l.farmer_id
    WHERE l.listing_id=$1 ${includeDeleted ? '' : 'AND l.deleted_at IS NULL'}`, [id]);
  return r.rows[0];
};

// Conflict strategy: compare integer versions under a row lock. Never silently
// overwrite another device's changes. Replaying the same operation is a no-op.
const save = async (data, farmerId, id) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const clientId = data.client_id || randomUUID();
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${farmerId}:${id || clientId}`]);
    let existing;
    if (id) existing = (await db.query('SELECT * FROM produce_listings WHERE listing_id=$1 FOR UPDATE', [id])).rows[0];
    else existing = (await db.query('SELECT * FROM produce_listings WHERE farmer_id=$1 AND client_id=$2 FOR UPDATE', [farmerId, clientId])).rows[0];
    if (id && !existing) throw fail(404, 'Listing not found');
    if (existing && existing.farmer_id !== farmerId) throw fail(403, 'You can only modify your own listings');
    if (existing && !id) {
      if (existing.deleted_at) throw fail(409, 'Listing was removed; create a new listing instead');
      await db.query('COMMIT');
      return getListing(existing.listing_id);
    }
    if (existing && data.operation_id && data.operation_id === existing.last_operation_id) {
      await db.query('COMMIT');
      return getListing(existing.listing_id);
    }
    if (existing && (existing.deleted_at || existing.version !== data.version)) throw fail(409, 'Listing changed on the server. Refresh before editing again.');
    if (existing && existing.status !== 'available') throw fail(409, 'Reserved or sold listings cannot be edited');
    const values = [farmerId, data.crop_type, data.variety, data.quantity, data.unit || 'quintal', data.price_per_unit,
      data.location_lng ?? null, data.location_lat ?? null, data.kebele || null, data.harvest_date || null,
      data.quality_grade || null, data.description || null, data.image_url || null, data.status || 'available', clientId, data.operation_id || null];
    let result;
    if (!existing) {
      if (data.status && data.status !== 'available') throw fail(400, 'New listings must be available');
      result = await db.query(`INSERT INTO produce_listings(farmer_id,crop_type,variety,quantity,unit,price_per_unit,
        location_gps,kebele,harvest_date,quality_grade,description,image_url,status,client_id,last_operation_id,sync_status)
        VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($7,$8),4326) END,
        $9,$10,$11,$12,$13,$14,$15,$16,'cloud') RETURNING listing_id`, values);
    } else {
      values.push(id, data.version);
      result = await db.query(`UPDATE produce_listings SET crop_type=$2,variety=$3,quantity=$4,unit=$5,price_per_unit=$6,
        location_gps=CASE WHEN $7::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($7,$8),4326) END,
        kebele=$9,harvest_date=$10,quality_grade=$11,description=$12,image_url=$13,status=$14,client_id=coalesce(client_id,$15::uuid),last_operation_id=$16,
        version=version+1,updated_at=now() WHERE listing_id=$17 AND farmer_id=$1 AND version=$18 RETURNING listing_id`, values);
    }
    await db.query('COMMIT');
    return getListing(result.rows[0].listing_id);
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};
const createListing = (data, farmerId) => save(data, farmerId);
const updateListing = (id, data, farmerId) => save(data, farmerId, id);
const createListingsBatch = async (listings, farmerId) => {
  const synced = [], failed = [];
  for (const data of listings) {
    try { synced.push(await createListing(data, farmerId)); }
    catch (e) { failed.push({ client_id: data.client_id, status: e.status || 500, error: e.status ? e.message : 'Unable to save listing. Retry later.' }); }
  }
  return { synced, failed };
};
const getFarmerListings = async farmerId => (await pool.query(`SELECT ${columns} FROM produce_listings l
  JOIN users u ON u.user_id=l.farmer_id WHERE l.farmer_id=$1 AND l.deleted_at IS NULL ORDER BY l.created_at DESC`, [farmerId])).rows;

const getAvailableListings = async (filters = {}, admin = false) => {
  const values = [];
  const bind = value => { values.push(value); return `$${values.length}`; };
  let distance = 'NULL::double precision';
  if (filters.lat != null && filters.lng != null) distance = `ST_Distance(l.location_gps::geography,ST_SetSRID(ST_MakePoint(${bind(+filters.lng)},${bind(+filters.lat)}),4326)::geography)`;
  let sql = `SELECT ${columns}, ${distance} AS distance_meters ${admin ? ',u.phone_number AS farmer_phone' : ''}
    FROM produce_listings l JOIN users u ON u.user_id=l.farmer_id WHERE l.deleted_at IS NULL`;
  if (!admin || filters.status) sql += ` AND l.status=${bind(filters.status || 'available')}`;
  if (filters.crop_type) sql += ` AND lower(l.crop_type)=lower(${bind(filters.crop_type)})`;
  if (filters.unit) sql += ` AND l.unit=${bind(filters.unit)}`;
  if (filters.min_price != null) sql += ` AND l.price_per_unit>=${bind(+filters.min_price)}`;
  if (filters.max_price != null) sql += ` AND l.price_per_unit<=${bind(+filters.max_price)}`;
  if (filters.location) sql += ` AND l.kebele ILIKE ${bind('%' + filters.location + '%')}`;
  if (filters.search) sql += ` AND (l.crop_type || ' ' || coalesce(l.variety,'')) ILIKE ${bind('%' + filters.search + '%')}`;
  if (filters.quality_grade) sql += ` AND l.quality_grade=${bind(filters.quality_grade)}`;
  if (filters.harvest_from) sql += ` AND l.harvest_date>=${bind(filters.harvest_from)}`;
  if (filters.harvest_to) sql += ` AND l.harvest_date<=${bind(filters.harvest_to)}`;
  if (filters.radius != null) sql += ` AND ${distance}<=${bind(+filters.radius)}`;
  const sort = { newest: 'l.created_at DESC', price_asc: 'l.price_per_unit ASC', price_desc: 'l.price_per_unit DESC', distance: 'distance_meters ASC NULLS LAST' };
  sql += ` ORDER BY ${sort[filters.sort] || sort.newest},l.listing_id LIMIT ${bind(Number(filters.limit) || 30)} OFFSET ${bind(Number(filters.offset) || 0)}`;
  return (await pool.query(sql, values)).rows;
};

// Tombstones retain transaction foreign keys and prevent replay resurrecting deletions.
const deleteListing = async (id, farmerId, version, admin = false) => {
  const r = await pool.query(`UPDATE produce_listings SET deleted_at=coalesce(deleted_at,now()),updated_at=now(),version=version+1
    WHERE listing_id=$1 ${admin ? '' : "AND farmer_id=$2 AND (deleted_at IS NOT NULL OR (status='available' AND version=$3))"} RETURNING listing_id`, admin ? [id] : [id,farmerId,version]);
  if (!r.rows.length) throw fail(409, 'Listing unavailable, not owned by you, reserved, or changed. Refresh first.');
  return r.rows[0];
};
const updateListingStatus = async (id, status) => (await pool.query('UPDATE produce_listings SET status=$2,version=version+1,updated_at=now() WHERE listing_id=$1 AND deleted_at IS NULL RETURNING listing_id', [id,status])).rows[0];
module.exports = { createListing, updateListing, getListing, createListingsBatch, getFarmerListings, getAvailableListings, deleteListing, updateListingStatus };
