// Real PostgreSQL/PostGIS tests in a disposable schema; no application rows touched.
const assert = require('assert').strict;
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const original = require('../src/config/db');
const config = require('../src/config/env');
const schema = `simulation_test_${randomUUID().replaceAll('-', '')}`;
let pool, checks = 0;
const check = (ok, message) => { assert(ok, message); checks++; console.log(`PASS ${message}`); };
const reject = async (promise, status, message) => { await assert.rejects(promise, { status }); check(true, message); };
const sqlFile = n => fs.readFileSync(require.resolve(`../db/migrations/${n}`), 'utf8').replaceAll(/\bpublic\b/g, schema);
(async () => {
  try {
    await original.query(`CREATE SCHEMA ${schema}`);
    for (const table of ['users', 'produce_listings', 'digital_debo_batches', 'debo_batch_listings', 'transactions'])
      await original.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
    pool = new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false }, max: 4, keepAlive:true, idleTimeoutMillis:0,
      connectionTimeoutMillis: 30000, query_timeout:45000, statement_timeout: 30000, lock_timeout: 5000, options: `-c search_path=${schema},public` });
    const six = sqlFile('006_digital_debo.sql');
    for (const name of ['debo_guard_contribution', 'debo_available', 'debo_guard_listing']) {
      const start = six.indexOf(`CREATE FUNCTION ${schema}.${name}`), end = six.indexOf('$$;', start) + 3;
      await pool.query(six.slice(start, end));
    }
    await pool.query(`CREATE TRIGGER debo_contribution_integrity BEFORE INSERT OR UPDATE ON debo_batch_listings FOR EACH ROW EXECUTE FUNCTION ${schema}.debo_guard_contribution()`);
    await pool.query(`CREATE TRIGGER debo_listing_commitments BEFORE UPDATE ON produce_listings FOR EACH ROW EXECUTE FUNCTION ${schema}.debo_guard_listing()`);
    await pool.query(sqlFile('008_debo_stabilization.sql'));
    // Supports rerunning after 009 is applied to development: LIKE already copied columns/indexes.
    const installed = (await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='transactions' AND column_name='simulation_version'", [schema])).rowCount;
    let nine = sqlFile('009_simulated_transactions.sql');
    if (installed) {
      nine = nine.slice(nine.indexOf('ALTER TABLE transactions DROP CONSTRAINT transactions_payment_status_check;'));
      nine = `BEGIN;\n${nine}`;
      // LIKE copied the simulation-only unique index too.
      nine = nine.replace(/CREATE UNIQUE INDEX one_simulation_checkout_per_batch[\s\S]*?WHERE simulation_version='v1';/, '');
    }
    await pool.query(nine);
    if (process.env.WALLET_TEST === '1') await pool.query(sqlFile('011_demo_wallets.sql'));
    const localQuery = db => (sql, args) => db.query(sql.replaceAll('public.debo_available', `${schema}.debo_available`).replaceAll('public.recover_expired_checkouts', `${schema}.recover_expired_checkouts`), args);
    const adapter = { query: localQuery(pool), connect: async () => { const db = await pool.connect(); return { query: localQuery(db), release: () => db.release() }; } };
    require.cache[require.resolve('../src/config/db')].exports = adapter;
    process.env.NODE_ENV = 'test'; process.env.SIMULATED_PAYMENTS_ENABLED = 'true';
    const s = require('../src/modules/transactionsEscrow/simulation.service');
    const tx = require('../src/modules/transactionsEscrow/transaction.service');
    const debo = require('../src/modules/digitalDebo/debo.service');
    const listings = require('../src/modules/listings/listing.service');
    const users = [];
    for (const r of ['farmer', 'farmer', 'farmer', 'buyer', 'buyer', 'admin']) {
      const id = randomUUID(); users.push(id);
      await pool.query("INSERT INTO users(user_id,phone_number,role,hashed_password,full_name) VALUES($1,$2,$3,'test-only',$4)", [id, `test-${id}`, r, r]);
    }
    const [a, b, c, buyer, stranger, admin] = users;
    let wallet;
    if (process.env.WALLET_TEST === '1') {
      process.env.DEMO_WALLETS_ENABLED = 'true';
      wallet = require('../src/modules/transactionsEscrow/wallet.service');
      check((await wallet.summary(buyer)).available === '0.00', 'new buyer initializes with zero balance');
      await reject(wallet.topUp(a,{amount:'100',confirm_demo:true,idempotency_key:randomUUID()}),403,'farmer cannot top up');
      for (const amount of ['0','-1','1.001','1e3',100]) await reject(wallet.topUp(buyer,{amount,confirm_demo:true,idempotency_key:randomUUID()}),400,'invalid top-up rejected');
      await reject(wallet.topUp(buyer,{amount:'1000001',confirm_demo:true,idempotency_key:randomUUID()}),400,'per top-up cap enforced');
      await reject(wallet.topUp(buyer,{amount:'100',idempotency_key:randomUUID()}),400,'explicit confirmation required');
      process.env.DEMO_WALLETS_ENABLED='false';
      await reject(wallet.topUp(buyer,{amount:'100',confirm_demo:true,idempotency_key:randomUUID()}),503,'server-side wallet switch enforced');
      process.env.DEMO_WALLETS_ENABLED='true';
      const input={amount:'501000.00',confirm_demo:true,idempotency_key:randomUUID()};
      const results=await Promise.all([wallet.topUp(buyer,input),wallet.topUp(buyer,input)]);
      check(results[0].reference===results[1].reference && (await wallet.summary(buyer)).available==='501000.00','concurrent duplicate top-up credits once');
      await reject(wallet.topUp(buyer,{...input,amount:'1'}),409,'idempotency payload mismatch rejected');
      process.env.DEMO_WALLET_TOP_UPS_PER_HOUR='1';
      await reject(wallet.topUp(buyer,{...input,idempotency_key:randomUUID()}),429,'durable hourly top-up limit enforced');
      process.env.DEMO_WALLET_TOP_UPS_PER_HOUR='10';
    }
    const listing = (farmer, quantity, price = '5000', crop = 'Simulation Teff') => listings.createListing({
      crop_type: crop, variety: 'White', quantity, unit: 'quintal', price_per_unit: price, quality_grade: 'A',
      location_lat: 9.03, location_lng: 38.74, client_id: randomUUID(), operation_id: randomUUID() }, farmer);
    const purchase = (l, quantity, who = buyer, request = randomUUID()) => s.create({ buyer_id: who, listing_id: l.listing_id, quantity, payment_method: 'telebirr', request_id: request });
    const pay = t => s.pay(t.transaction_id, buyer, wallet ? { method:'demo_wallet', confirm_demo:true, idempotency_key:`checkout:${t.transaction_id}` } : { method:'telebirr' });
    const detail = t => s.details(t.transaction_id, buyer);
    const available = async l => Number((await listings.getListing(l.listing_id)).available_quantity);
    if (wallet) {
      // Exercise wallet integrity independently before the long QR regression.
      const owner=randomUUID();
      await pool.query("INSERT INTO users(user_id,phone_number,role,hashed_password,full_name) VALUES($1,$2,'buyer','test-only','Wallet integrity')",[owner,`test-${owner}`]);
      const first=await purchase(await listing(a,1,'100','Integrity first'),'1',owner);
      const second=await purchase(await listing(a,1,'100','Integrity second'),'1',owner);
      const input=()=>({method:'demo_wallet',confirm_demo:true,idempotency_key:randomUUID()});
      await reject(s.pay(first.transaction_id,owner,input()),409,'insufficient balance cannot fund checkout');
      check((await s.details(first.transaction_id,owner)).balances.paid==='0.00','insufficient balance leaves checkout unfunded');
      await wallet.topUp(owner,{amount:'100',confirm_demo:true,idempotency_key:randomUUID()});
      const spending=await Promise.allSettled([s.pay(first.transaction_id,owner,input()),s.pay(second.transaction_id,owner,input())]);
      check(spending.filter(x=>x.status==='fulfilled').length===1 && (await wallet.summary(owner)).available==='0.00','concurrent separate wallet checkouts cannot double-spend');
      const broken=await purchase(await listing(a,1,'10','Integrity rollback'),'1',owner);
      await wallet.topUp(owner,{amount:'10',confirm_demo:true,idempotency_key:randomUUID()});
      await pool.query(`CREATE FUNCTION ${schema}.wallet_reject_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='hold' THEN RAISE EXCEPTION 'wallet injected failure'; END IF; RETURN NEW; END $$`);
      await pool.query(`CREATE TRIGGER wallet_reject_hold BEFORE INSERT ON simulated_escrow_ledger FOR EACH ROW EXECUTE FUNCTION ${schema}.wallet_reject_hold()`);
      await assert.rejects(s.pay(broken.transaction_id,owner,input()),/wallet injected failure/);
      await pool.query('DROP TRIGGER wallet_reject_hold ON simulated_escrow_ledger');
      check((await wallet.summary(owner)).available==='10.00' && (await s.details(broken.transaction_id,owner)).payment_status==='pending','escrow failure rolls back wallet debit and payment status');
      const chosen=spending[0].status==='fulfilled'?first:second;
      await s.cancel(chosen.transaction_id,owner);
      await s.cancel(chosen.transaction_id,owner);
      check((await wallet.summary(owner)).available==='110.00','full wallet refund is credited once');
      const provider=await purchase(await listing(a,1,'5','Integrity provider'),'1',owner);
      await s.pay(provider.transaction_id,owner,{method:'cbe_birr'}); await s.cancel(provider.transaction_id,owner);
      check((await wallet.summary(owner)).available==='115.00','provider-funded refund is backed by escrow and credits virtual wallet');
      const report=await wallet.admin({});
      check(report.mismatches.length===0 && report.conservation.balanced,'wallet ledger and escrow conserve all virtual sources');
    }
    const la = await listing(a, 40), lb = await listing(b, 35, '5100'), lc = await listing(c, 25, '4900');
    const batch = await debo.createBatch(buyer, { crop_type: 'Simulation Teff', target_quantity: 100, unit: 'quintal', lat: 9.03, lng: 38.74, radius: 5000, request_id: randomUUID() });
    for (const [l, farmer, q] of [[la, a, 40], [lb, b, 35], [lc, c, 25]]) await debo.respond(batch.batch_id, l.listing_id, farmer, { action: 'accepted', quantity: q });
    const t = await s.create({ batch_id: batch.batch_id, buyer_id: buyer, payment_method: 'telebirr' });
    let d = await detail(t);
    check(t.amount === '501000.00' && d.allocations.length === 3 && t.farmer_id === null, 'multi-farmer checkout creates three allocations and exact total without a single payee');
    check(d.balances.held === '0.00' && t.payment_status === 'pending', 'checkout creation does not fund escrow');
    check((await s.create({ batch_id: batch.batch_id, buyer_id: buyer, payment_method: 'telebirr' })).transaction_id === t.transaction_id, 'batch checkout retry returns original');
    await reject(s.pay(t.transaction_id, stranger, { method: 'telebirr' }), 404, 'another buyer cannot pay');
    process.env.NODE_ENV = 'production';
    await reject(pay(t), 503, 'simulation is disabled in production even when flag is true');
    process.env.NODE_ENV = 'test';
    await Promise.all([pay(t), pay(t)]);
    d = await detail(t);
    check(d.balances.held === '501000.00' && d.allocations.every(x => x.ledger.length === 1), 'concurrent duplicate payment funds each allocation once');
    if (wallet) {
      check((await wallet.summary(buyer)).available==='0.00','multi-farmer checkout debits buyer exactly once');
      check((await wallet.summary(a)).available==='0.00' && (await wallet.summary(a)).pending==='200000.00','pending farmer allocation is not spendable');
      await reject(s.pay(t.transaction_id,buyer,{method:'telebirr'}),409,'provider cannot fund an already wallet-funded checkout');
    }
    const aa = d.allocations.find(x => x.farmer_id === a), ab = d.allocations.find(x => x.farmer_id === b), ac = d.allocations.find(x => x.farmer_id === c);
    await reject(s.settle(t.transaction_id, aa.allocation_id, a), 409, 'undelivered allocation cannot settle');
    await reject(s.issueQr(t.transaction_id, aa.allocation_id, b), 404, 'other farmer cannot issue QR');
    await s.ready(t.transaction_id, aa.allocation_id, a);
    let qr = await s.issueQr(t.transaction_id, aa.allocation_id, a);
    check(/^[A-Za-z0-9_-]{43}$/.test(qr.qr_token), 'delivery QR is cryptographically random and nonempty');
    const saved = (await pool.query('SELECT token_hash FROM delivery_verifications WHERE allocation_id=$1', [aa.allocation_id])).rows[0];
    check(saved.token_hash !== qr.qr_token && saved.token_hash === s.hash(qr.qr_token), 'only token digest is stored');
    const verify = (token = qr.qr_token, who = buyer, confirm = true) => s.verifyQr(t.transaction_id, aa.allocation_id, who, { qr_token: token, confirm_delivery: confirm });
    await s.ready(t.transaction_id, ab.allocation_id, b);
    await reject(s.verifyQr(t.transaction_id, ab.allocation_id, buyer, { qr_token: qr.qr_token, confirm_delivery: true }), 409, 'QR token cannot confirm another ready allocation');
    await reject(verify(qr.qr_token, stranger), 404, 'unauthorized scanner rejected');
    await reject(verify(qr.qr_token, buyer, false), 400, 'QR cannot bypass explicit delivery authorization');
    await reject(verify('x'.repeat(43)), 409, 'invalid token rejected');
    await pool.query("UPDATE delivery_verifications SET expires_at=now()-interval '1 minute' WHERE allocation_id=$1", [aa.allocation_id]);
    await reject(verify(), 409, 'expired QR rejected');
    const old = qr.qr_token;
    qr = await s.issueQr(t.transaction_id, aa.allocation_id, a);
    await reject(verify(old), 409, 'reissued QR revokes old token');
    await verify();
    await reject(verify(), 409, 'repeated QR scan cannot fulfill twice');
    d = await detail(t);
    check(d.balances.held === '501000.00' && d.allocations.find(x => x.farmer_id === a).delivery_status === 'delivered', 'QR confirmation alone does not release simulated funds');
    await Promise.all([s.settle(t.transaction_id, aa.allocation_id, a), s.settle(t.transaction_id, aa.allocation_id, buyer)]);
    d = await detail(t);
    check(d.balances.settled === '200000.00' && d.balances.held === '301000.00' && d.checkout_status === 'partially_completed', 'A settles independently while B and C remain held');
    if (wallet) check((await wallet.summary(a)).available==='200000.00','duplicate settlement credits farmer once atomically');
    check(await available(la) === 0 && await available(lb) === 0, 'fulfilled and unresolved reservations remain deducted');
    const dispute = await s.dispute(t.transaction_id, ac.allocation_id, buyer, { reason: 'poor_quality', description: 'Farmer reported grade does not match delivery.' });
    check((await s.dispute(t.transaction_id, ac.allocation_id, buyer, { reason: 'poor_quality', description: 'Farmer reported grade does not match delivery.' })).dispute_id === dispute.dispute_id, 'duplicate dispute submission returns existing unresolved case');
    await reject(s.dispute(t.transaction_id, ab.allocation_id, stranger, { reason: 'other', description: 'Unauthorized claim' }), 404, 'unauthorized buyer cannot dispute');
    await reject(s.settle(t.transaction_id, ac.allocation_id, c), 409, 'disputed allocation cannot settle');
    await reject(s.resolve(dispute.dispute_id, buyer, { decision: 'refund', note: 'Not an admin user.' }), 403, 'buyer cannot resolve dispute');
    await s.resolve(dispute.dispute_id, admin, { decision: 'review', note: 'Inspecting farmer and buyer evidence.' });
    await reject(s.resolve(dispute.dispute_id, admin, { decision: 'refund', amount: '122500.01', note: 'Refund exceeds funded allocation.' }), 409, 'refund cannot exceed held funds and rolls back');
    await s.resolve(dispute.dispute_id, admin, { decision: 'refund', note: 'Allocation quality claim upheld; full simulated refund.' });
    await s.resolve(dispute.dispute_id, admin, { decision: 'refund', note: 'Allocation quality claim upheld; full simulated refund.' });
    d = await detail(t);
    check(d.balances.refunded === '122500.00' && d.balances.held === '178500.00' && await available(lc) === 25 && await available(lb) === 0, 'admin refund is idempotent, audited and affects only C');
    if (wallet) check((await wallet.summary(buyer)).available==='122500.00' && (await wallet.summary(c)).available==='0.00','refund credits correct buyer once and never credits disputed farmer');
    check(d.history.some(x => x.actor_id === admin && x.action === 'dispute_decision'), 'admin identity and resolution retained in audit');
    const farmerView = await s.details(t.transaction_id, b);
    check(farmerView.allocations.length === 1 && !farmerView.amount && farmerView.balances.held === '178500.00', 'farmer sees only own allocations and financial history');

    const single = await listing(a, 10, '10.075', 'Single crop');
    const request = randomUUID();
    const one = await purchase(single, '1', buyer, request);
    check(one.amount === '10.08' && await available(single) === 9, 'single partial purchase preserves ETB 10.075 half-up policy and remaining quantity');
    check((await purchase(single, '1', buyer, request)).transaction_id === one.transaction_id, 'single purchase retry preserves reservation');
    await reject(purchase(single, '2', buyer, request), 409, 'idempotency key cannot change quantity');
    await pay(one);
    const oa = (await detail(one)).allocations[0];
    const od = await s.dispute(one.transaction_id, oa.allocation_id, buyer, { reason: 'incorrect_quantity', description: 'Request partial simulated price adjustment.' });
    await s.resolve(od.dispute_id, admin, { decision: 'refund', amount: '2.00', note: 'Partial simulated adjustment agreed by participants.' });
    check((await detail(one)).balances.held === '8.08' && await available(single) === 9, 'partial monetary refund retains physical reservation for unresolved delivery');
    if (wallet) check((await wallet.history(buyer)).items.some(e=>e.event_type==='buyer_refund' && e.amount==='2.00'),'partial refund appears in buyer immutable history');
    await s.ready(one.transaction_id, oa.allocation_id, a);
    const oq = await s.issueQr(one.transaction_id, oa.allocation_id, a);
    await s.verifyQr(one.transaction_id, oa.allocation_id, buyer, { qr_token: oq.qr_token, confirm_delivery: true });
    const od2 = await s.dispute(one.transaction_id, oa.allocation_id, buyer, { reason: 'other', description: 'Final adjustment or verified settlement decision.' });
    const race = await Promise.allSettled([
      s.resolve(od2.dispute_id, admin, { decision: 'settle', note: 'Verified delivery; settle remaining simulated funds.' }),
      s.resolve(od2.dispute_id, admin, { decision: 'refund', note: 'Refund remaining simulated funds after verification.' })
    ]);
    check(race.filter(x => x.status === 'fulfilled').length === 1, 'concurrent admin settlement/refund yields one decision, never double spend');
    const closed = await detail(one);
    check(closed.balances.held === '0.00' && await available(single) === 9, 'delivered physical stock is never restored by simulated refund');
    await assert.rejects(pool.query("INSERT INTO simulated_escrow_ledger(allocation_id,event_type,amount_minor,actor_id,idempotency_key) VALUES($1,'refund',999999,$2,'attack')", [oa.allocation_id, admin]), e => e.code === '23514');
    check(true, 'database independently rejects ledger overspend');
    await assert.rejects(pool.query('UPDATE transaction_allocations SET unit_price=99 WHERE allocation_id=$1', [oa.allocation_id]), e => e.code === '23514');
    check(true, 'database protects immutable agreed allocation terms');
    await assert.rejects(pool.query('DELETE FROM simulated_escrow_ledger WHERE allocation_id=$1', [oa.allocation_id]), e => e.code === '23514');
    check(true, 'ledger entries cannot be deleted');

    const expire = await purchase(single, '1');
    await pool.query("UPDATE transactions SET checkout_expires_at=now()-interval '1 second' WHERE transaction_id=$1", [expire.transaction_id]);
    await tx.recoverCheckouts();
    check((await detail(expire)).checkout_status === 'expired' && await available(single) === 9, '008 durable recovery releases expired unpaid reservation');
    await reject(pay(expire), 409, 'expired checkout cannot be resurrected');
    const ambiguous = await purchase(single, '1');
    await pool.query("UPDATE transactions SET checkout_status='reconciliation_required' WHERE transaction_id=$1", [ambiguous.transaction_id]);
    await reject(pay(ambiguous), 409, 'reconciliation-required payment protected');
    await reject(s.cancel(ambiguous.transaction_id, buyer), 409, 'reconciliation-required cancellation retains reservations');
    const failed = await purchase(single, '1');
    await s.pay(failed.transaction_id, buyer, { method: 'cbe_birr', outcome: 'failure' });
    check((await detail(failed)).payment_status === 'failed' && (await detail(failed)).balances.paid === '0.00', 'simulated failure releases reservation without funding ledger');
    const cancelled = await purchase(single, '1'); await pay(cancelled);
    await s.cancel(cancelled.transaction_id, buyer); await s.cancel(cancelled.transaction_id, buyer);
    check((await detail(cancelled)).balances.refunded === '10.08', 'paid cancellation records one simulated full refund');
    const stock = await listing(a, 1, '100', 'Concurrent crop');
    const attempts = await Promise.allSettled([purchase(stock, '1'), purchase(stock, '1', stranger)]);
    check(attempts.filter(x => x.status === 'fulfilled').length === 1 && await available(stock) === 0, 'concurrent direct purchases cannot oversell');
    // Inject failure after funding update: atomic rollback includes parent + ledger.
    const rollback = await purchase(single, '1');
    await pool.query(`CREATE FUNCTION ${schema}.reject_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected ledger failure'; END $$`);
    await pool.query(`CREATE TRIGGER reject_hold BEFORE INSERT ON simulated_escrow_ledger FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_hold()`);
    await assert.rejects(pay(rollback), /injected ledger failure/);
    check((await detail(rollback)).payment_status === 'pending' && (await detail(rollback)).balances.paid === '0.00', 'interrupted payment rolls back status and ledger atomically');
    await pool.query('DROP TRIGGER reject_hold ON simulated_escrow_ledger');
    const deliver = async (order, aid, farmer = a, who = buyer) => {
      await s.ready(order.transaction_id, aid, farmer);
      const q = await s.issueQr(order.transaction_id, aid, farmer);
      await s.verifyQr(order.transaction_id, aid, who, { qr_token: q.qr_token, confirm_delivery: true });
    };
    await pay(rollback);
    const rollbackAid = (await detail(rollback)).allocations[0].allocation_id;
    await deliver(rollback, rollbackAid);
    await pool.query(`CREATE FUNCTION ${schema}.reject_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.transaction_id='${rollback.transaction_id}' AND NEW.checkout_status='completed' THEN RAISE EXCEPTION 'injected settlement failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER reject_completion BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_completion()`);
    await assert.rejects(s.settle(rollback.transaction_id, rollbackAid, a), /injected settlement failure/);
    check((await detail(rollback)).balances.settled === '0.00' && (await detail(rollback)).allocations[0].delivery_status === 'delivered', 'interrupted settlement rolls back ledger and parent but preserves prior verified delivery');
    await pool.query('DROP TRIGGER reject_completion ON transactions');
    await s.settle(rollback.transaction_id, rollbackAid, a);
    check((await detail(rollback)).checkout_status === 'completed' && (await detail(rollback)).balances.settled === '10.08', 'single-farmer purchase completes and interrupted settlement safely retries');
    await assert.rejects(pool.query('UPDATE transactions SET total_minor=total_minor+1 WHERE transaction_id=$1', [rollback.transaction_id]), e => e.code === '23514');
    check(true, 'deferred database constraint rejects unreconciled checkout totals');
    const sharedListing = await listing(a, 10, '100', 'Shared new workflow');
    const sharedSix = await purchase(sharedListing, '6');
    const sharedFour = await purchase(sharedListing, '4', stranger);
    await pay(sharedSix); await s.pay(sharedFour.transaction_id, stranger, { method: 'telebirr' });
    const sharedAid = (await detail(sharedSix)).allocations[0].allocation_id;
    await deliver(sharedSix, sharedAid); await s.settle(sharedSix.transaction_id, sharedAid, a);
    check((await listings.getListing(sharedListing.listing_id)).status === 'available' && await available(sharedListing) === 0, 'new allocation fulfillment preserves shared-listing pending reservations without marking sold');
    const fourAid = (await s.details(sharedFour.transaction_id, stranger)).allocations[0].allocation_id;
    await deliver(sharedFour, fourAid, a, stranger); await s.settle(sharedFour.transaction_id, fourAid, a);
    check((await listings.getListing(sharedListing.listing_id)).status === 'sold', 'new shared listing becomes sold only when all quantity is fulfilled');
    // Real routes, validation, ownership and database roles; only remote Supabase
    // token verification is replaced with fixture identities (not real OTP E2E).
    require.cache[require.resolve('../src/middleware/auth')] = { exports: (req, res, next) => {
      const id = req.headers.authorization?.replace('Bearer ', '');
      if (!users.includes(id)) return res.status(401).json({ error: 'Unauthorized' });
      req.user = { id }; next();
    } };
    const express = require('express'), http = require('supertest'), app = express();
    app.use(express.json());
    app.use('/api/transactions', require('../src/modules/transactionsEscrow/transaction.routes'));
    if (wallet) app.use('/api/wallet', require('../src/modules/transactionsEscrow/wallet.routes'));
    app.use('/api/admin', require('../src/modules/admin/admin.routes'));
    app.use(require('../src/middleware/errorHandler'));
    const call = (path, actor, body) => http(app).post(path).set('Authorization', `Bearer ${actor}`).send(body);
    check((await http(app).get('/api/transactions')).status === 401, 'transaction API requires authentication');
    check((await call('/api/transactions/initiate', a, { listing_id: single.listing_id, payment_method: 'telebirr' })).status === 403, 'farmer cannot invoke buyer checkout route');
    const routeListing = await listing(a, 5, '100', 'HTTP crop');
    const created = await call('/api/transactions/initiate', buyer, { listing_id: routeListing.listing_id, quantity: '2', payment_method: 'cbe_birr', amount: '0.01', paid: true, request_id: randomUUID() });
    check(created.status === 201 && created.body.transaction.amount === '200.00' && created.body.transaction.payment_status === 'pending', 'HTTP checkout ignores forged amount and paid flag');
    const rid = created.body.transaction.transaction_id;
    check((await call(`/api/transactions/${rid}/simulate-payment`, stranger, { method: 'cbe_birr' })).status === 404, 'HTTP payment enforces ownership');
    check((await call(`/api/transactions/${rid}/simulate-payment`, buyer, { method: 'cbe_birr' })).body.payment_status === 'simulated_paid', 'HTTP simulated payment route funds authoritative amount');
    const rd = await s.details(rid, buyer), ra = rd.allocations[0].allocation_id;
    check((await call(`/api/transactions/${rid}/allocations/${ra}/ready`, a, {})).status === 200, 'farmer HTTP ready action succeeds');
    const rq = await call(`/api/transactions/${rid}/allocations/${ra}/qr`, a, {});
    check(rq.status === 200 && rq.body.qr_token.length === 43, 'farmer HTTP QR generation succeeds');
    check((await call(`/api/transactions/${rid}/allocations/${ra}/verify-delivery`, buyer, { qr_token: rq.body.qr_token, confirm_delivery: true })).status === 200, 'buyer HTTP delivery verification succeeds');
    const dd = await call(`/api/transactions/${rid}/allocations/${ra}/disputes`, buyer, { reason: 'poor_quality', description: 'Quality inspection needs an admin review.' });
    check(dd.status === 200 && dd.body.status === 'open', 'HTTP dispute submission succeeds before settlement');
    check((await call(`/api/transactions/${rid}/allocations/${ra}/settle`, a, {})).status === 409, 'HTTP settlement cannot bypass unresolved dispute');
    check((await call(`/api/admin/disputes/${dd.body.dispute_id}/resolve`, stranger, { decision: 'refund', note: 'Not authorized to resolve this claim.' })).status === 403, 'admin resolution route rejects buyer');
    check((await call(`/api/admin/disputes/${dd.body.dispute_id}/resolve`, admin, { decision: 'refund', note: 'Full simulated refund approved after investigation.' })).status === 200, 'admin HTTP resolution updates ledger atomically');
    check((await http(app).get(`/api/admin/transactions/${rid}`).set('Authorization', `Bearer ${admin}`)).body.balances.refunded === '200.00', 'admin details expose allocation refund and audit history');
    check((await call('/api/transactions/webhooks/telebirr', buyer, { transaction_id: rid, status: 'completed' })).status === 503 && (await s.details(rid, buyer)).payment_status === 'refunded', 'unsigned callback cannot resurrect refunded transaction');
    check((await call(`/api/transactions/${rid}/release`, buyer, { qr_token: rq.body.qr_token })).status === 410, 'legacy reusable QR release route is disabled');
    check((await http(app).get('/api/transactions/not-a-uuid').set('Authorization', `Bearer ${buyer}`)).status === 400, 'invalid route IDs return validation error rather than SQL error');
    if (wallet) {
      check((await http(app).get('/api/wallet')).status===401,'wallet API rejects missing authentication');
      check((await call('/api/wallet/top-ups',a,{amount:'100',confirm_demo:true,idempotency_key:randomUUID()})).status===403,'wallet API rejects farmer top-up');
      check((await http(app).get('/api/wallet/admin').set('Authorization',`Bearer ${buyer}`)).status===403,'buyer cannot inspect admin wallet summaries');
      check((await http(app).get(`/api/wallet/checkouts/${t.transaction_id}`).set('Authorization',`Bearer ${stranger}`)).status===404,'wallet quote enforces buyer ownership');
      const poor=await purchase(await listing(a,2,'100','Wallet concurrency'),'1',stranger);
      const poor2=await purchase(await listing(a,2,'100','Wallet concurrency two'),'1',stranger);
      const funding={method:'demo_wallet',confirm_demo:true,idempotency_key:randomUUID()};
      await reject(s.pay(poor.transaction_id,stranger,funding),409,'insufficient wallet balance rejects checkout');
      check((await s.details(poor.transaction_id,stranger)).balances.paid==='0.00','insufficient funding leaves escrow and status unchanged');
      await wallet.topUp(stranger,{amount:'100',confirm_demo:true,idempotency_key:randomUUID()});
      const concurrent=await Promise.allSettled([s.pay(poor.transaction_id,stranger,funding),s.pay(poor2.transaction_id,stranger,{...funding,idempotency_key:randomUUID()})]);
      check(concurrent.filter(r=>r.status==='fulfilled').length===1 && (await wallet.summary(stranger)).available==='0.00','concurrent spending across checkouts cannot overdraw');
      const previous=require.cache[require.resolve('../src/modules/transactionsEscrow/wallet.service')];
      delete require.cache[require.resolve('../src/modules/transactionsEscrow/wallet.service')];
      check((await require('../src/modules/transactionsEscrow/wallet.service').summary(stranger)).available==='0.00','wallet balance persists across service reload');
      require.cache[require.resolve('../src/modules/transactionsEscrow/wallet.service')]=previous;
      const broken=await purchase(await listing(a,2,'10','Wallet rollback'),'1',stranger);
      await wallet.topUp(stranger,{amount:'10',confirm_demo:true,idempotency_key:randomUUID()});
      await pool.query(`CREATE TRIGGER reject_hold BEFORE INSERT ON simulated_escrow_ledger FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_hold()`);
      await assert.rejects(s.pay(broken.transaction_id,stranger,{...funding,idempotency_key:randomUUID()}),/injected ledger failure/);
      check((await wallet.summary(stranger)).available==='10.00' && (await s.details(broken.transaction_id,stranger)).payment_status==='pending','failed escrow hold atomically rolls back wallet debit');
      await pool.query('DROP TRIGGER reject_hold ON simulated_escrow_ledger');
      const audit=await wallet.admin({});
      check(audit.mismatches.length===0 && audit.conservation.balanced,'all wallet balances plus held escrow reconcile with virtual sources');
      check((await http(app).get('/api/wallet/admin').set('Authorization',`Bearer ${admin}`)).status===200,'admin read-only reconciliation API works');
      const w=(await pool.query('SELECT wallet_id FROM demo_wallet_accounts WHERE owner_id=$1',[a])).rows[0];
      await assert.rejects(pool.query("INSERT INTO demo_wallet_entries(wallet_id,event_type,amount_minor,idempotency_key) VALUES($1,'demo_top_up',100,'invalid-farmer-topup')",[w.wallet_id]),e=>e.code==='23514');
      check(true,'database independently forbids farmer top-up');
      await assert.rejects(pool.query('DELETE FROM demo_wallet_entries WHERE wallet_id=$1',[w.wallet_id]),e=>e.code==='23514');
      check(true,'wallet history cannot be deleted');
    }
    await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO authenticated`);
    const restricted = await pool.connect();
    try {
      for (const table of ['transaction_allocations','simulated_escrow_ledger','delivery_verifications','transaction_disputes','transaction_audit',...(wallet?['demo_wallet_accounts','demo_wallet_entries']:[])]) {
        await restricted.query('BEGIN'); await restricted.query('SET LOCAL ROLE authenticated');
        await assert.rejects(restricted.query(`SELECT * FROM ${table}`), e => e.code === '42501');
        await restricted.query('ROLLBACK');
      }
      check(true, 'authenticated database clients cannot bypass API or read QR digests and financial tables');
    } finally { restricted.release(); }
    console.log(`\n${checks} real database checks passed (schema ${schema}).`);
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally {
    if (pool) await pool.end();
    await original.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await original.end();
  }
})();
