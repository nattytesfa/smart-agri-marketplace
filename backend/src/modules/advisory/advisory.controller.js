const advisoryService = require('./advisory.service');
const { getWeatherForecast } = require('./nma.integration');
const { getCropPrice, getHistoricalTrends } = require('./nmis.integration');

// GET /api/advisory/weather/:farmerId
const getWeather = async (req, res, next) => {
  try {
    const { farmerId } = req.params;
    
    // Get farmer's location
    const farmerData = await advisoryService.getFarmerData(farmerId);
    if (farmerData.length === 0) {
      return res.status(404).json({ error: 'Farmer not found' });
    }
    
    const farmer = farmerData[0];
    const lat = farmer.lat;
    const lng = farmer.lng;
    
    // Get 7-day forecast
    const forecast = await getWeatherForecast(lat, lng);
    
    res.status(200).json({
      farmer_id: farmerId,
      location: { lat, lng },
      forecast: forecast.daily,
    });
    
  } catch (error) {
    next(error);
  }
};

// GET /api/advisory/sell-or-hold/:farmerId
const getSellOrHold = async (req, res, next) => {
  try {
    const { farmerId } = req.params;
    
    if (req.user.id !== farmerId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // 1. Get farmer data
    const farmerDataArray = await advisoryService.getFarmerData(farmerId);
    if (farmerDataArray.length === 0) {
      return res.status(404).json({ error: 'Farmer not found or no listings' });
    }
    
    const farmer = farmerDataArray[0];
    const lat = farmer.lat;
    const lng = farmer.lng;
    const cropType = farmer.crop_type || 'unknown';
    
    // 2. Get weather forecast
    const weather = await getWeatherForecast(lat, lng);
    const rainProb = weather.daily[0].rain_prob;
    
    // 3. Get price data
    const priceData = await getCropPrice(cropType);
    
    // 4. Generate advice
    const advice = advisoryService.generateAdvice(farmer, weather, priceData);
    
    // 5. Save to database
    await advisoryService.saveAdvice(
      farmerId,
      cropType,
      rainProb,
      advice.recommendation,
      advice.message
    );
    
    res.status(200).json({
      farmer_id: farmerId,
      crop_type: cropType,
      recommendation: advice.recommendation, // 'sell' or 'hold'
      urgency: advice.urgency,
      message: advice.message,
      weather: {
        rain_probability: rainProb,
        forecast: weather.daily.slice(0, 5),
      },
      price: {
        current_price: priceData.price_per_quintal,
        average_price: priceData.average_price,
        trend: priceData.price_trend,
      },
      storage_type: farmer.storage_type,
    });
    
  } catch (error) {
    next(error);
  }
};

// GET /api/advisory/prices – NMIS price index
const getPrices = async (req, res, next) => {
  try {
    const { crop } = req.query;
    
    if (!crop) {
      return res.status(400).json({ error: 'crop query parameter is required' });
    }
    
    const priceData = await getCropPrice(crop);
    const trends = await getHistoricalTrends(crop);
    
    res.status(200).json({
      crop: crop,
      current_price: priceData.price_per_quintal,
      average_price: priceData.average_price,
      trend: priceData.price_trend,
      percentage_change: trends.percentage_change,
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = { getWeather, getSellOrHold, getPrices };