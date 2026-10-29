const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const { rbac } = require('../../middleware/rbac');
const { body } = require('express-validator');
const {
  initiateTransaction,
  handleWebhook,
  getTransaction,
  getMyTransactions,
  generateQr,
  releaseEscrow,
} = require('./transaction.controller');

const router = express.Router();

// Public webhook endpoint (no auth required)
router.post('/webhooks/telebirr', handleWebhook);
router.post('/webhooks/cbe', handleWebhook);

// Protected routes
router.use(authMiddleware);

// POST /api/transactions/initiate
router.post('/initiate', rbac(['buyer']), body('listing_id').optional().isUUID(), body('batch_id').optional().isUUID(),
  body('payment_method').isIn(['telebirr','cbe_birr']), validateRequest, initiateTransaction);

// GET /api/transactions
router.get('/', getMyTransactions);

// GET /api/transactions/:id
router.get('/:id', getTransaction);

// POST /api/transactions/:id/generate-qr (farmer)
router.post('/:id/generate-qr', generateQr);

// POST /api/transactions/:id/release (buyer with QR)
router.post('/:id/release', releaseEscrow);

module.exports = router;
