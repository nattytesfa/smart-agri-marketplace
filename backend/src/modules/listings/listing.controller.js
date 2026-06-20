const listingService = require('./listing.service');
const { validationResult } = require('express-validator');

// POST /api/listings – create a single listing (online)
const createListing = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const farmerId = req.user.id;
    const listingData = req.body;

    const created = await listingService.createListing(listingData, farmerId);

    res.status(201).json({
      message: 'Listing created successfully',
      listing: created,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/listings – get all available listings (with filters)
const getListings = async (req, res, next) => {
  try {
    const filters = {
      crop_type: req.query.crop_type,
      min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
      max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
      radius: req.query.radius ? parseFloat(req.query.radius) : null,
      lat: req.query.lat ? parseFloat(req.query.lat) : null,
      lng: req.query.lng ? parseFloat(req.query.lng) : null,
    };

    const listings = await listingService.getAvailableListings(filters);
    res.status(200).json(listings);
  } catch (error) {
    next(error);
  }
};

// GET /api/listings/me – get the current farmer's listings
const getMyListings = async (req, res, next) => {
  try {
    const farmerId = req.user.id;
    const listings = await listingService.getFarmerListings(farmerId);
    res.status(200).json(listings);
  } catch (error) {
    next(error);
  }
};

// POST /api/sync/listings – bulk sync from mobile (offline to online)
const syncListings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const farmerId = req.user.id;
    const { listings } = req.body;

    const created = await listingService.createListingsBatch(listings, farmerId);

    res.status(201).json({
      message: `${created.length} listings synced successfully`,
      synced: created,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createListing,
  getListings,
  getMyListings,
  syncListings,
};