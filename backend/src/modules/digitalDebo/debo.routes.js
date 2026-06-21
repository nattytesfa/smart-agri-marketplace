const express = require('express');
const authMiddleware = require('../../middleware/auth');
const {
  aggregateListings,
  createBatch,
  getBatch,
} = require('./debo.controller');

const router = express.Router();

// All routes require authentication (buyer)
router.use(authMiddleware);

// POST /api/debo/aggregate – find clusters
router.post('/aggregate', aggregateListings);

// POST /api/debo/batches – create a batch
router.post('/batches', createBatch);

// GET /api/debo/batches/:id – get batch details
router.get('/batches/:id', getBatch);

module.exports = router;