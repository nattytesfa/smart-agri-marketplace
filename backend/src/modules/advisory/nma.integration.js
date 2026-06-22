/**
 * NMA / OpenWeather Integration
 * Replace with actual API calls when keys are available
 */

// Stub: get 7-day forecast for given coordinates
const getWeatherForecast = async (lat, lng) => {
  console.log(`[NMA] Fetching weather for lat: ${lat}, lng: ${lng}`);
  
  // Simulate forecast data
  return {
    daily: [
      { date: '2026-06-23', rain_prob: 80, temp_max: 28, temp_min: 18 },
      { date: '2026-06-24', rain_prob: 60, temp_max: 26, temp_min: 17 },
      { date: '2026-06-25', rain_prob: 40, temp_max: 30, temp_min: 19 },
      { date: '2026-06-26', rain_prob: 20, temp_max: 32, temp_min: 20 },
      { date: '2026-06-27', rain_prob: 10, temp_max: 33, temp_min: 21 },
      { date: '2026-06-28', rain_prob: 30, temp_max: 29, temp_min: 19 },
      { date: '2026-06-29', rain_prob: 70, temp_max: 25, temp_min: 16 },
    ],
  };
};

// Stub: get current weather
const getCurrentWeather = async (lat, lng) => {
  return {
    temp: 25,
    humidity: 65,
    rain: 0,
    description: 'Partly cloudy',
  };
};

module.exports = { getWeatherForecast, getCurrentWeather };