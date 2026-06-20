const { body } = require('express-validator');

const createListingValidator = [
  body('crop_type')
    .notEmpty()
    .withMessage('Crop type is required'),
  body('quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a positive number'),
  body('price_per_unit')
    .isFloat({ min: 0.01 })
    .withMessage('Price must be a positive number'),
  body('unit')
    .optional()
    .isString(),
  body('variety')
    .optional()
    .isString(),
  body('harvest_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  body('location_lat')
    .optional()
    .isFloat({ min: -90, max: 90 }),
  body('location_lng')
    .optional()
    .isFloat({ min: -180, max: 180 }),
];

const syncListingsValidator = [
  body('listings')
    .isArray({ min: 1 })
    .withMessage('Listings array is required'),
  body('listings.*.crop_type')
    .notEmpty()
    .withMessage('Each listing must have crop_type'),
  body('listings.*.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Each listing must have quantity > 0'),
  body('listings.*.price_per_unit')
    .isFloat({ min: 0.01 })
    .withMessage('Each listing must have price > 0'),
];

module.exports = { createListingValidator, syncListingsValidator };