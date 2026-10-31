const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const { rbac } = require('../../middleware/rbac');
const { body } = require('express-validator');
const {
  initiateTransaction,
  handleWebhook,
} = require('./transaction.controller');

const router = express.Router();
const simulation = require('./simulation.controller');
router.param('id', (req, res, next, id) => {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({error:'Invalid transaction ID'});
  next();
});

// Public webhook endpoint (no auth required)
router.post('/webhooks/telebirr', handleWebhook);
router.post('/webhooks/cbe', handleWebhook);

// Protected routes
router.use(authMiddleware);

// POST /api/transactions/initiate
router.post('/initiate', rbac(['buyer']), body('listing_id').optional().isUUID(), body('batch_id').optional().isUUID(),
  body('request_id').optional().isUUID(), body('quantity').optional().isDecimal(),
  body('payment_method').isIn(['telebirr','cbe_birr','demo_wallet']), validateRequest, initiateTransaction);

// GET /api/transactions
router.get('/', simulation.list);

// GET /api/transactions/:id
router.get('/:id', simulation.details);
router.post('/:id/cancel', rbac(['buyer']), require('./transaction.controller').cancelCheckout);
router.post('/:id/simulate-payment', rbac(['buyer']), simulation.pay);
router.post('/:id/allocations/:aid/ready', rbac(['farmer']), simulation.ready);
router.post('/:id/allocations/:aid/qr', rbac(['farmer']), simulation.qr);
router.post('/:id/allocations/:aid/verify-delivery', rbac(['buyer']), simulation.verify);
router.post('/:id/allocations/:aid/settle', rbac(['buyer','farmer']), simulation.settle);
router.post('/:id/allocations/:aid/disputes', rbac(['buyer']), simulation.dispute);

// Old reusable transaction-level QR contracts are retired (410).
router.post('/:id/generate-qr', simulation.legacyQr);

router.post('/:id/release', simulation.legacyQr);

module.exports = router;
