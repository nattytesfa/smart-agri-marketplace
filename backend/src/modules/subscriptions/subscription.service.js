const pool = require('../../config/db');

// Get user's current subscription
const getUserSubscription = async (userId) => {
  const query = `
    SELECT subscription_id, plan_type, is_active, start_date, end_date, 
           notification_channel
    FROM subscriptions
    WHERE user_id = $1
    ORDER BY start_date DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0] || null;
};

// Create or update subscription
const createSubscription = async (userId, planType, paymentMethod) => {
  // First, deactivate any existing subscriptions
  await pool.query(
    'UPDATE subscriptions SET is_active = false WHERE user_id = $1',
    [userId]
  );

  const query = `
    INSERT INTO subscriptions (
      user_id, plan_type, is_active, start_date, end_date, notification_channel
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING subscription_id, plan_type, is_active, start_date, end_date, notification_channel
  `;

  const isActive = true;
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

  const values = [
    userId,
    planType,
    isActive,
    startDate,
    endDate,
    planType === 'premium' ? 'sms_and_push' : 'push_only',
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

// Check if user has active premium subscription
const isPremiumActive = async (userId) => {
  const query = `
    SELECT is_active, plan_type, notification_channel
    FROM subscriptions
    WHERE user_id = $1 AND is_active = true
  `;
  const result = await pool.query(query, [userId]);
  if (result.rows.length === 0) return false;
  return result.rows[0].plan_type === 'premium' && result.rows[0].is_active;
};

// Cancel subscription
const cancelSubscription = async (userId) => {
  const query = `
    UPDATE subscriptions 
    SET is_active = false 
    WHERE user_id = $1 AND is_active = true
    RETURNING subscription_id
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0];
};

// Get all premium users (for sending bulk notifications)
const getPremiumUsers = async () => {
  const query = `
    SELECT s.user_id, s.notification_channel, u.phone_number
    FROM subscriptions s
    JOIN users u ON s.user_id = u.user_id
    WHERE s.is_active = true AND s.plan_type = 'premium'
  `;
  const result = await pool.query(query);
  return result.rows;
};

module.exports = {
  getUserSubscription,
  createSubscription,
  isPremiumActive,
  cancelSubscription,
  getPremiumUsers,
};