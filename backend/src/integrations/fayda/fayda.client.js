// src/integrations/fayda/fayda.client.js
//
// The actual OIDC client for VeriFayda 2.0 (eSignet): Authorization
// Code flow + PKCE, private_key_jwt client auth. Identical whether
// FAYDA_MODE is mock, sandbox, or production — fayda.util.js resolves
// the endpoints and credentials, this file just drives the flow.

const env = require('../../config/env');
const {
  generatePkcePair,
  generateState,
  getEndpoints,
  generateClientAssertion,
  defaultClaims,
} = require('./fayda.util');

const fayda = env.fayda;

// Step 1: build the URL to send the user to, plus state/verifier to stash
// server-side (in the user's session) until the callback comes back.
function buildAuthorizeUrl() {
  const { authorize } = getEndpoints();
  const state = generateState();
  const { verifier, challenge } = generatePkcePair();

  const url = new URL(authorize);
  url.searchParams.set('client_id', fayda.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', fayda.redirectUri);
  url.searchParams.set('scope', fayda.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  if (fayda.acrValues) url.searchParams.set('acr_values', fayda.acrValues);
  if (fayda.claimsLocales) url.searchParams.set('claims_locales', fayda.claimsLocales);
  url.searchParams.set('claims', JSON.stringify(defaultClaims));

  return { authorizeUrl: url.toString(), state, verifier };
}

// Step 2: exchange the authorization code for tokens.
async function exchangeCodeForToken(code, verifier) {
  const { token } = getEndpoints();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: fayda.redirectUri,
    client_id: fayda.clientId,
    code_verifier: verifier,
  });

  if (fayda.mode !== 'mock') {
    const clientAssertion = await generateClientAssertion(token);
    body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    body.set('client_assertion', clientAssertion);
  }

  const res = await fetch(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fayda token exchange failed (${res.status}): ${text}`);
  }

  return res.json(); // { access_token, id_token, token_type, expires_in }
}

// Step 3: fetch the verified identity claims with the access token.
async function fetchUserInfo(accessToken) {
  const { userinfo } = getEndpoints();

  const res = await fetch(userinfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fayda userinfo fetch failed (${res.status}): ${text}`);
  }

  // Per docs §2.4: response may be plain JSON or a JWT string, depending
  // on deployment. Handle both.
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  const jwtString = await res.text();
  const payloadB64 = jwtString.split('.')[1];
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUserInfo,
};