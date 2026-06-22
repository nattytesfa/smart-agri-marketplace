const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { getWeather, getSellOrHold, getPrices } = require('./advisory.controller');

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// GET /api/advisory/weather/:farmerId – NMA 7-day forecast
router.get('/weather/:farmerId', getWeather);

// GET /api/advisory/sell-or-hold/:farmerId – Decision engine output
router.get('/sell-or-hold/:farmerId', getSellOrHold);

// GET /api/advisory/prices – NMIS price index
router.get('/prices', getPrices);

module.exports = router;