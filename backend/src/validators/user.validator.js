const { body, query } = require('express-validator');

// Ethiopian phone number format: +251 followed by 9 digits
const ethiopianPhoneRegex = /^\+2519\d{8}$/;

const registerValidator = [
  body('phone_number')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(ethiopianPhoneRegex)
    .withMessage('Valid Ethiopian phone number required (e.g., +251912345678)'),
  body('fayda_id')
    .notEmpty()
    .withMessage('Fayda ID is required'),
  body('full_name')
    .notEmpty()
    .withMessage('Full name is required')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Full name must be between 2 and 120 characters'),
  body('region')
    .notEmpty()
    .withMessage('Region is required')
    .trim(),
  body('zone')
    .notEmpty()
    .withMessage('Zone is required')
    .trim(),
  body('kebele')
    .notEmpty()
    .withMessage('Kebele is required')
    .trim(),
  body('role')
    .isIn(['farmer', 'buyer', 'da'])
    .withMessage('Role must be farmer, buyer, or da'),
  body('storage_type')
    .optional()
    .isIn(['gotera', 'modern', 'none'])
    .withMessage('Invalid storage type'),
  body('farm_size_hectares')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Farm size must be a positive number'),
];

// Runs before the OTP is sent, so it cannot rely on a session.
const checkRegistrationValidator = [
  query('phone_number')
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(ethiopianPhoneRegex)
    .withMessage('Valid Ethiopian phone number required (e.g., +251912345678)'),
];

module.exports = { registerValidator, checkRegistrationValidator };