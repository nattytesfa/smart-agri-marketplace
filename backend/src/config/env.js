require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  telebirrApiKey: process.env.TELEBIRR_API_KEY,
  cbeBirrApiKey: process.env.CBE_BIRR_API_KEY,
  faydaApiKey: process.env.FAYDA_API_KEY,
  nmisApiUrl: process.env.NMIS_API_URL,
  nmaApiKey: process.env.NMA_API_KEY,
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
  smsGatewayApiKey: process.env.SMS_GATEWAY_API_KEY,
  googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY,
};