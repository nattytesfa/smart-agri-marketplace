// src/integrations/fayda/fayda.util.js
//
// Low-level helpers for VeriFayda 2.0 (eSignet): PKCE generation and
// the private_key_jwt client assertion required by the official docs
// (client authentication is a signed JWT, never a client_secret).

const crypto = require('crypto');
const { SignJWT, importJWK } = require('jose');
const env = require('../../config/env');

const fayda = env.fayda;

function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function generateState() {
  return base64url(crypto.randomBytes(16));
}

// Resolve the three endpoints based on FAYDA_MODE — the rest of the
// integration never checks the mode directly, it just calls these.
function getEndpoints() {
  if (fayda.mode === 'mock') {
    return {
      authorize: `${fayda.mockBaseUrl}/authorize`,
      token: `${fayda.mockBaseUrl}/token`,
      userinfo: `${fayda.mockBaseUrl}/userinfo`,
    };
  }
  return {
    authorize: fayda.authorizationEndpoint,
    token: fayda.tokenEndpoint,
    userinfo: fayda.userinfoEndpoint,
  };
}

// Default essential claims, per docs §2.1 — adjust per your KYC needs.
const defaultClaims = {
  userinfo: {
    name: { essential: true },
    phone_number: { essential: true },
    email: { essential: true },
    picture: { essential: true },
    gender: { essential: true },
    birthdate: { essential: true },
    address: { essential: true },
  },
  id_token: {},
};

// Builds and signs the private_key_jwt client assertion.
// Required for sandbox/production token requests; unused in mock mode.
async function generateClientAssertion(tokenEndpoint) {
  if (!fayda.privateKeyBase64) {
    throw new Error(
      'FAYDA_PRIVATE_KEY_BASE64 is not set — required once FAYDA_MODE is sandbox or production.'
    );
  }

  const jwkJson = Buffer.from(fayda.privateKeyBase64, 'base64').toString('utf8');
  const jwk = JSON.parse(jwkJson);
  const privateKey = await importJWK(jwk, 'RS256');

  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(fayda.clientId)
    .setSubject(fayda.clientId)
    .setAudience(tokenEndpoint)
    .setIssuedAt()
    .setExpirationTime('2m') // short-lived, per docs (5-15 min typical)
    .sign(privateKey);
}

module.exports = {
  generatePkcePair,
  generateState,
  getEndpoints,
  generateClientAssertion,
  defaultClaims,
};