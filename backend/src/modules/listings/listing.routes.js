const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { rbac } = require('../../middleware/rbac');
const multer = require('multer');
const { param, body } = require('express-validator');
const validateRequest = require('../../middleware/validateRequest');
const { createListingValidator, syncListingsValidator, idValidator, searchValidator } = require('../../validators/listing.validator');
const {
  createListing,
  getListings,
  getMyListings,
  syncListings,
  updateListing, deleteListing, getListing, uploadImage,
} = require('./listing.controller');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET all available listings (public search) – buyer
router.get('/', searchValidator, validateRequest, getListings);

// GET my listings (for farmer)
router.get('/me', rbac(['farmer']), getMyListings);

// POST create a listing (online)
router.post('/', rbac(['farmer']), createListingValidator, validateRequest, createListing);

// POST sync bulk listings (offline upload)
router.post('/sync', rbac(['farmer']), syncListingsValidator, validateRequest, syncListings);
router.get('/:id', idValidator, validateRequest, getListing);
router.put('/:id', rbac(['farmer']), idValidator, createListingValidator,
  body('version').isInt({ min: 1 }), body('operation_id').isUUID(), validateRequest, updateListing);
router.delete('/:id', rbac(['farmer']), idValidator, body('version').isInt({ min: 1 }), validateRequest, deleteListing);
router.post('/:id/images/:imageId', rbac(['farmer']), idValidator, param('imageId').isUUID(), validateRequest,
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 204800, files: 1 } }).single('image'), uploadImage);

module.exports = router;
