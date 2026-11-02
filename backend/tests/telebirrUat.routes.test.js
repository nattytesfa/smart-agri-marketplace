jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../src/config/supabaseClient', () => ({ auth: { getUser: jest.fn() } }));
jest.mock('../src/middleware/accountIdentity', () => ({ resolveAccount: jest.fn(), diagnostic: jest.fn() }));
jest.mock('../src/modules/telebirrUat/service', () => ({ list: jest.fn(), create: jest.fn(), verify: jest.fn(), get: jest.fn(), capabilities: jest.fn() }));
const express = require('express');
const request = require('supertest');
const pool = require('../src/config/db');
const supabase = require('../src/config/supabaseClient');
const identity = require('../src/middleware/accountIdentity');
const service = require('../src/modules/telebirrUat/service');
const app = express(); app.use(express.json()); app.use('/api/wallet/telebirr-uat',require('../src/modules/telebirrUat/routes'));
const path = '/api/wallet/telebirr-uat';
beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'auth-id' } }, error: null });
  identity.resolveAccount.mockResolvedValue({ user_id: 'buyer-id' });
  pool.query.mockResolvedValue({ rows: [{ role: 'buyer' }] });
});
test('unauthorized funding request rejected', async () => {
  expect((await request(app).post(path).send({ amount: '1' })).status).toBe(401);
  expect(service.create).not.toHaveBeenCalled();
});
test('farmer cannot initiate buyer funding', async () => {
  pool.query.mockResolvedValue({ rows: [{ role: 'farmer' }] });
  expect((await request(app).post(path).set('Authorization','Bearer test-token').send({ amount: '1' })).status).toBe(403);
  expect(service.create).not.toHaveBeenCalled();
});
test('buyer ownership is authenticated account mapping, not client input', async () => {
  service.create.mockResolvedValue({ funding_id: 'test-id', status: 'pending' });
  expect((await request(app).post(path).set('Authorization','Bearer test-token').send({ amount: '1', buyer_id: 'forged' })).status).toBe(200);
  expect(service.create).toHaveBeenCalledWith('buyer-id',expect.any(Object));
});
test('SDK callback claims are discarded by route', async () => {
  service.verify.mockResolvedValue({ status: 'verification_pending' });
  await request(app).post(`${path}/test-id/sdk-complete`).set('Authorization','Bearer test-token').send({ status: 'verified_success', amount: '999', provider_reference: 'forged' });
  expect(service.verify).toHaveBeenCalledWith('buyer-id','test-id',true);
});
test('buyer cannot access admin UAT monitor', async () => {
  expect((await request(app).get(`${path}/admin`).set('Authorization','Bearer test-token')).status).toBe(403);
});
test('admin monitor is read-only', async () => {
  pool.query.mockResolvedValue({ rows: [{ role: 'admin' }] });
  service.list.mockResolvedValue({ items: [] });
  expect((await request(app).get(`${path}/admin`).set('Authorization','Bearer test-token')).status).toBe(200);
  expect((await request(app).post(`${path}/test-id/success`).set('Authorization','Bearer test-token')).status).not.toBe(200);
});
test('unsigned notifications have no receiver and cannot change status', async () => {
  expect((await request(app).post(`${path}/notify`).send({ status: 'success' })).status).toBe(401);
  expect(service.verify).not.toHaveBeenCalled();
});
