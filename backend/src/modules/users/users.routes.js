const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const {
  registerValidator,
  checkRegistrationValidator,
} = require('../../validators/user.validator');
const { register, getMe, checkRegistration } = require('./users.controller');

const router = express.Router();

// Unauthenticated: the registration screen checks before sending the OTP.
router.get(
  '/check-registration',
  checkRegistrationValidator,
  validateRequest,
  checkRegistration
);

router.post('/register', authMiddleware, registerValidator, validateRequest, register);
router.get('/me', authMiddleware, getMe);

module.exports = router;