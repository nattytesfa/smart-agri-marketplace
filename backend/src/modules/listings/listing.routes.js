const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const { createListingValidator, syncListingsValidator } = require('../../validators/listing.validator');
const {
  createListing,
  getListings,
  getMyListings,
  syncListings,
} = require('./listing.controller');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET all available listings (public search) – buyer
router.get('/', getListings);

// GET my listings (for farmer)
router.get('/me', getMyListings);

// POST create a listing (online)
router.post('/', createListingValidator, validateRequest, createListing);

// POST sync bulk listings (offline upload)
router.post('/sync', syncListingsValidator, validateRequest, syncListings);

module.exports = router;