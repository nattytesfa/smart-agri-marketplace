// Real PostGIS, real routes and independent concurrent connections. All committed
// fixtures live in a unique disposable schema, never in application tables.
const assert=require('assert').strict;
const fs=require('fs');
const {randomUUID}=require('crypto');
const {Pool}=require('pg');
const original=require('../src/config/db');
const config=require('../src/config/env');
const schema=`debo_test_${randomUUID().replaceAll('-','')}`;
let pool,checks=0;
const check=(ok,message)=>{assert(ok,message);checks++;console.log(`PASS ${message}`);};
const reject=async(p,status,message)=>{await assert.rejects(p,{status});check(true,message);};
(async()=>{
 try {
  await original.query(`CREATE SCHEMA ${schema}`);
  for(const table of ['users','produce_listings','digital_debo_batches','debo_batch_listings','transactions']) {
    await original.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
  }
  pool=new Pool({connectionString:config.databaseUrl,ssl:{rejectUnauthorized:false},max:4,idleTimeoutMillis:0,
    keepAlive:true,connectionTimeoutMillis:30000,query_timeout:45000,
    statement_timeout:30000,lock_timeout:5000,options:`-c search_path=${schema},public`});
  const installed=(await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='debo_batch_listings' AND column_name='proposed_quantity'",[schema])).rowCount;
  if(!installed) await pool.query(fs.readFileSync(require.resolve('../db/migrations/006_digital_debo.sql'),'utf8').replaceAll(/\bpublic\b/g,schema));
  else {
    // LIKE does not copy triggers/functions; install schema-local ledger functions.
    const sql=fs.readFileSync(require.resolve('../db/migrations/006_digital_debo.sql'),'utf8').replaceAll(/\bpublic\b/g,schema);
    for(const name of ['debo_guard_contribution','debo_available','debo_guard_listing']) {
      const start=sql.indexOf(`CREATE FUNCTION ${schema}.${name}`), end=sql.indexOf('$$;',start)+3;
      await pool.query(sql.slice(start,end));
    }
    await pool.query(`CREATE TRIGGER debo_contribution_integrity BEFORE INSERT OR UPDATE ON debo_batch_listings FOR EACH ROW EXECUTE FUNCTION ${schema}.debo_guard_contribution()`);
    await pool.query(`CREATE TRIGGER debo_listing_commitments BEFORE UPDATE ON produce_listings FOR EACH ROW EXECUTE FUNCTION ${schema}.debo_guard_listing()`);
    await pool.query(sql.slice(sql.indexOf('-- API-only access')));
  }
  await pool.query(fs.readFileSync(require.resolve('../db/migrations/007_debo_transaction_security.sql'),'utf8'));
  await pool.query(fs.readFileSync(require.resolve('../db/migrations/008_debo_stabilization.sql'),'utf8').replaceAll(/\bpublic\b/g,schema));
  // Services explicitly qualify the ledger helper to public; rewrite only that
  // reference on the test pool so every operation stays inside the test schema.
  const localQuery=(db)=>(sql,args)=>db.query(sql.replaceAll('public.debo_available',`${schema}.debo_available`).replaceAll('public.recover_expired_checkouts',`${schema}.recover_expired_checkouts`),args);
  const adapter={query:localQuery(pool),connect:async()=>{const db=await pool.connect();return {query:localQuery(db),release:()=>db.release()};}};
  require.cache[require.resolve('../src/config/db')].exports=adapter;
  const s=require('../src/modules/digitalDebo/debo.service');
  const listings=require('../src/modules/listings/listing.service');
  const transactions=require('../src/modules/transactionsEscrow/transaction.service');
  const users=[];
  for(const role of ['farmer','farmer','farmer','farmer','buyer','buyer','admin']) {
    const id=randomUUID();users.push(id);
    await pool.query("INSERT INTO users(user_id,phone_number,role,hashed_password,full_name) VALUES($1,$2,$3,'test-only',$4)",[id,`test-${id}`,role,role]);
  }
  const [a,b,c,other,buyer,buyer2,admin]=users;
  const base={crop_type:'Defense Teff',variety:'White',unit:'quintal',price_per_unit:2000,quality_grade:'A',location_lat:9.03,location_lng:38.74};
  const list=async(farmer,q,changes={})=>listings.createListing({...base,quantity:q,client_id:randomUUID(),operation_id:randomUUID(),...changes},farmer);
  const req=(changes={})=>({crop_type:base.crop_type,target_quantity:100,unit:'quintal',lat:9.03,lng:38.74,radius:5000,request_id:randomUUID(),...changes});
  const la=await list(a,40),lb=await list(b,35,{price_per_unit:2100}),lc=await list(c,25,{price_per_unit:2200});
  await list(other,100,{crop_type:'Wheat'});
  await list(other,100,{variety:'Red'});
  await list(other,100,{quality_grade:'B'});
  await list(other,100,{location_lat:10});
  await list(other,100,{location_lat:null,location_lng:null,kebele:'Manual only'});
  const sold=await list(other,100);await pool.query("UPDATE produce_listings SET status='sold' WHERE listing_id=$1",[sold.listing_id]);
  const criteria=req({variety:'White',quality_grade:'A'});
  const preview=await s.preview(criteria);
  check(preview.listings.length===3 && preview.total_quantity===100,'PostGIS excludes wrong crops/varieties/grades, sold, far and manual-only listings');
  check(preview.listings.every(l=>l.distance_meters<1),'PostGIS longitude X / latitude Y and meter distances');
  const batch=await s.createBatch(buyer,criteria);
  check(batch.status==='pending' && batch.reserved_quantity===0 && batch.proposed_quantity===100,'100-quintal proposal does not reserve or mark filled');
  check((await s.createBatch(buyer,criteria)).batch_id===batch.batch_id,'duplicate request ID returns original batch');
  await reject(s.createBatch(buyer,{...criteria,target_quantity:101}),409,'same request ID cannot change criteria');
  await reject(s.getBatchDetails(batch.batch_id,buyer2),404,'other buyer cannot inspect batch');
  await reject(s.respond(batch.batch_id,la.listing_id,b,{action:'accepted',quantity:40}),404,'only listing owner may confirm');
  await reject(s.respond(batch.batch_id,la.listing_id,a,{action:'accepted',quantity:41}),400,'confirmation cannot exceed proposed amount');
  await Promise.all([s.respond(batch.batch_id,la.listing_id,a,{action:'accepted',quantity:40}),s.respond(batch.batch_id,la.listing_id,a,{action:'accepted',quantity:40})]);
  check((await s.getBatchDetails(batch.batch_id,buyer)).reserved_quantity===40,'concurrent repeated acceptance reserves a contribution exactly once');
  for(const [l,farmer,q] of [[lb,b,35],[lc,c,25]])await s.respond(batch.batch_id,l.listing_id,farmer,{action:'accepted',quantity:q});
  const filled=await s.getBatchDetails(batch.batch_id,buyer);
  check(filled.status==='filled' && filled.reserved_quantity===100 && filled.completion_percentage===100,'40 + 35 + 25 explicit farmer confirmations fill batch');
  check(filled.confirmed_total==='208500.00','server preserves different farmer prices and computes exact total');
  await s.respond(batch.batch_id,la.listing_id,a,{action:'accepted',quantity:40});
  check((await s.getBatchDetails(batch.batch_id,buyer)).reserved_quantity===100,'repeat confirmation is idempotent');
  check((await listings.getAvailableListings({crop_type:base.crop_type,quality_grade:'A'})).every(l=>![la.listing_id,lb.listing_id,lc.listing_id].includes(l.listing_id)),'fully reserved listings disappear from buyer marketplace');
  await reject(listings.updateListing(la.listing_id,{...base,quantity:50,version:2,operation_id:randomUUID()},a),409,'farmers cannot edit committed listings');
  await reject(listings.deleteListing(la.listing_id,a,2),409,'committed listings cannot be deleted');
  await reject(transactions.createTransaction({listing_id:la.listing_id,buyer_id:buyer2,payment_method:'telebirr'}),409,'direct whole-listing purchase cannot consume Debo commitments');
  await reject(transactions.createTransaction({batch_id:batch.batch_id,buyer_id:buyer,payment_method:'telebirr'}),409,'multi-payee transaction fails closed instead of paying first farmer');
  await s.closeBatch(batch.batch_id,buyer);
  check(Number((await listings.getListing(la.listing_id)).available_quantity)===40,'cancellation releases confirmed reservation');

  // Two buyers propose overlapping stock. Different connections race to confirm.
  const overlap=await list(a,10,{crop_type:'Race crop'});
  const raceReq=req({crop_type:'Race crop',target_quantity:8});
  const r1=await s.createBatch(buyer,raceReq),r2=await s.createBatch(buyer2,{...raceReq,request_id:randomUUID()});
  const race=await Promise.allSettled([s.respond(r1.batch_id,overlap.listing_id,a,{action:'accepted',quantity:8}),s.respond(r2.batch_id,overlap.listing_id,a,{action:'accepted',quantity:8})]);
  check(race.filter(r=>r.status==='fulfilled').length===1,'independent concurrent confirmations allow only one overlapping reservation');
  check(Number((await listings.getListing(overlap.listing_id)).available_quantity)===2,'reservations never exceed total stock');
  const losingBatch=race[0].status==='rejected' ? r1:r2;
  await assert.rejects(pool.query("UPDATE debo_batch_listings SET participation_status='accepted',confirmed_quantity=8,reservation_status='active',confirmed_at=now() WHERE batch_id=$1 AND listing_id=$2",[losingBatch.batch_id,overlap.listing_id]),e=>e.code==='23514');
  check(true,'database trigger independently rejects overcommitment even outside the service');
  check((await listings.getAvailableListings({crop_type:'Race crop'}))[0].quantity==='2' || Number((await listings.getAvailableListings({crop_type:'Race crop'}))[0].quantity)===2,'marketplace displays unreserved quantity for partial reservations');
  for(const r of [r1,r2])await s.closeBatch(r.batch_id,r.target_buyer_id);

  const rollbackBatch=await s.createBatch(buyer,req({crop_type:'Race crop',target_quantity:8}));
  await pool.query(`CREATE FUNCTION ${schema}.test_fail_fill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.batch_id='${rollbackBatch.batch_id}' AND NEW.status='filled' THEN RAISE EXCEPTION 'Injected failure after contribution update'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER test_fail_fill BEFORE UPDATE ON digital_debo_batches FOR EACH ROW EXECUTE FUNCTION ${schema}.test_fail_fill()`);
  await assert.rejects(s.respond(rollbackBatch.batch_id,overlap.listing_id,a,{action:'accepted',quantity:8}),/Injected failure/);
  check((await s.getBatchDetails(rollbackBatch.batch_id,buyer)).reserved_quantity===0 && Number((await listings.getListing(overlap.listing_id)).available_quantity)===10,'database failure after contribution write rolls back reservation and batch together');
  await pool.query('DROP TRIGGER test_fail_fill ON digital_debo_batches');
  await pool.query(`DROP FUNCTION ${schema}.test_fail_fill()`);
  await s.closeBatch(rollbackBatch.batch_id,buyer);

  const partial=await s.createBatch(buyer,req({crop_type:'Race crop',target_quantity:8}));
  await s.respond(partial.batch_id,overlap.listing_id,a,{action:'accepted',quantity:5});
  check((await s.getBatchDetails(partial.batch_id,buyer)).status==='pending','smaller confirmed quantity leaves batch pending');
  await pool.query("UPDATE digital_debo_batches SET expires_at=now()-interval '1 minute' WHERE batch_id=$1",[partial.batch_id]);
  await s.expireBatches();
  check((await s.getBatchDetails(partial.batch_id,buyer)).status==='expired' && Number((await listings.getListing(overlap.listing_id)).available_quantity)===10,'expiry releases quantity safely');

  const decline=await s.createBatch(buyer,req({crop_type:'Decline crop',target_quantity:10}));
  check(decline.proposed_quantity===0 && decline.status==='pending','zero supply creates an incomplete request');
  const declining=await list(a,10,{crop_type:'Decline crop'});
  await s.replenish(decline.batch_id,buyer);
  await s.respond(decline.batch_id,declining.listing_id,a,{action:'declined'});
  check((await s.getBatchDetails(decline.batch_id,buyer)).reserved_quantity===0 && Number((await listings.getListing(declining.listing_id)).available_quantity)===10,'decline reserves nothing and keeps batch incomplete');
  const replacement=await list(b,10,{crop_type:'Decline crop'});
  await s.replenish(decline.batch_id,buyer);
  await s.respond(decline.batch_id,replacement.listing_id,b,{action:'accepted',quantity:10});
  check((await s.getBatchDetails(decline.batch_id,buyer)).status==='filled','replacement supply fills a declined batch without recounting declined listing');

  const priced=await list(a,1500,{crop_type:'Unit crop',unit:'kg',price_per_unit:20});
  check((await s.preview(req({crop_type:'Unit crop',target_quantity:10,max_price:1900}))).listings.length===0,'maximum price excludes expensive stock after compatible unit conversion');
  const unitBatch=await s.createBatch(buyer,req({crop_type:'Unit crop',target_quantity:10,max_price:2000}));
  check(unitBatch.proposed_quantity===10 && unitBatch.estimated_total==='20000.00','kg/quintal conversion and maximum unit price are consistent');
  await pool.query('UPDATE produce_listings SET price_per_unit=21 WHERE listing_id=$1',[priced.listing_id]);
  await reject(s.respond(unitBatch.batch_id,priced.listing_id,a,{action:'accepted',quantity:1000}),409,'changed asking price cannot silently replace invitation price');
  check((await s.getBatchDetails(unitBatch.batch_id,buyer)).reserved_quantity===0,'failed confirmation rolls back all contribution state');
  await pool.query('UPDATE produce_listings SET price_per_unit=20 WHERE listing_id=$1',[priced.listing_id]);
  await s.respond(unitBatch.batch_id,priced.listing_id,a,{action:'accepted',quantity:1000});
  const tx=await transactions.createTransaction({batch_id:unitBatch.batch_id,buyer_id:buyer,amount:1,payment_method:'telebirr'});
  check(tx.amount==='20000.00','single-farmer batch transaction uses confirmed quantity and agreed price, not client amount');
  await reject(transactions.releaseEscrow(tx.transaction_id),409,'unverified prototype payment cannot fulfill produce');
  // Explicit trusted fixture: simulate verified settlement at the database layer,
  // not through an unsigned public webhook or a fabricated gateway response.
  await pool.query("UPDATE transactions SET payment_status='confirmed' WHERE transaction_id=$1",[tx.transaction_id]);
  await transactions.releaseEscrow(tx.transaction_id);
  check((await s.getBatchDetails(unitBatch.batch_id,buyer)).status==='fulfilled','trusted settlement transitions batch to fulfilled');
  check(Number((await listings.getListing(priced.listing_id)).available_quantity)===500,'partial fulfillment permanently subtracts fulfilled stock, preserving remainder');
  await transactions.releaseEscrow(tx.transaction_id);
  await s.expireBatches();
  check(Number((await listings.getListing(priced.listing_id)).available_quantity)===500,'repeat fulfillment and expiry do not return fulfilled quantity to stock');

  const verifiedFixture = async txId => {
    // Trusted test evidence only. There is deliberately no HTTP shortcut for it.
    await pool.query("UPDATE transactions SET payment_status='confirmed' WHERE transaction_id=$1",[txId]);
  };
  const checkout = (batchId,who=buyer) => transactions.createTransaction({batch_id:batchId,buyer_id:who,payment_method:'telebirr'});
  const reserve = async (crop,q,who=buyer) => {
    const batch=await s.createBatch(who,req({crop_type:crop,target_quantity:q}));
    await s.respond(batch.batch_id,batch.listings[0].listing_id,a,{action:'accepted',quantity:q});return batch;
  };
  const past = txId => pool.query("UPDATE transactions SET checkout_expires_at=now()-interval '1 minute' WHERE transaction_id=$1",[txId]);

  const shared=await list(a,10,{crop_type:'Shared settlement'});
  const six=await reserve('Shared settlement',6),four=await reserve('Shared settlement',4,buyer2);
  const sixTx=await checkout(six.batch_id),fourTx=await checkout(four.batch_id,buyer2);
  await verifiedFixture(sixTx.transaction_id);await transactions.releaseEscrow(sixTx.transaction_id);
  const firstSettled=await listings.getListing(shared.listing_id);
  check(firstSettled.status==='available' && Number(firstSettled.available_quantity)===0 && (await s.getBatchDetails(four.batch_id,buyer2)).reserved_quantity===4,'6/4 shared listing: first fulfillment preserves other active reservation without marking sold');
  await verifiedFixture(fourTx.transaction_id);await transactions.releaseEscrow(fourTx.transaction_id);
  check((await listings.getListing(shared.listing_id)).status==='sold' && Number((await listings.getListing(shared.listing_id)).available_quantity)===0,'shared listing becomes sold only after final fulfillment');

  const concurrent=await list(a,10,{crop_type:'Concurrent settlement'});
  const c6=await reserve('Concurrent settlement',6),c4=await reserve('Concurrent settlement',4,buyer2);
  const ct6=await checkout(c6.batch_id),ct4=await checkout(c4.batch_id,buyer2);
  await verifiedFixture(ct6.transaction_id);await verifiedFixture(ct4.transaction_id);
  await Promise.all([transactions.releaseEscrow(ct6.transaction_id),transactions.releaseEscrow(ct4.transaction_id)]);
  check((await listings.getListing(concurrent.listing_id)).status==='sold','concurrent batch settlements serialize and fulfill total stock exactly once');

  const rollbackListing=await list(a,2,{crop_type:'Settlement rollback'});
  const rollback=await reserve('Settlement rollback',2),rollbackTx=await checkout(rollback.batch_id);
  await verifiedFixture(rollbackTx.transaction_id);
  await pool.query(`CREATE FUNCTION ${schema}.fail_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.transaction_id='${rollbackTx.transaction_id}' AND NEW.checkout_status='completed' THEN RAISE EXCEPTION 'Injected settlement failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER fail_settlement BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_settlement()`);
  await assert.rejects(transactions.releaseEscrow(rollbackTx.transaction_id),/Injected settlement failure/);
  check((await s.getBatchDetails(rollback.batch_id,buyer)).reserved_quantity===2 && (await listings.getListing(rollbackListing.listing_id)).status==='available','settlement failure rolls back contribution, listing and batch changes');
  await pool.query('DROP TRIGGER fail_settlement ON transactions');
  await transactions.releaseEscrow(rollbackTx.transaction_id);

  const mixed=await list(a,30,{crop_type:'Recovery mixed stock'});
  const fulfilledBatch=await reserve('Recovery mixed stock',6),fulfilledTx=await checkout(fulfilledBatch.batch_id);
  await verifiedFixture(fulfilledTx.transaction_id);await transactions.releaseEscrow(fulfilledTx.transaction_id);
  const expiring=await reserve('Recovery mixed stock',7),expiringTx=await checkout(expiring.batch_id);
  const held=await reserve('Recovery mixed stock',3,buyer2);
  await past(expiringTx.transaction_id);
  const recovered=await Promise.all([transactions.recoverCheckouts(),transactions.recoverCheckouts()]);
  check(recovered.reduce((sum,n)=>sum+n,0)===1,'concurrent timeout workers recover a prototype checkout only once');
  check(Number((await listings.getListing(mixed.listing_id)).available_quantity)===21 && (await s.getBatchDetails(held.batch_id,buyer2)).reserved_quantity===3,'checkout expiration releases only its seven units, retaining six fulfilled and three reserved elsewhere');
  check((await transactions.getTransaction(expiringTx.transaction_id)).checkout_status==='expired','expired unpaid checkout has persisted terminal state');
  await transactions.cancelCheckout(expiringTx.transaction_id,buyer);
  await transactions.recordUnverifiedNotification(expiringTx.transaction_id,{status:'completed',reference:'late-untrusted'});
  await transactions.recordUnverifiedNotification(expiringTx.transaction_id,{status:'completed',reference:'late-untrusted'});
  await transactions.recordUnverifiedNotification(expiringTx.transaction_id,{status:'failed',reference:'late-untrusted'});
  const late=await transactions.getTransaction(expiringTx.transaction_id);
  check(late.checkout_status==='expired' && late.payment_status==='unpaid' && Number((await listings.getListing(mixed.listing_id)).available_quantity)===21,'late duplicate/conflicting prototype callbacks never resurrect reservations or confirm payment');
  check((await pool.query('SELECT count(*)::int AS n FROM payment_notifications WHERE transaction_id=$1',[expiringTx.transaction_id])).rows[0].n===2,'identical callbacks deduplicate while conflicting claims remain audited');
  await reject(s.closeBatch(fulfilledBatch.batch_id,buyer),409,'fulfilled checkout cannot be cancelled or returned to stock');

  const ambiguousListing=await list(a,10,{crop_type:'Ambiguous checkout'});
  const ambiguous=await reserve('Ambiguous checkout',10),ambiguousTx=await checkout(ambiguous.batch_id);
  // External mode is set only by this trusted fixture. HTTP create always uses
  // prototype mode, never a user-supplied mode or a pretend provider response.
  await pool.query("UPDATE transactions SET payment_mode='external' WHERE transaction_id=$1",[ambiguousTx.transaction_id]);
  await past(ambiguousTx.transaction_id);await transactions.recoverCheckouts();
  check((await transactions.getTransaction(ambiguousTx.transaction_id)).checkout_status==='reconciliation_required' && Number((await listings.getListing(ambiguousListing.listing_id)).available_quantity)===0,'missing external callback demands reconciliation and retains stock instead of assuming payment failure');
  await reject(transactions.cancelCheckout(ambiguousTx.transaction_id,buyer),409,'ambiguous external checkout cannot be cancelled without reliable verification');
  await reject(transactions.updateEscrowStatus(ambiguousTx.transaction_id,'refunded'),409,'admin ledger refund cannot bypass unresolved external payment verification');
  await transactions.recordUnverifiedNotification(ambiguousTx.transaction_id,{status:'completed',reference:'unsigned'});
  check((await transactions.getTransaction(ambiguousTx.transaction_id)).payment_status==='pending','unverified external success claim remains pending, not confirmed');
  await verifiedFixture(ambiguousTx.transaction_id);await transactions.recoverCheckouts();
  check((await s.getBatchDetails(ambiguous.batch_id,buyer)).reserved_quantity===10,'verified payment racing a deadline retains the committed stock');
  await transactions.releaseEscrow(ambiguousTx.transaction_id);
  await transactions.recordUnverifiedNotification(ambiguousTx.transaction_id,{status:'failed',reference:'out-of-order'});
  check((await transactions.getTransaction(ambiguousTx.transaction_id)).checkout_status==='completed' && (await listings.getListing(ambiguousListing.listing_id)).status==='sold','out-of-order failure claim cannot undo verified fulfillment');

  const cancelListing=await list(a,10,{crop_type:'Checkout cancel'});
  const cancel=await reserve('Checkout cancel',4),cancelTx=await checkout(cancel.batch_id);
  const otherHeld=await reserve('Checkout cancel',6,buyer2);
  await reject(transactions.cancelCheckout(cancelTx.transaction_id,buyer2),404,'only requesting buyer may cancel checkout');
  await transactions.cancelCheckout(cancelTx.transaction_id,buyer);await transactions.cancelCheckout(cancelTx.transaction_id,buyer);
  check(Number((await listings.getListing(cancelListing.listing_id)).available_quantity)===4 && (await s.getBatchDetails(otherHeld.batch_id,buyer2)).reserved_quantity===6,'idempotent checkout cancellation preserves another buyer reservation');

  const recoveryListing=await list(a,2,{crop_type:'Durable recovery'});
  const recoveryBatch=await reserve('Durable recovery',2),recoveryTx=await checkout(recoveryBatch.batch_id);
  await past(recoveryTx.transaction_id);
  await pool.query(`CREATE FUNCTION ${schema}.fail_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.transaction_id='${recoveryTx.transaction_id}' AND NEW.checkout_status='expired' THEN RAISE EXCEPTION 'Injected recovery failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER fail_recovery BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_recovery()`);
  await assert.rejects(transactions.recoverCheckouts(),/Injected recovery failure/);
  check((await s.getBatchDetails(recoveryBatch.batch_id,buyer)).reserved_quantity===2,'recovery failure rolls back reservation release atomically');
  await pool.query('DROP TRIGGER fail_recovery ON transactions');
  await pool.query(`SELECT ${schema}.recover_expired_checkouts()`);
  check(Number((await listings.getListing(recoveryListing.listing_id)).available_quantity)===2,'database recovery works directly without HTTP server or in-memory timer');

  const roundListing=await list(a,1,{crop_type:'Exact ETB',price_per_unit:'10.075'});
  const roundRequest=req({crop_type:'Exact ETB',target_quantity:1});
  const roundPreview=await s.preview(roundRequest),roundBatch=await s.createBatch(buyer,roundRequest);
  await s.respond(roundBatch.batch_id,roundListing.listing_id,a,{action:'accepted',quantity:1});
  const roundConfirmed=await s.getBatchDetails(roundBatch.batch_id,buyer),roundTx=await checkout(roundBatch.batch_id);
  check(roundPreview.estimated_total==='10.08' && roundBatch.estimated_total==='10.08' && roundConfirmed.confirmed_total==='10.08' && roundTx.amount==='10.08','ETB 10.075 rounds identically in preview, persisted contribution, batch total and transaction');
  check(roundPreview.listings[0].unit_price==='10.075' && roundConfirmed.listings[0].unit_price==='10.075','asking prices remain unchanged; only contribution totals are rounded');
  const historicalAmount=(await pool.query('SELECT amount::text AS amount FROM transactions WHERE transaction_id=$1',[roundTx.transaction_id])).rows[0].amount;
  const historicalListing=await list(a,1,{crop_type:'Historical unresolved'}),historicalId=randomUUID();
  await pool.query("UPDATE produce_listings SET status='reserved' WHERE listing_id=$1",[historicalListing.listing_id]);
  await pool.query(`INSERT INTO transactions(transaction_id,listing_id,buyer_id,farmer_id,amount,escrow_status,payment_method,transaction_hash,payment_status)
    VALUES($1,$2,$3,$4,12.34,'locked','telebirr',$5,'pending')`,[historicalId,historicalListing.listing_id,buyer,a,`historical-${randomUUID()}`]);
  await pool.query(fs.readFileSync(require.resolve('../db/migrations/008_debo_stabilization.sql'),'utf8').replaceAll(/\bpublic\b/g,schema));
  check((await pool.query('SELECT amount::text AS amount FROM transactions WHERE transaction_id=$1',[roundTx.transaction_id])).rows[0].amount===historicalAmount,'stabilization migration does not reprice historical financial records');
  const oldCheckout=await transactions.getTransaction(historicalId);
  check(oldCheckout.checkout_status==='reconciliation_required' && oldCheckout.amount==='12.34' && Number((await listings.getListing(historicalListing.listing_id)).available_quantity)===0,'historical pending checkout is explicitly unresolved, never silently declared unpaid or repriced');

  const priorTimeout=process.env.PENDING_PAYMENT_TIMEOUT_SECONDS;
  process.env.PENDING_PAYMENT_TIMEOUT_SECONDS='60';
  const timeoutListing=await list(a,1,{crop_type:'Configured deadline'}),timeoutBatch=await reserve('Configured deadline',1);
  const timeoutTx=await checkout(timeoutBatch.batch_id);
  if(priorTimeout===undefined)delete process.env.PENDING_PAYMENT_TIMEOUT_SECONDS;else process.env.PENDING_PAYMENT_TIMEOUT_SECONDS=priorTimeout;
  check(new Date(timeoutTx.checkout_expires_at)-new Date(timeoutTx.created_at)===60000,'configured timeout is persisted as a checkout deadline');

  const direct=await list(a,1,{crop_type:'Direct checkout expiry',price_per_unit:'10.075'});
  const directTx=await transactions.createTransaction({listing_id:direct.listing_id,buyer_id:buyer,payment_method:'telebirr'});
  check(directTx.amount==='10.08','whole-listing checkout uses the same exact monetary policy');
  await past(directTx.transaction_id);await transactions.recoverCheckouts();
  check((await listings.getListing(direct.listing_id)).status==='available' && Number((await listings.getListing(direct.listing_id)).available_quantity)===1,'unpaid direct listing checkout also expires without leaving stock reserved');

  // Real Express route/RBAC integration; only Supabase token verification is
  // replaced with fixture tokens (verified separately by the auth tests).
  require.cache[require.resolve('../src/middleware/auth')]={exports:(req,res,next)=>{const id=req.headers.authorization?.replace('Bearer ','');if(!users.includes(id))return res.status(401).json({error:'Unauthorized'});req.user={id};next();}};
  const express=require('express'),http=require('supertest'),app=express();app.use(express.json());
  app.use('/api/debo',require('../src/modules/digitalDebo/debo.routes'));
  app.use('/api/admin',require('../src/modules/admin/admin.routes'));
  app.use('/api/transactions',require('../src/modules/transactionsEscrow/transaction.routes'));
  app.use(require('../src/middleware/errorHandler'));
  check((await http(app).post('/api/debo/aggregate').send(req())).status===401,'API requires bearer authentication');
  check((await http(app).post('/api/debo/aggregate').set('Authorization',`Bearer ${a}`).send(req())).status===403,'farmer cannot submit buyer aggregation');
  check((await http(app).get('/api/debo/batches/'+batch.batch_id).set('Authorization',`Bearer ${buyer2}`)).status===404,'API enforces buyer batch ownership');
  const history=await http(app).get('/api/debo/invitations').set('Authorization',`Bearer ${a}`);
  check(history.status===200 && history.body.length>0 && history.body.every(x=>x.listings.every(l=>l.farmer_id===a)),'farmer invitation history exposes only own contribution details');
  const monitor=await http(app).get('/api/admin/debo/batches').set('Authorization',`Bearer ${admin}`);
  check(monitor.status===200 && monitor.body.some(x=>x.batch_id===unitBatch.batch_id),'admin monitors real batch progress and contributions');
  const summary=await http(app).get('/api/admin/transactions/summary').set('Authorization',`Bearer ${admin}`);
  check(summary.status===200 && summary.body.locked==='0.00' && typeof summary.body.all==='string','admin monetary summary is calculated by PostgreSQL and excludes unverified pending checkouts');
  check((await http(app).get('/api/admin/debo/batches').set('Authorization',`Bearer ${buyer}`)).status===403,'admin monitoring rejects buyers');
  const routeListing=await list(a,12,{crop_type:'Route crop'});
  const createdRoute=await http(app).post('/api/debo/batches').set('Authorization',`Bearer ${buyer}`).send(req({crop_type:'Route crop',target_quantity:10}));
  check(createdRoute.status===201 && createdRoute.body.status==='pending','buyer creates persisted proposal through real HTTP route');
  const responseRoute=await http(app).post(`/api/debo/batches/${createdRoute.body.batch_id}/contributions/${routeListing.listing_id}/respond`).set('Authorization',`Bearer ${a}`).send({action:'accepted',quantity:10});
  check(responseRoute.status===200 && responseRoute.body.status==='filled' && responseRoute.body.reserved_quantity===10,'farmer confirmation through real HTTP route reserves and fills batch');
  const cancelRoute=await http(app).post(`/api/debo/batches/${createdRoute.body.batch_id}/cancel`).set('Authorization',`Bearer ${buyer}`);
  check(cancelRoute.status===200 && cancelRoute.body.status==='cancelled' && cancelRoute.body.reserved_quantity===0,'buyer cancellation HTTP route releases confirmed stock');
  await reject(s.respond(createdRoute.body.batch_id,routeListing.listing_id,a,{action:'accepted',quantity:10}),409,'replaying confirmation after cancellation cannot claim an active reservation');
  const webhook=await http(app).post('/api/transactions/webhooks/telebirr').send({transaction_id:tx.transaction_id,status:'completed'});
  check(webhook.status===503,'unsigned payment webhook cannot confirm a Debo batch payment');
  const nullQr=await http(app).post(`/api/transactions/${tx.transaction_id}/release`).set('Authorization',`Bearer ${buyer}`).send({qr_token:null});
  check(nullQr.status===400,'null QR token cannot be used as delivery proof');
  const httpCancel=await http(app).post(`/api/transactions/${timeoutTx.transaction_id}/cancel`).set('Authorization',`Bearer ${buyer}`);
  check(httpCancel.status===200 && httpCancel.body.checkout_status==='cancelled' && Number((await listings.getListing(timeoutListing.listing_id)).available_quantity)===1,'real authenticated checkout cancellation route releases prototype stock');
  // The migration-created ACLs prohibit bypassing the reservation API.
  {
    await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO authenticated`);
    const db=await pool.connect();
    try {
      await db.query('BEGIN');await db.query('SET LOCAL ROLE authenticated');
      await assert.rejects(db.query(`SELECT * FROM ${schema}.debo_batch_listings`),e=>e.code==='42501');
      await db.query('ROLLBACK');check(true,'direct authenticated clients cannot bypass reservation API');
      await db.query('BEGIN');await db.query('SET LOCAL ROLE authenticated');
      await assert.rejects(db.query(`SELECT ${schema}.recover_expired_checkouts()`),e=>e.code==='42501');
      await db.query('ROLLBACK');check(true,'clients cannot invoke privileged checkout recovery directly');
      await db.query('BEGIN');await db.query('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[buyer]);
      check((await db.query('SELECT 1 FROM transactions WHERE transaction_id=$1',[tx.transaction_id])).rowCount===1,'transaction RLS preserves buyer-owned reads');
      await assert.rejects(db.query("UPDATE transactions SET payment_status='confirmed' WHERE transaction_id=$1",[tx.transaction_id]),e=>e.code==='42501');
      await db.query('ROLLBACK');check(true,'clients cannot forge verified batch payment or escrow state through Supabase');
      await db.query('BEGIN');await db.query('SET LOCAL ROLE authenticated');
      await assert.rejects(db.query(`SELECT * FROM ${schema}.payment_notifications`),e=>e.code==='42501');
      await db.query('ROLLBACK');check(true,'unverified payment audit is not exposed to browser clients');
    } finally {db.release();}
  }
  console.log(`${checks} real PostgreSQL/PostGIS and API checks passed.`);
 } finally {
  if(pool)await pool.end();
  await original.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await original.end();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
