#!/usr/bin/env node
// Simple integration sanity check for Fayda mock flow (dev-only).
// Requires backend running with FAYDA_MODE=mock.

const http = require('http');

const base = process.env.FAYDA_TEST_BASE || 'http://localhost:4000';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(base + path, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function main() {
  try {
    const h = await get('/health');
    console.log('health:', h.status, h.data);
    const login = await get('/api/auth/fayda/login');
    console.log('login status:', login.status);
    console.log('---');
    console.log('If login redirects (302) to mock UI, flow wiring looks OK.');
  } catch (err) {
    console.error('ERR', err);
  }
}

main();
