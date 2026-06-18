const { body } = require('express-validator');

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

module.exports = { registerValidator };