const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const { upgradeValidation } = require('../../validators/subscription.validator');
const {
  upgradeSubscription,
  getSubscriptionStatus,
  cancelSubscription,
} = require('./subscription.controller');
const { upgradeValidator } = require('./subscription.validator');
const router = express.Router();

router.use(authMiddleware);

// GET /api/subscriptions/status
router.get('/status', getSubscriptionStatus);

// POST /api/subscriptions/upgrade
router.post('/upgrade', upgradeValidator, validateRequest, upgradeSubscription);

// POST /api/subscriptions/cancel
router.post('/cancel', cancelSubscription);

module.exports = router;