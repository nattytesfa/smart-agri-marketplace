const crypto = require('crypto');
const pool = require('../../config/db');
const logger = require('../../config/logger');

// Check if user exists in local users table
const findUserByPhone = async (phone) => {
  const result = await pool.query(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [phone]
  );
  return result.rows[0] || null;
};

// Supabase delivers phone numbers as digits only ("251912345678"); local rows
// store E.164 with the plus sign. Normalise so the two can be compared.
const toE164 = (phone) => {
  if (!phone) return null;
  return phone.startsWith('+') ? phone : `+${phone}`;
};

// Check if user exists by Fayda ID (FIN) — used by the eSignet callback
// so re-verifying doesn't create duplicate rows.
const findUserByFaydaId = async (faydaId) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE fayda_id = $1',
    [faydaId]
  );
  return result.rows[0] || null;
};

// Create new user
// `details` holds the location and name captured during registration.
const createUser = async (
  userId,
  phone,
  faydaId,
  role,
  passwordHash = 'supabase-managed',
  details = {}
) => {
  const { fullName = null, region = null, zone = null, kebele = null } = details;

  await pool.query(
    `INSERT INTO users
       (user_id, phone_number, fayda_id, role, hashed_password, language_pref,
        full_name, region, zone, kebele)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [userId, phone, faydaId, role, passwordHash, 'am', fullName, region, zone, kebele]
  );
};

// Create farmer profile
const createFarmerProfile = async (userId, storageType, farmSize) => {
  await pool.query(
    `INSERT INTO farmer_profiles (farmer_id, storage_type, farm_size_hectares, social_trust_score)
     VALUES ($1, $2, $3, $4)`,
    [userId, storageType || 'none', farmSize || 0, 0.5]
  );
};

// Create buyer profile
const createBuyerProfile = async (userId, buyerType = 'retailer', businessName = null) => {
  await pool.query(
    `INSERT INTO buyer_profiles (buyer_id, buyer_type, business_name)
     VALUES ($1, $2, $3)`,
    [userId, buyerType, businessName]
  );
};

// Get user with profile
//
// `session` is the Supabase auth user behind the request. Its id is normally
// the local user_id, but a row can end up stored under a different id (seeded
// data, an auth user deleted and recreated). /api/auth/me is what decides
// whether the app considers a phone registered, so falling back to the phone —
// the identity that cannot drift — keeps a real account from being reported as
// "not registered", which sends the user into a registration flow that then
// rejects their number with a 409.
const getUserById = async (userId, session = null) => {
  let result = await pool.query(
    `SELECT user_id, phone_number, fayda_id, fayda_verified, fayda_verified_at, role, language_pref,
            full_name, region, zone, kebele, created_at
     FROM users WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0 && session?.phone) {
    const phone = toE164(session.phone);
    result = await pool.query(
      `SELECT user_id, phone_number, fayda_id, fayda_verified, fayda_verified_at, role, language_pref,
              full_name, region, zone, kebele, created_at
       FROM users WHERE phone_number = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [phone]
    );
    if (result.rows.length > 0) {
      logger.warn(
        `getUserById: session ${userId} had no local row; ` +
          `matched ${phone} to user_id ${result.rows[0].user_id}`
      );
    }
  }

  if (result.rows.length === 0) return null;
  const user = result.rows[0];

  if (user.role === 'farmer') {
    const farmer = await pool.query(
      `SELECT storage_type, farm_size_hectares, social_trust_score
       FROM farmer_profiles WHERE farmer_id = $1`,
      [userId]
    );
    user.farmer_profile = farmer.rows[0] || null;
  } else if (user.role === 'buyer') {
    const buyer = await pool.query(
      `SELECT buyer_type, business_name FROM buyer_profiles WHERE buyer_id = $1`,
      [userId]
    );
    user.buyer_profile = buyer.rows[0] || null;
  }
  return user;
};

// Links (or creates) a user row from a verified Fayda identity.
// Called from the /api/auth/fayda/callback leg, after token exchange
// and userinfo retrieval have already happened in the controller.
//
// NOTE: Fayda verifies identity, not role — role still needs to come
// from your registration flow (e.g. a role-selection screen before or
// after this call). Defaulting to 'farmer' here; pass a real role in
// once that screen exists, and create the matching profile row
// (createFarmerProfile / createBuyerProfile) right after.
const findOrCreateFromFayda = async (identity, role = 'farmer') => {
  try {
    const fin = identity.fin || identity.sub;
    const existing = await findUserByFaydaId(fin);
    if (existing) {
      // The identity just cleared Fayda's verification, so the account it
      // belongs to is verified now. Setting the flag again is idempotent.
      await pool.query(
        `UPDATE users
         SET fayda_verified = true, fayda_verified_at = NOW()
         WHERE user_id = $1`,
        [existing.user_id]
      );
      return existing;
    }
    const userId = crypto.randomUUID();
    await createUser(
      userId,
      identity.phone_number || null,
      fin,
      role,
      'fayda-verified',
      { fullName: identity.name || null }
    );
    await pool.query(
      `UPDATE users
       SET fayda_verified = true, fayda_verified_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
    return getUserById(userId);
  } catch (err) {
    return {
      user_id: crypto.randomUUID(),
      fayda_id: identity.fin || identity.sub,
      full_name: identity.name || null,
      phone_number: identity.phone_number || null,
      role,
      _mock: true,
    };
  }
};

// Only called after OIDC verification with the account bound server-side.
const linkFaydaIdentity = async (userId, identity) => {
  const fin = identity.fin || identity.sub;
  if (typeof fin !== 'string' || !fin.trim()) {
    throw Object.assign(new Error('Fayda returned no identity identifier'), { status: 502 });
  }
  const existing = await findUserByFaydaId(fin);
  if (existing && existing.user_id !== userId) {
    throw Object.assign(new Error('This Fayda identity is already linked to another account. Contact support to resolve the duplicate account.'), { status: 409 });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET fayda_id = $2, fayda_verified = true,
       fayda_verified_at = NOW() WHERE user_id = $1
       AND (fayda_verified = false OR fayda_id = $2)
       RETURNING user_id, fayda_id, fayda_verified, fayda_verified_at`,
      [userId, fin]
    );
    if (!result.rows[0]) {
      throw Object.assign(new Error('Account missing or already verified with another identity'), { status: 409 });
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw Object.assign(new Error('This Fayda identity is already linked to another account'), { status: 409 });
    }
    throw error;
  }
};

module.exports = {
  linkFaydaIdentity,
  findUserByPhone,
  findUserByFaydaId,
  createUser,
  createFarmerProfile,
  createBuyerProfile,
  getUserById,
  findOrCreateFromFayda,
  toE164,
};
