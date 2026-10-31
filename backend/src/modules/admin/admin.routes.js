const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/rbac');
const {
  getPendingUsers,
  getUser,
  getListings,
  deleteListing,
  getTransactions,
  resolveDispute,
  getHeatmap,
} = require('./admin.controller');

const router = express.Router();

// All routes require auth + admin role
router.use(authMiddleware);
router.use(isAdmin);
router.get('/debo/batches', require('../digitalDebo/debo.controller').adminList);

// User management
router.get('/users', getPendingUsers);
router.get('/users/:id', getUser);

// Listing moderation
router.get('/listings', getListings);
router.delete('/listings/:id', deleteListing);

// Transaction monitoring
router.get('/transactions', getTransactions);
router.get('/transactions/summary', require('./admin.controller').getTransactionSummary);
router.get('/transactions/simulations', require('../transactionsEscrow/simulation.controller').adminList);
router.get('/transactions/:id', require('../transactionsEscrow/simulation.controller').adminDetails);
router.post('/disputes/:did/resolve', require('../transactionsEscrow/simulation.controller').resolve);
router.post('/transactions/:id/resolve', resolveDispute);

// Analytics heatmap
router.get('/heatmap', getHeatmap);

module.exports = router;
