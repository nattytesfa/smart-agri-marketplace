require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  telebirrApiKey: process.env.TELEBIRR_API_KEY,
  cbeBirrApiKey: process.env.CBE_BIRR_API_KEY,
  nmisApiUrl: process.env.NMIS_API_URL,
  nmaApiKey: process.env.NMA_API_KEY,
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
  smsGatewayApiKey: process.env.SMS_GATEWAY_API_KEY,
  googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY,

  // --- Fayda / VeriFayda 2.0 (eSignet) ---
  fayda: {
    mode: process.env.FAYDA_MODE || 'mock', // 'mock' | 'sandbox' | 'production'
    clientId: process.env.FAYDA_CLIENT_ID || 'mock-client-id',
    redirectUri: process.env.FAYDA_REDIRECT_URI || 'http://localhost:4000/api/auth/fayda/callback',
    privateKeyBase64: process.env.FAYDA_PRIVATE_KEY_BASE64 || null,
    scope: process.env.FAYDA_SCOPE || 'openid profile email',
    acrValues: process.env.FAYDA_ACR_VALUES || null,
    claimsLocales: process.env.FAYDA_CLAIMS_LOCALES || null,
    mockBaseUrl: process.env.FAYDA_MOCK_BASE_URL || 'http://localhost:4000/api/auth/fayda/mock',
    authorizationEndpoint: process.env.FAYDA_AUTHORIZATION_ENDPOINT || '',
    tokenEndpoint: process.env.FAYDA_TOKEN_ENDPOINT || '',
    userinfoEndpoint: process.env.FAYDA_USERINFO_ENDPOINT || '',
  },
};