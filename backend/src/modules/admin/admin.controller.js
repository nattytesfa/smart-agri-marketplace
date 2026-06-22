const adminService = require('./admin.service');

// GET /api/admin/users – pending users
const getPendingUsers = async (req, res, next) => {
  try {
    const users = await adminService.getPendingUsers();
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/users/:id/verify
const verifyUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.verifyUser(id);
    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'User verified successfully' });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/listings
const getListings = async (req, res, next) => {
  try {
    const listings = await adminService.getAllListings();
    res.status(200).json(listings);
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/listings/:id
const deleteListing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteListing(id);
    if (!result) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    res.status(200).json({ message: 'Listing deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/transactions
const getTransactions = async (req, res, next) => {
  try {
    const transactions = await adminService.getAllTransactions();
    res.status(200).json(transactions);
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/transactions/:id/resolve
const resolveDispute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['released', 'refunded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "released" or "refunded"' });
    }
    
    const result = await adminService.resolveDispute(id, status);
    if (!result) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(200).json({ message: `Transaction ${status} successfully` });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/heatmap
const getHeatmap = async (req, res, next) => {
  try {
    const { region, crop } = req.query;
    const data = await adminService.getHeatmapData(region, crop);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingUsers,
  verifyUser,
  getListings,
  deleteListing,
  getTransactions,
  resolveDispute,
  getHeatmap,
};