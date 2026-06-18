const pool = require('../../config/db');

// Check if user exists in local users table
const findUserByPhone = async (phone) => {
  const result = await pool.query(
    'SELECT user_id FROM users WHERE phone_number = $1',
    [phone]
  );
  return result.rows[0] || null;
};

// Create new user
const createUser = async (userId, phone, faydaId, role, passwordHash = 'supabase-managed') => {
  await pool.query(
    `INSERT INTO users (user_id, phone_number, fayda_id, role, hashed_password, language_pref)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, phone, faydaId, role, passwordHash, 'am']
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
const getUserById = async (userId) => {
  const result = await pool.query(
    `SELECT user_id, phone_number, fayda_id, role, language_pref, created_at
     FROM users WHERE user_id = $1`,
    [userId]
  );
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

module.exports = {
  findUserByPhone,
  createUser,
  createFarmerProfile,
  createBuyerProfile,
  getUserById,
};