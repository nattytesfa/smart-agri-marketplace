const cron = require('node-cron');
const { getCropPrice } = require('../modules/advisory/nmis.integration');
const { getWeatherForecast } = require('../modules/advisory/nma.integration');

// Run every day at 6:00 AM
cron.schedule('0 6 * * *', async () => {
  console.log('[CRON] Fetching daily market and weather data...');
  try {
    // For each crop type, fetch and store (or cache) price data
    const crops = ['teff', 'wheat', 'maize', 'barley', 'coffee'];
    for (const crop of crops) {
      const price = await getCropPrice(crop);
      console.log(`[CRON] Price for ${crop}: ETB ${price.price_per_quintal}`);
      // Save to a cache table or file (not implemented in stub)
    }
    // Weather data could be fetched and stored similarly
    console.log('[CRON] Data fetch completed.');
  } catch (error) {
    console.error('[CRON] Error:', error);
  }
});

console.log('[CRON] Price ingestion job scheduled for 6 AM daily.');