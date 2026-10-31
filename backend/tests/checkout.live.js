// Opt-in: real Supabase token issuance/verification, mounted Express routes,
// actual PostgreSQL. Temporary auth identities; public fixtures roll back.
// No OTP/SMS is sent and no existing user's token or password is accessed.
if (process.env.LIVE_AUTH_TEST !== '1') {
  console.log('Not run: LIVE_AUTH_TEST=1 is required for temporary live Auth identities.');
} else {
  const assert = require('assert').strict;
  const { randomUUID, randomBytes } = require('crypto');
  const fs = require('fs');
  const original = require('../src/config/db');
  const config = require('../src/config/env');
  const admin = require('../src/config/supabaseClient');
  const { createClient } = require('@supabase/supabase-js');
  const mobile = require('dotenv').parse(fs.readFileSync(require('path').resolve(__dirname, '../../mobile/.env')));
  const identities = [];
  let db, checks = 0;
  const check = (value, label) => { assert(value, label); checks++; console.log(`PASS ${label}`); };
  (async () => {
    try {
      assert.equal(mobile.SUPABASE_URL, config.supabaseUrl, 'Mobile and API must use the same project');
      process.env.NODE_ENV = 'demo'; process.env.SIMULATED_PAYMENTS_ENABLED = 'true';
      for (const role of ['farmer', 'buyer', 'buyer']) {
        const email = `checkout-${randomUUID()}@example.com`, password = randomBytes(32).toString('base64url');
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (created.error) throw new Error(`Temporary Auth creation failed: ${created.error.message}`);
        const identity = { id: created.data.user.id, appId: role === 'buyer' && identities.length === 1 ? randomUUID() : created.data.user.id, role };
        identities.push(identity);
        const client = createClient(config.supabaseUrl, mobile.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: require('ws') } });
        const signed = await client.auth.signInWithPassword({ email, password });
        if (signed.error) throw new Error(`Temporary Auth sign-in failed: ${signed.error.message}`);
        identity.token = signed.data.session.access_token;
      }
      db = await original.connect(); await db.query('BEGIN');
      for (const u of identities) await db.query(`INSERT INTO users(user_id,auth_user_id,phone_number,role,hashed_password,full_name)
        VALUES($1,$2,$3,$4,'temporary-test-only','Checkout verification')`, [u.appId, u.id, `test-${u.id}`, u.role]);
      const wrapped = { query: (sql, args) => {
        if (sql.startsWith('SET TRANSACTION ISOLATION LEVEL')) return Promise.resolve({ rows: [] }); // outer rollback snapshot
        return db.query(sql === 'BEGIN' ? 'SAVEPOINT checkout_action' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT checkout_action' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT checkout_action' : sql, args);
      }, release() {} };
      require.cache[require.resolve('../src/config/db')].exports = { query: (sql, args) => db.query(sql, args), connect: async () => wrapped };
      const app = require('../src/app'), http = require('supertest'); // real Supabase auth middleware, not mocked
      const [farmer, buyer, other] = identities;
      const get = (path, u) => http(app).get(path).set('Authorization', `Bearer ${u.token}`);
      const post = (path, u, body = {}) => http(app).post(path).set('Authorization', `Bearer ${u.token}`).send(body);
      const me = await get('/api/auth/me', buyer);
      check(me.status === 200 && me.body.user_id === buyer.appId && me.body.auth_user_id === buyer.id && me.body.role === 'buyer', 'real Supabase buyer resolves the linked application ID and buyer role');
      check(!(await db.query('SELECT role FROM users WHERE user_id=$1', [buyer.id])).rowCount, 'historical raw-subject RBAC lookup would reject this legitimate mapped buyer');
      const listing = await post('/api/listings', farmer, { client_id: randomUUID(), operation_id: randomUUID(), crop_type: `Live checkout ${randomUUID()}`, variety: 'White', quantity: 10, unit: 'quintal', price_per_unit: '10.075', kebele: 'Test origin', location_lat:9.03, location_lng:38.74 });
      check(listing.status === 201, 'real authenticated farmer can create a listing');
      const lid = listing.body.listing.listing_id;
      const body = { listing_id: lid, quantity: '2', payment_method: 'telebirr', request_id: randomUUID() };
      const rejected = await post('/api/transactions/initiate', farmer, body);
      check(rejected.status === 403 && rejected.body.current_role === 'farmer', 'real authenticated farmer remains denied buyer checkout');
      const created = await post('/api/transactions/initiate', buyer, body);
      check(created.status === 201 && created.body.transaction.buyer_id === buyer.appId && created.body.transaction.amount === '20.15', 'mapped buyer initiates eligible checkout with exact authoritative decimal-string total');
      const id = created.body.transaction.transaction_id;
      let detail = await get(`/api/transactions/${id}`, buyer);
      check(detail.status === 200 && detail.body.is_buyer && detail.body.payment_status === 'pending' && detail.body.balances.held === '0.00' && detail.body.allocations[0].settlement_status === 'unfunded', 'review is unpaid, exposes allocations and creates no demo escrow hold');
      check(detail.body.allocations[0].quantity === '2' && detail.body.allocations[0].unit_price === '10.075', 'review exposes immutable authoritative quantity and price');
      check((await get(`/api/transactions/${id}`, other)).status === 404, 'another real authenticated buyer cannot read private checkout');
      check((await post(`/api/transactions/${id}/simulate-payment`, other, { method: 'telebirr' })).status === 404, 'another buyer cannot fund this checkout');
      const paid = await post(`/api/transactions/${id}/simulate-payment`, buyer, { method: 'telebirr' });
      check(paid.status === 200 && paid.body.payment_status === 'simulated_paid', 'real authenticated mapped buyer confirms demo payment');
      await post(`/api/transactions/${id}/simulate-payment`, buyer, { method: 'telebirr' });
      detail = await get(`/api/transactions/${id}`, buyer);
      check(detail.body.balances.held === '20.15' && detail.body.allocations.length === 1 && detail.body.allocations[0].ledger.length === 1, 'escrow is visible with one exact demo hold after repeated payment request');
      const history = await get('/api/transactions', buyer);
      check(history.status === 200 && history.body.some(t => t.transaction_id === id && t.is_buyer), 'mapped buyer finds checkout through escrow order history');
      process.env.NODE_ENV = 'production';
      check((await post(`/api/transactions/${id}/simulate-payment`, buyer, { method: 'telebirr' })).status === 503, 'production still disables payment simulation');
      process.env.NODE_ENV = 'demo';
      check((await http(app).get('/api/transactions')).status === 401, 'missing bearer token remains unauthorized');
      check((await http(app).get('/api/transactions').set('Authorization', 'Bearer invalid-token')).status === 401, 'invalid bearer token is rejected by real Supabase verification');
      const expired = require('jsonwebtoken').sign({ sub: buyer.id, exp: 1, role: 'authenticated' }, randomBytes(32));
      check((await http(app).get('/api/transactions').set('Authorization', `Bearer ${expired}`)).status === 401, 'expired/untrusted JWT is rejected rather than decoded as authorization');
      // Real RLS, using the same mapped identity but no backend database role.
      await db.query('SAVEPOINT rls_check'); await db.query('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [buyer.id]);
      check((await db.query('SELECT user_id FROM users')).rows.every(u => u.user_id === buyer.appId), 'RLS preserves mapped own-account reads');
      check((await db.query('SELECT transaction_id FROM transactions WHERE transaction_id=$1', [id])).rowCount === 1, 'RLS permits mapped own-checkout read');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [other.id]);
      check((await db.query('SELECT transaction_id FROM transactions WHERE transaction_id=$1', [id])).rowCount === 0, 'RLS still hides the checkout from another buyer');
      await db.query('ROLLBACK TO SAVEPOINT rls_check');
      const batch = await post('/api/debo/batches', buyer, { crop_type:listing.body.listing.crop_type,target_quantity:3,unit:'quintal',lat:9.03,lng:38.74,radius:1000,request_id:randomUUID() });
      check(batch.status === 201 && batch.body.status === 'pending', 'mapped real buyer creates a Digital Debo proposal without pre-reserving stock');
      const accepted = await post(`/api/debo/batches/${batch.body.batch_id}/contributions/${lid}/respond`, farmer, { action:'accepted',quantity:'3' });
      check(accepted.status === 200 && accepted.body.status === 'filled', 'real farmer confirms Debo contribution and fills the batch');
      const batchCheckout = await post('/api/transactions/initiate', buyer, { batch_id:batch.body.batch_id,payment_method:'cbe_birr',request_id:randomUUID() });
      check(batchCheckout.status === 201 && batchCheckout.body.transaction.amount === '30.23', 'mapped buyer reviews a filled Debo checkout with exact half-up total');
      const bid = batchCheckout.body.transaction.transaction_id;
      check((await post(`/api/transactions/${bid}/simulate-payment`,buyer,{method:'cbe_birr'})).status === 200, 'mapped buyer can fund filled Debo checkout in simulation');
      const bd = await get(`/api/transactions/${bid}`,buyer);
      check(bd.body.balances.held === '30.23' && bd.body.allocations[0].quantity === '3', 'Debo escrow exposes the correct independent allocation');
      check((await get(`/api/transactions/${id}`,buyer)).body.balances.held === '20.15', 'Debo checkout leaves existing single-purchase escrow unchanged');
      if (process.env.LIVE_WALLET_TEST==='1') {
        process.env.DEMO_WALLETS_ENABLED='true';
        const topup={amount:'501000.00',confirm_demo:true,idempotency_key:randomUUID()};
        const first=await post('/api/wallet/top-ups',buyer,topup);
        check(first.status===200 && first.body.available==='501000.00','real authenticated buyer tops up virtual wallet');
        const retry=await post('/api/wallet/top-ups',buyer,topup);
        check(retry.body.reference===first.body.reference && retry.body.available==='501000.00','real authenticated top-up retry credits once');
        check((await post('/api/wallet/top-ups',farmer,topup)).status===403,'real authenticated farmer cannot top up');
        const order=await post('/api/transactions/initiate',buyer,{listing_id:lid,quantity:'1',payment_method:'demo_wallet',request_id:randomUUID()});
        check(order.status===201 && order.body.transaction.amount==='10.08','real buyer reviews wallet checkout without funding');
        const wid=order.body.transaction.transaction_id;
        const funding={method:'demo_wallet',confirm_demo:true,idempotency_key:randomUUID()};
        check((await post(`/api/transactions/${wid}/simulate-payment`,buyer,funding)).status===200,'real buyer wallet funds exact checkout');
        await post(`/api/transactions/${wid}/simulate-payment`,buyer,funding);
        check((await get('/api/wallet',buyer)).body.available==='500989.92','real buyer duplicate wallet payment debits once');
        const allocation=(await get(`/api/transactions/${wid}`,buyer)).body.allocations[0].allocation_id;
        check((await get('/api/wallet',farmer)).body.available==='0.00' && (await get('/api/wallet',farmer)).body.pending==='60.46','farmer sees pending allocations separately from available earnings');
        await post(`/api/transactions/${wid}/allocations/${allocation}/ready`,farmer);
        const qr=await post(`/api/transactions/${wid}/allocations/${allocation}/qr`,farmer);
        check((await post(`/api/transactions/${wid}/allocations/${allocation}/verify-delivery`,buyer,{qr_token:qr.body.qr_token,confirm_delivery:true})).status===200,'real buyer verifies single-use delivery QR');
        check((await post(`/api/transactions/${wid}/allocations/${allocation}/settle`,farmer)).status===200,'authorized real farmer settles verified allocation');
        await post(`/api/transactions/${wid}/allocations/${allocation}/settle`,farmer);
        check((await get('/api/wallet',farmer)).body.available==='10.08','real farmer receives one simulated settlement credit');
        check((await post(`/api/transactions/${id}/cancel`,buyer)).status===200,'simulated provider order cancellation refunds to demo wallet');
        check((await get('/api/wallet',buyer)).body.available==='501010.07','provider refund destination is virtual buyer wallet, not a real provider');
        // Force deferred financial checks before the outer fixture transaction rolls back.
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      }
      console.log(`${checks} live Supabase checkout checks passed. No real provider was contacted.`);
    } finally {
      if (db) { await db.query('ROLLBACK'); db.release(); }
      let cleanupError;
      for (const u of identities) {
        const result = await admin.auth.admin.deleteUser(u.id);
        if (result.error) cleanupError = new Error('Temporary Auth cleanup failed; investigate test identities');
      }
      await original.end();
      if (cleanupError) throw cleanupError;
      console.log('Rolled back public fixtures and removed temporary Auth identities.');
    }
  })().catch(e => { console.error(e.message); process.exitCode = 1; });
}
