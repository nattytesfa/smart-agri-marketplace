// src/modules/users/user.routes.js
//
// Per Implementation Guide §8 API surface:
//   POST /api/auth/register  — triggers Fayda verification
//   POST /api/auth/login
//   GET  /api/users/:id
// Plus the two Fayda-specific legs of the OIDC redirect round trip.

const express = require('express');
const env = require('../../config/env');
const controller = require('./user.controller');

const router = express.Router();

// Mount the dev-only mock IDP under /api/auth/fayda/mock when in mock mode.
if (env.fayda.mode === 'mock') {
  router.use('/auth/fayda/mock', require('../../integrations/fayda/fayda.mock'));
}

router.post('/auth/register', controller.register);
router.post('/auth/login', controller.login);
router.get('/users/:id', controller.getUser);

// Fayda OIDC round trip
router.get('/auth/fayda/login', controller.faydaLogin);
router.get('/auth/fayda/callback', controller.faydaCallback);

module.exports = router;