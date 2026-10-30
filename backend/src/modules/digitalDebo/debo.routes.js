const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { rbac } = require('../../middleware/rbac');
const c = require('./debo.controller');

const router = express.Router();

// All routes require authentication (buyer)
router.use(authMiddleware);

// POST /api/debo/aggregate – find clusters
router.post('/aggregate', rbac(['buyer']), c.aggregateListings);

// POST /api/debo/batches – create a batch
router.post('/batches', rbac(['buyer']), c.createBatch);
router.get('/batches', rbac(['buyer','farmer']), c.listBatches);
router.get('/invitations', rbac(['farmer']), c.listBatches);
router.post('/batches/:id/contributions/:listingId/respond', rbac(['farmer']), c.respond);
router.post('/batches/:id/cancel', rbac(['buyer']), c.cancel);
router.post('/batches/:id/refresh', rbac(['buyer']), c.replenish);

// GET /api/debo/batches/:id – get batch details
router.get('/batches/:id', rbac(['buyer','farmer']), c.getBatch);

module.exports = router;
