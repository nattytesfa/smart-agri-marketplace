const express = require('express');
const authMiddleware = require('../../middleware/auth');
const validateRequest = require('../../middleware/validateRequest');
const { registerValidator } = require('../../validators/user.validator');
const { register, getMe } = require('./users.controller');

const router = express.Router();

router.post('/register', authMiddleware, registerValidator, validateRequest, register);
router.get('/me', authMiddleware, getMe);

module.exports = router;