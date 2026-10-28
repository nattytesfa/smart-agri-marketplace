const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const env = require('../../config/env');
const {
  registerValidator,
  checkRegistrationValidator,
} = require('../../validators/user.validator');
const { register, getMe, checkRegistration } = require('./users.controller');
const faydaController = require('./user.controller');

const router = express.Router();

// Mount the dev-only mock IDP under /api/auth/fayda/mock when in mock mode.
if (env.fayda.mode === 'mock') {
  router.use('/fayda/mock', require('../../integrations/fayda/fayda.mock'));
}

// Unauthenticated: the registration screen checks before sending the OTP.
router.get(
  '/check-registration',
  checkRegistrationValidator,
  validateRequest,
  checkRegistration
);

router.post('/register', authMiddleware, registerValidator, validateRequest, register);
router.get('/me', authMiddleware, getMe);

// Fayda OIDC round trip
router.post('/fayda/start', authMiddleware, faydaController.startFaydaVerification);
router.get('/fayda/login', faydaController.faydaLogin);
router.get('/fayda/callback', faydaController.faydaCallback);

module.exports = router;
