/**
 * NMIS (National Market Information System) Integration
 * Replace with actual API calls when available
 */

// Stub: get current market prices for a crop
const getCropPrice = async (cropType) => {
  console.log(`[NMIS] Fetching price for crop: ${cropType}`);
  
  // Simulated price data
  const prices = {
    teff: 4500,
    wheat: 3200,
    maize: 2800,
    barley: 2500,
    coffee: 12000,
    default: 3000,
  };
  
  const key = cropType?.toLowerCase() || 'default';
  return {
    crop: cropType,
    price_per_quintal: prices[key] || prices.default,
    price_trend: 'up', // 'up', 'down', 'stable'
    average_price: prices[key] || prices.default,
    date: new Date().toISOString().split('T')[0],
  };
};

// Stub: get historical trends
const getHistoricalTrends = async (cropType, days = 30) => {
  console.log(`[NMIS] Fetching trends for ${cropType} over ${days} days`);
  return {
    crop: cropType,
    trend: 'up', // 'up', 'down', 'stable'
    percentage_change: 5.2,
    period: `${days} days`,
  };
};

module.exports = { getCropPrice, getHistoricalTrends };