const pool = require('../../config/db');
const { getWeatherForecast } = require('./nma.integration');
const { getCropPrice } = require('./nmis.integration');
// NEW: subscription service to check premium status
const subscriptionService = require('../subscriptions/subscription.service');
// NEW: SMS gateway to send text messages
const { sendSms } = require('../subscriptions/smsGateway.integration');

// Get farmer's active listings and profile
const getFarmerData = async (farmerId) => {
  const query = `
    SELECT 
      u.user_id, u.phone_number,
      fp.location_gps, fp.storage_type,
      ST_X(fp.location_gps) as lat, ST_Y(fp.location_gps) as lng,
      l.listing_id, l.crop_type, l.variety, l.quantity, l.price_per_unit
    FROM users u
    JOIN farmer_profiles fp ON u.user_id = fp.farmer_id
    LEFT JOIN produce_listings l ON u.user_id = l.farmer_id AND l.status = 'available'
    WHERE u.user_id = $1 AND u.role = 'farmer'
  `;
  const result = await pool.query(query, [farmerId]);
  return result.rows;
};

// Decision engine: Sell or Hold based on weather + price + storage
const generateAdvice = (farmerData, forecast, priceData) => {
  // Default advice
  let recommendation = 'hold';
  let message = '';
  let urgency = 'normal';
  
  // Extract data
  const storage = farmerData.storage_type || 'none';
  const crop = farmerData.crop_type || '';
  const price = priceData.price_per_quintal || 0;
  const avgPrice = priceData.average_price || 0;
  
  // Weather: check rain probability in next 3 days
  const next3Days = forecast.daily.slice(0, 3);
  const highRainDays = next3Days.filter(day => day.rain_prob > 50);
  const rainRisk = highRainDays.length > 0;
  
  // Price: compare current to average
  const isPriceHigh = price > avgPrice * 1.05; // 5% above average
  const isPriceLow = price < avgPrice * 0.95; // 5% below average
  
  // Storage: risk if open-air and rain expected
  const storageRisk = (storage === 'none' || storage === 'gotera') && rainRisk;
  
  // Decision matrix
  if (storageRisk && isPriceHigh) {
    recommendation = 'sell';
    urgency = 'urgent';
    message = '⚠️ Rain expected soon and your storage is not modern. Prices are good. Sell now to avoid losses!';
  } else if (storageRisk && !isPriceHigh) {
    recommendation = 'sell';
    urgency = 'urgent';
    message = '⚠️ Rain expected soon and your storage is not modern. Consider selling to prevent spoilage, even if price is average.';
  } else if (!storageRisk && isPriceHigh) {
    recommendation = 'sell';
    urgency = 'normal';
    message = '✅ Prices are high and your storage is safe. Good time to sell!';
  } else if (!storageRisk && isPriceLow) {
    recommendation = 'hold';
    urgency = 'normal';
    message = 'ℹ️ Prices are low. Your storage is secure. Wait for better prices.';
  } else if (rainRisk && isPriceLow) {
    recommendation = 'hold';
    urgency = 'normal';
    message = '⚠️ Prices are low, but rain is expected. If you can protect your produce, wait for market improvement.';
  } else {
    recommendation = 'hold';
    urgency = 'normal';
    message = 'ℹ️ Market conditions are stable. Monitor prices and weather daily.';
  }
  
  return { recommendation, message, urgency, rainRisk, price, storage };
};

// Save advice to database
const saveAdvice = async (farmerId, cropType, rainfallProb, recommendation, message) => {
  const query = `
    INSERT INTO advisory_notifications (farmer_id, crop_type, rainfall_prob, recommendation, message)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING advice_id
  `;
  const values = [farmerId, cropType, rainfallProb, recommendation, message];
  const result = await pool.query(query, values);
  return result.rows[0].advice_id;
};

// Get latest advice for a farmer
const getLatestAdvice = async (farmerId) => {
  const query = `
    SELECT * FROM advisory_notifications
    WHERE farmer_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [farmerId]);
  return result.rows[0] || null;
};

// ========== NEW: Notification logic for premium/free ==========

/**
 * Send advisory notification based on user's subscription plan
 * Premium + offline → SMS
 * Premium + online → push (stub)
 * Free → store in-app
 */
const sendAdvisoryNotification = async (farmerId, advice, cropType) => {
  try {
    // Check if user has premium subscription
    const isPremium = await subscriptionService.isPremiumActive(farmerId);
    
    // Get user's phone number
    const userQuery = await pool.query(
      'SELECT phone_number FROM users WHERE user_id = $1',
      [farmerId]
    );
    const phoneNumber = userQuery.rows[0]?.phone_number;
    
    if (!phoneNumber) {
      console.log(`No phone number found for user ${farmerId}`);
      return false;
    }

    const message = `[AgriDirect] ${advice.toUpperCase()}: ${cropType}. ${advice === 'sell' ? 'Sell now!' : 'Hold for better prices.'}`;

    if (isPremium) {
      // Premium users: Send SMS (simulated for now)
      await sendSms(phoneNumber, message);
      console.log(`[NOTIFICATION] SMS sent to ${phoneNumber}`);
    } else {
      // Free users: store notification in advisory_notifications
      const insertQuery = `
        INSERT INTO advisory_notifications (farmer_id, crop_type, recommendation, message, delivered)
        VALUES ($1, $2, $3, $4, false)
      `;
      await pool.query(insertQuery, [farmerId, cropType, advice, message]);
      console.log(`[NOTIFICATION] In-app notification stored for ${farmerId}`);
    }
    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
};

// Get offline notifications for user
const getOfflineNotifications = async (farmerId) => {
  const query = `
    SELECT * FROM advisory_notifications
    WHERE farmer_id = $1 AND delivered = false
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [farmerId]);
  return result.rows;
};

module.exports = {
  getFarmerData,
  generateAdvice,
  saveAdvice,
  getLatestAdvice,
  sendAdvisoryNotification,   // new export
  getOfflineNotifications,    // new export
};