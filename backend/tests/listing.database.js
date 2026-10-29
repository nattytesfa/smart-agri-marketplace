// Uses the configured PostgreSQL/PostGIS connection, but rolls back ALL schema,
// RLS, storage-bucket and fixture changes. Never commits against the configured DB.
// LIVE_STORAGE_TEST=1 also uploads a temporary photo and removes it in finally.
const assert = require('assert').strict;
const fs = require('fs');
const { randomUUID } = require('crypto');
const pool = require('../src/config/db');

(async () => {
  const db = await pool.connect();
  const storageCleanup = [];
  let checks = 0;
  const check = (value, message) => { assert(value, message); checks++; console.log(`PASS ${message}`); };
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'");
    const installed = (await db.query("SELECT 1 FROM pg_constraint WHERE conrelid='produce_listings'::regclass AND conname='listings_required_details'")).rowCount > 0;
    if (!installed) await db.query(fs.readFileSync(require.resolve('../db/migrations/005_produce_listing.sql'),'utf8'));
    check(true, installed ? 'applied migration detected; testing installed schema' : 'additive migration executes against actual schema');
    const fixtures = [];
    for (const role of ['farmer','farmer','buyer','admin']) {
      const id = randomUUID(); fixtures.push(id);
      await db.query(`INSERT INTO users(user_id,phone_number,role,hashed_password,full_name) VALUES($1,$2,$3,'test-only','Test Farmer')`, [id,`test-${id}`,role]);
    }
    // Service transactions become nested savepoints within this outer rollback.
    const wrapped = { query: async (sql, args) => {
      if (sql === 'BEGIN') return db.query('SAVEPOINT service_operation');
      if (sql === 'COMMIT') return db.query('RELEASE SAVEPOINT service_operation');
      if (sql === 'ROLLBACK') return db.query('ROLLBACK TO SAVEPOINT service_operation');
      return db.query(sql,args);
    }, release() {} };
    require.cache[require.resolve('../src/config/db')].exports = { query: (sql,args) => db.query(sql,args), connect: async () => wrapped };
    const s = require('../src/modules/listings/listing.service');
    const farmer = fixtures[0];
    const payload = { client_id: randomUUID(), operation_id: randomUUID(), crop_type: 'Test Teff', variety: 'White', quantity: 5, price_per_unit: 2000, unit: 'quintal', kebele: 'Test Kebele' };
    const a = await s.createListing(payload,farmer);
    check(a.listing_id && !a.image_url && !a.harvest_date && a.kebele === 'Test Kebele', 'required-only manual listing accepts null optional fields');
    const again = await s.createListing(payload,farmer);
    check(a.listing_id === again.listing_id, 'create retry is idempotent');
    const fractional = await s.createListing({...payload,client_id:randomUUID(),crop_type:'Fractional crop',quantity:0.001,price_per_unit:0.001},farmer);
    check(+fractional.quantity===0.001 && +fractional.price_per_unit===0.001,'positive fractional values do not round to zero');
    const optional = { ...payload,client_id: randomUUID(),location_lat: 9.032,location_lng: 38.742, harvest_date: '2026-01-01',quality_grade: 'A',description: 'Fresh\nጤፍ',image_url: 'https://example.com/image.jpg' };
    const b = await s.createListing(optional,farmer);
    check(b.lat === 9.032 && b.lng === 38.742 && b.quality_grade === 'A' && b.description === optional.description, 'GPS axes and optional fields round trip');
    const nearby = await s.getAvailableListings({crop_type:'Test Teff', lat:9.032,lng:38.742,radius:1000});
    check(nearby.length === 1 && nearby[0].listing_id === b.listing_id && nearby[0].distance_meters < 1, 'meter radius excludes manual Kebele locations');
    check((await s.getAvailableListings({crop_type:'Test Teff',min_price:2100})).length === 0,'price filtering');
    check((await s.getAvailableListings({crop_type:'Test Teff',quality_grade:'A'})).length === 1,'quality filtering');
    check((await s.getAvailableListings({crop_type:'Test Teff',limit:1,offset:1})).length === 1,'pagination');
    check((await s.getFarmerListings(farmer)).length === 3,'farmer retrieval');
    const edit = { ...payload, quantity: 6,version:a.version,operation_id:randomUUID() };
    const updated = await s.updateListing(a.listing_id,edit,farmer);
    check(updated.quantity === '6.00' || +updated.quantity === 6,'update operation');
    check((await s.updateListing(a.listing_id,edit,farmer)).version === updated.version,'lost update response can be replayed');
    await assert.rejects(s.updateListing(a.listing_id,{...edit,operation_id:randomUUID()},farmer), {status:409}); checks++; console.log('PASS stale version conflict');
    await assert.rejects(s.updateListing(a.listing_id,{...edit,version:updated.version},fixtures[1]),{status:403}); checks++; console.log('PASS ownership enforced');
    const batch = await s.createListingsBatch([{...payload,client_id:randomUUID()}, {...payload,client_id:randomUUID(),quantity:-1}],farmer);
    check(batch.synced.length===1 && batch.failed.length===1,'bulk partial failures preserve successful records');
    const deleted = await s.deleteListing(a.listing_id,farmer,updated.version);
    check(deleted.listing_id===a.listing_id && !await s.getListing(a.listing_id),'soft deletion hides listing');
    await assert.rejects(s.createListing(payload,farmer),{status:409}); checks++; console.log('PASS deleted client ID cannot resurrect listing');
    const debo = require('../src/modules/digitalDebo/debo.service');
    const reservation = await debo.createBatch(fixtures[2],[b.listing_id],optional.crop_type);
    check(reservation.total_quantity===5 && (await s.getListing(b.listing_id)).status==='reserved','Digital Debo reserves with actual server quantities');
    await assert.rejects(debo.createBatch(fixtures[2],[b.listing_id],optional.crop_type),{status:409}); checks++; console.log('PASS duplicate reservation prevented');
    await assert.rejects(s.updateListing(b.listing_id,{...optional,version:2,operation_id:randomUUID()},farmer),{status:409}); checks++; console.log('PASS reserved listing cannot be edited');
    const t = require('../src/modules/transactionsEscrow/transaction.service');
    const sellable = await s.createListing({...payload,client_id:randomUUID()},farmer);
    const transaction = await t.createTransaction({listing_id:sellable.listing_id,buyer_id:fixtures[2],farmer_id:fixtures[1],amount:1,payment_method:'telebirr'});
    check(transaction.amount===10000 && (await s.getListing(sellable.listing_id)).status==='reserved','purchase derives amount/owner and reserves listing');
    await assert.rejects(t.createTransaction({listing_id:sellable.listing_id,buyer_id:fixtures[2],payment_method:'telebirr'}),{status:409}); checks++; console.log('PASS overselling blocked');
    await t.releaseEscrow(transaction.transaction_id);
    check((await s.getListing(sellable.listing_id)).status==='sold','escrow fulfillment marks produce sold');

    // Real routes, validation, RBAC, controllers and PostgreSQL. Only token
    // verification is substituted with fixture identities; auth has separate unit tests.
    require.cache[require.resolve('../src/middleware/auth')] = { exports: (req,res,next) => {
      const id = req.headers.authorization?.replace('Bearer ','');
      if (!fixtures.includes(id)) return res.status(401).json({error:'Test token required'});
      req.user={id}; next();
    }};
    const express=require('express'), request=require('supertest');
    const app=express();app.use(express.json());
    app.use('/api/listings',require('../src/modules/listings/listing.routes'));
    app.use('/api/admin',require('../src/modules/admin/admin.routes'));
    app.use(require('../src/middleware/errorHandler'));
    const httpPayload={...payload,client_id:randomUUID(),operation_id:randomUUID(),crop_type:'HTTP Teff'};
    const created=await request(app).post('/api/listings').set('Authorization',`Bearer ${farmer}`).send(httpPayload);
    check(created.status===201 && created.body.listing.image_url===null,'HTTP farmer creates image-free listing in PostgreSQL');
    const replay=await request(app).post('/api/listings/sync').set('Authorization',`Bearer ${farmer}`).send({listings:[httpPayload]});
    check(replay.status===201 && replay.body.synced[0].listing_id===created.body.listing.listing_id,'HTTP bulk retry reconciles the same server ID');
    const market=await request(app).get('/api/listings?search=HTTP%20Teff').set('Authorization',`Bearer ${fixtures[2]}`);
    check(market.status===200 && market.body.length===1 && !('farmer_phone' in market.body[0]),'HTTP buyer discovers listing without sensitive farmer identity');
    const details=await request(app).get('/api/listings/'+created.body.listing.listing_id).set('Authorization',`Bearer ${fixtures[2]}`);
    check(details.status===200 && details.body.listing.variety==='White','HTTP buyer opens listing details');
    if (process.env.LIVE_STORAGE_TEST === '1') {
      const withImage = {...httpPayload,client_id:randomUUID(),operation_id:randomUUID(),crop_type:'HTTP Image Teff',harvest_date:'2026-01-01',quality_grade:'B',description:'ጤፍ\nFresh produce'};
      const photoListing=await request(app).post('/api/listings').set('Authorization',`Bearer ${farmer}`).send(withImage);
      check(photoListing.status===201,'HTTP optional-details listing is saved before image upload');
      const photoId=photoListing.body.listing.listing_id, imageId=randomUUID();
      storageCleanup.push(`${farmer}/${photoId}/${imageId}.png`);
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
      const uploaded=await request(app).post(`/api/listings/${photoId}/images/${imageId}`).set('Authorization',`Bearer ${farmer}`).attach('image',png,'crop.png');
      check(uploaded.status===200 && !!uploaded.body.image_url,'HTTP image uploads to actual Supabase Storage');
      const linked=await request(app).put('/api/listings/'+photoId).set('Authorization',`Bearer ${farmer}`).send({...withImage,version:1,operation_id:imageId,image_url:uploaded.body.image_url});
      check(linked.status===200 && linked.body.listing.image_url===uploaded.body.image_url,'HTTP image reference is linked in PostgreSQL');
      const buyerPhoto=await request(app).get('/api/listings?crop_type=HTTP%20Image%20Teff&quality_grade=B').set('Authorization',`Bearer ${fixtures[2]}`);
      check(buyerPhoto.status===200 && buyerPhoto.body.length===1 && buyerPhoto.body[0].description===withImage.description,'HTTP buyer finds image listing with optional harvest/grade/description');
    }
    const forbidden=await request(app).post('/api/listings').set('Authorization',`Bearer ${fixtures[2]}`).send({...httpPayload,client_id:randomUUID()});
    check(forbidden.status===403,'HTTP buyer cannot create a farmer listing');
    const admin=await request(app).get('/api/admin/listings').set('Authorization',`Bearer ${fixtures[3]}`);
    check(admin.status===200 && admin.body.some(l=>l.listing_id===created.body.listing.listing_id),'HTTP admin monitors listing');
    const moderated=await request(app).delete('/api/admin/listings/'+created.body.listing.listing_id).set('Authorization',`Bearer ${fixtures[3]}`);
    check(moderated.status===200 && !await s.getListing(created.body.listing.listing_id),'HTTP admin moderation hides listing without deleting history');

    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [fixtures[2]]);
    check((await db.query('SELECT 1 FROM produce_listings WHERE listing_id=$1',[sellable.listing_id])).rowCount===0,'RLS hides sold produce from buyer direct reads');
    check((await db.query("UPDATE produce_listings SET status='available' WHERE listing_id=$1",[sellable.listing_id])).rowCount===0,'RLS prevents direct listing writes');
    check((await db.query("UPDATE users SET role='admin' WHERE user_id=$1",[fixtures[2]])).rowCount===0,'RLS prevents client role escalation');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [fixtures[0]]);
    check((await db.query('SELECT 1 FROM produce_listings WHERE listing_id=$1',[sellable.listing_id])).rowCount===1,'RLS allows farmer own listing reads');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [fixtures[3]]);
    check((await db.query('SELECT 1 FROM produce_listings WHERE listing_id=$1',[sellable.listing_id])).rowCount===1,'RLS preserves admin dashboard listing reads');
    check((await db.query('SELECT 1 FROM users WHERE user_id=ANY($1::uuid[])',[fixtures])).rowCount===fixtures.length,'RLS preserves authorized admin user reads');
    await db.query('RESET ROLE');
    console.log(`${checks} database checks passed. Rolling back all changes.`);
  } finally {
    await db.query('ROLLBACK'); db.release(); await pool.end();
    if (storageCleanup.length) {
      const {error}=await require('../src/config/supabaseClient').storage.from('produce-images').remove(storageCleanup);
      if (error) throw new Error('Could not clean up live storage test image: '+error.message);
      console.log('Removed temporary live-storage test images.');
    }
  }
})().catch(e => { console.error(e); process.exitCode=1; });
