const express = require('express');
const authMiddleware = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/rbac');
const {
  getPendingUsers,
  verifyUser,
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

// User management
router.get('/users', getPendingUsers);
router.post('/users/:id/verify', verifyUser);

// Listing moderation
router.get('/listings', getListings);
router.delete('/listings/:id', deleteListing);

// Transaction monitoring
router.get('/transactions', getTransactions);
router.post('/transactions/:id/resolve', resolveDispute);

// Analytics heatmap
router.get('/heatmap', getHeatmap);

module.exports = router;