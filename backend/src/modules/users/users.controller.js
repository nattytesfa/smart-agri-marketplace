const { validationResult } = require('express-validator');
const userService = require('./user.service');
const logger = require('../../config/logger');

// Stub Fayda verification (replace with real API later)
const verifyFayda = async (faydaId) => {
  logger.info(`[FAYDA STUB] Verifying ID: ${faydaId}`);
  return { valid: true, name: 'Test Farmer' };
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const supabaseUser = req.user;
    if (!supabaseUser) {
      return res.status(401).json({ error: 'Unauthorized – no user found' });
    }

    const { phone_number, fayda_id, role, storage_type, farm_size_hectares } = req.body;

    // Verify Fayda (stub)
    const faydaResult = await verifyFayda(fayda_id);
    if (!faydaResult.valid) {
      return res.status(400).json({ error: 'Fayda ID verification failed' });
    }

    // Check if already registered
    const existing = await userService.findUserByPhone(phone_number);
    if (existing) {
      return res.status(409).json({ error: 'User with this phone already registered' });
    }

    const userId = supabaseUser.id;

    // Insert user
    await userService.createUser(userId, phone_number, fayda_id, role);

    // Create profile based on role
    if (role === 'farmer') {
      await userService.createFarmerProfile(userId, storage_type, farm_size_hectares);
    } else if (role === 'buyer') {
      await userService.createBuyerProfile(userId);
    }

    res.status(201).json({
      message: 'User registered successfully',
      user_id: userId,
      role,
    });
  } catch (error) {
    logger.error('Register error:', error);
    next(error);
  }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const supabaseUser = req.user;
    if (!supabaseUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await userService.getUserById(supabaseUser.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found in local database' });
    }

    res.status(200).json(user);
  } catch (error) {
    logger.error('GetMe error:', error);
    next(error);
  }
};

module.exports = { register, getMe };