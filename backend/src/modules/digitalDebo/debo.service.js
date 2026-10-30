const pool = require('../../config/db');
const money = require('../../utils/money');
const { validateRequest, findNearbyClusters, propose } = require('./clustering.util');
const fail = (status,message) => Object.assign(new Error(message),{status});
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const transaction = async action => {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await action(db); await db.query('COMMIT'); return result; }
  catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
};
const preview = async input => { const f=validateRequest(input); return propose(await findNearbyClusters(f),f.target_quantity,f.unit); };
const createBatch = async (buyerId,input) => {
  const f=validateRequest(input);
  if (!uuid(input.request_id)) throw fail(400,'A UUID request_id is required for safe retries');
  const id = await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${buyerId}:${input.request_id}`]);
    const old=(await db.query('SELECT batch_id,criteria FROM digital_debo_batches WHERE target_buyer_id=$1 AND request_id=$2',[buyerId,input.request_id])).rows[0];
    if (old) {
      const canonical = o => JSON.stringify(o,Object.keys(o).sort());
      if (canonical(old.criteria)!==canonical(f)) throw fail(409,'Request ID already used with different criteria');
      return old.batch_id;
    }
    const proposal=propose(await findNearbyClusters(f,db),f.target_quantity,f.unit);
    const b=(await db.query(`INSERT INTO digital_debo_batches(target_buyer_id,crop_type,total_quantity,unit,criteria,request_id,pricing_policy)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING batch_id`,[buyerId,f.crop_type,f.target_quantity,f.unit,f,input.request_id,money.policy])).rows[0];
    await insertContributions(db,b.batch_id,proposal.listings);
    return b.batch_id;
  });
  return getBatchDetails(id,buyerId);
};
const insertContributions = async (db,id,listings) => {
  for (const l of listings) await db.query(`INSERT INTO debo_batch_listings(batch_id,listing_id,proposed_quantity,unit,unit_price,conversion_factor,distance_meters,participation_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,'proposed') ON CONFLICT DO NOTHING`,[id,l.listing_id,l.proposed_quantity,l.unit,l.unit_price,l.conversion_factor,l.distance_meters]);
};
const getBatchDetails = async (id,userId,admin=false) => {
  if (!uuid(id)) throw fail(400,'Invalid batch ID');
  const b=(await pool.query(`SELECT b.*,u.full_name AS buyer_name,
    (SELECT jsonb_build_object('transaction_id',t.transaction_id,'status',t.checkout_status,'payment_status',t.payment_status,
      'mode',t.payment_mode,'expires_at',t.checkout_expires_at,'reason',t.reconciliation_reason)
      FROM transactions t WHERE t.batch_id=b.batch_id ORDER BY t.created_at DESC LIMIT 1) AS checkout
    FROM digital_debo_batches b JOIN users u ON u.user_id=b.target_buyer_id
    WHERE batch_id=$1 AND ($3::boolean OR target_buyer_id=$2 OR EXISTS(SELECT 1 FROM debo_batch_listings d
    JOIN produce_listings l ON l.listing_id=d.listing_id WHERE d.batch_id=b.batch_id AND l.farmer_id=$2))`,[id,userId,admin])).rows[0];
  if (!b) throw fail(404,'Batch not found');
  const members=(await pool.query(`SELECT d.*,l.farmer_id,u.full_name AS farmer_name,l.crop_type,l.variety,l.quality_grade,l.image_url,
    round(d.proposed_quantity*d.unit_price,2) AS proposed_subtotal,
    round(d.confirmed_quantity*d.unit_price,2) AS confirmed_subtotal,
    CASE WHEN d.participation_status='declined' THEN 0 ELSE round((CASE WHEN d.participation_status='accepted' THEN d.confirmed_quantity ELSE d.proposed_quantity END)*d.unit_price,2) END AS subtotal,
    public.debo_available(l) AS available_quantity,
    (SELECT coalesce(sum(x.confirmed_quantity),0)>l.quantity FROM debo_batch_listings x
      WHERE x.listing_id=l.listing_id AND x.reservation_status IN ('active','fulfilled')) AS inventory_inconsistent
    FROM debo_batch_listings d
    JOIN produce_listings l ON l.listing_id=d.listing_id JOIN users u ON u.user_id=l.farmer_id
    WHERE d.batch_id=$1 ORDER BY d.distance_meters NULLS LAST,d.listing_id`,[id])).rows;
  const sum = fn => members.reduce((s,l)=>s+fn(l),0);
  const proposed=sum(l=>l.participation_status!=='declined' ? Number(l.proposed_quantity)*Number(l.conversion_factor) : 0);
  const confirmed=sum(l=>Number(l.confirmed_quantity)*Number(l.conversion_factor));
  const reserved=sum(l=>l.reservation_status==='active' ? Number(l.confirmed_quantity)*Number(l.conversion_factor):0);
  const fulfilled=sum(l=>l.reservation_status==='fulfilled' ? Number(l.confirmed_quantity)*Number(l.conversion_factor):0);
  const committed=reserved+fulfilled;
  const estimated=money.sumMoney(members.map(l=>l.subtotal));
  const confirmedTotal=money.sumMoney(members.filter(l=>['active','fulfilled'].includes(l.reservation_status)).map(l=>l.confirmed_subtotal));
  return {...b,target_quantity:Number(b.total_quantity),proposed_quantity:proposed,confirmed_quantity:confirmed,reserved_quantity:reserved,
    fulfilled_quantity:fulfilled,remaining_quantity:Math.max(0,Number(b.total_quantity)-committed),
    completion_percentage:Math.min(100,committed/Number(b.total_quantity)*100),estimated_total:estimated,confirmed_total:confirmedTotal,
    legacy:!b.criteria,can_manage:b.target_buyer_id===userId,transaction_ready:b.status==='filled' && !b.checkout,
    listings:admin || b.target_buyer_id===userId ? members:members.filter(l=>l.farmer_id===userId)};
};
const listBatches = async (userId,admin=false) => {
  const ids=(await pool.query(`SELECT b.batch_id FROM digital_debo_batches b WHERE $2::boolean OR b.target_buyer_id=$1
    OR EXISTS(SELECT 1 FROM debo_batch_listings d JOIN produce_listings l ON l.listing_id=d.listing_id
    WHERE d.batch_id=b.batch_id AND l.farmer_id=$1) ORDER BY b.created_at DESC LIMIT 100`,[userId,admin])).rows;
  return Promise.all(ids.map(b=>getBatchDetails(b.batch_id,userId,admin)));
};
const respond = async (batchId,listingId,farmerId,input) => {
  if (!input || !uuid(batchId) || !uuid(listingId) || !['accepted','declined'].includes(input.action)) throw fail(400,'Invalid participation action');
  await transaction(async db => {
    const b=(await db.query('SELECT * FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE',[batchId])).rows[0];
    const l=(await db.query('SELECT * FROM produce_listings WHERE listing_id=$1 FOR UPDATE',[listingId])).rows[0];
    const d=(await db.query('SELECT * FROM debo_batch_listings WHERE batch_id=$1 AND listing_id=$2 FOR UPDATE',[batchId,listingId])).rows[0];
    if (!b || !d || !l || l.farmer_id!==farmerId) throw fail(404,'Invitation not found');
    const q=input.quantity == null ? Number(d.proposed_quantity):Number(input.quantity);
    if (input.action==='accepted' && ((input.quantity!=null && !['string','number'].includes(typeof input.quantity)) || !Number.isFinite(q) || q<=0 || q>Number(d.proposed_quantity))) throw fail(400,'Invalid confirmation quantity');
    if (d.participation_status===input.action && (input.action==='declined' || Number(d.confirmed_quantity)===q)) {
      if (input.action==='accepted' && d.reservation_status!=='active') throw fail(409,'This reservation is no longer active');
      return;
    }
    if (d.participation_status!=='proposed') throw fail(409,'Participation has already been decided');
    if (b.status!=='pending' || new Date(b.expires_at)<=new Date() || !b.criteria) throw fail(409,'Batch is not accepting confirmations');
    if (input.action==='declined') {
      await db.query("UPDATE debo_batch_listings SET participation_status='declined',confirmed_at=now() WHERE batch_id=$1 AND listing_id=$2",[batchId,listingId]);
      await db.query('UPDATE digital_debo_batches SET updated_at=now() WHERE batch_id=$1',[batchId]); return;
    }
    const available=Number((await db.query('SELECT public.debo_available(l) AS quantity FROM produce_listings l WHERE listing_id=$1',[listingId])).rows[0].quantity);
    if (l.deleted_at || l.status!=='available' || l.sync_status!=='cloud' || q>available || l.unit!==d.unit || !money.sameDecimal(l.price_per_unit,d.unit_price)) throw fail(409,'Stock or price changed. Ask the buyer to refresh the proposal.');
    // Revalidate all matching constraints, including a moved GPS location.
    const eligible=await findNearbyClusters(b.criteria,db);
    if (!eligible.some(x=>x.listing_id===listingId)) throw fail(409,'Listing no longer matches request');
    const fits=(await db.query(`SELECT coalesce((SELECT sum(confirmed_quantity*conversion_factor)
      FROM debo_batch_listings WHERE batch_id=$1 AND reservation_status='active'),0)+$2::numeric*$3::numeric<=b.total_quantity AS fits
      FROM digital_debo_batches b WHERE batch_id=$1`,[batchId,q,d.conversion_factor])).rows[0].fits;
    if (!fits) throw fail(409,'Contribution exceeds remaining batch quantity');
    await db.query(`UPDATE debo_batch_listings SET participation_status='accepted',confirmed_quantity=$3,reservation_status='active',confirmed_at=now()
      WHERE batch_id=$1 AND listing_id=$2`,[batchId,listingId,q]);
    await db.query(`UPDATE digital_debo_batches SET status=CASE WHEN (SELECT coalesce(sum(confirmed_quantity*conversion_factor),0)
      FROM debo_batch_listings WHERE batch_id=$1 AND reservation_status='active')>=total_quantity THEN 'filled' ELSE 'pending' END,
      updated_at=now() WHERE batch_id=$1`,[batchId]);
    await db.query('UPDATE produce_listings SET version=version+1,updated_at=now() WHERE listing_id=$1',[listingId]);
  });
  return getBatchDetails(batchId,farmerId);
};
const closeBatch = async (id,userId,expired=false) => {
  // Lock order is transaction -> batch -> listing. Never acquire a transaction
  // lock while holding the batch lock (settlement/recovery use that order too).
  if (!expired) {
    const t=(await pool.query('SELECT transaction_id FROM transactions WHERE batch_id=$1 LIMIT 1',[id])).rows[0];
    if (t) return require('../transactionsEscrow/transaction.service').cancelCheckout(t.transaction_id,userId);
  }
  return transaction(async db => {
  const b=(await db.query('SELECT * FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE',[id])).rows[0];
  if (!b || (!expired && b.target_buyer_id!==userId)) throw fail(404,'Batch not found');
  if (['cancelled','expired'].includes(b.status)) return;
  if (expired && new Date(b.expires_at)>new Date()) return;
  if (b.status==='fulfilled' || (await db.query('SELECT 1 FROM transactions WHERE batch_id=$1',[id])).rowCount) {
    if (expired) return;
    throw fail(409,'A transaction exists. Resolve it through the transaction workflow.');
  }
  if (!b.criteria) throw fail(409,'Legacy batch requires administrator review');
  await db.query('SELECT l.listing_id FROM produce_listings l JOIN debo_batch_listings d ON d.listing_id=l.listing_id WHERE d.batch_id=$1 ORDER BY l.listing_id FOR UPDATE OF l',[id]);
  await db.query("UPDATE debo_batch_listings SET reservation_status='released' WHERE batch_id=$1 AND reservation_status='active'",[id]);
  await db.query('UPDATE produce_listings SET version=version+1,updated_at=now() WHERE listing_id IN (SELECT listing_id FROM debo_batch_listings WHERE batch_id=$1)',[id]);
  await db.query("UPDATE digital_debo_batches SET status=$2,updated_at=now() WHERE batch_id=$1",[id,expired?'expired':'cancelled']);
  });
};
const expireBatches = async () => {
  await require('../transactionsEscrow/transaction.service').recoverCheckouts();
  const {rows}=await pool.query("SELECT batch_id FROM digital_debo_batches WHERE status IN ('pending','filled') AND criteria IS NOT NULL AND expires_at<=now() AND NOT EXISTS(SELECT 1 FROM transactions t WHERE t.batch_id=digital_debo_batches.batch_id)");
  for (const b of rows) await closeBatch(b.batch_id,null,true);
};
const replenish = async (id,buyerId) => {
  await transaction(async db => {
    const b=(await db.query('SELECT * FROM digital_debo_batches WHERE batch_id=$1 FOR UPDATE',[id])).rows[0];
    if (!b || b.target_buyer_id!==buyerId) throw fail(404,'Batch not found');
    if (b.status!=='pending' || !b.criteria || new Date(b.expires_at)<=new Date()) throw fail(409,'Batch cannot be refreshed');
    const existing=(await db.query('SELECT * FROM debo_batch_listings WHERE batch_id=$1',[id])).rows;
    // Replace only unanswered invitations. Accepted/declined history is immutable.
    await db.query("DELETE FROM debo_batch_listings WHERE batch_id=$1 AND participation_status='proposed'",[id]);
    const committed=existing.reduce((s,d)=>s+(d.reservation_status==='active'?Number(d.confirmed_quantity)*Number(d.conversion_factor):0),0);
    const excluded=new Set(existing.filter(d=>d.participation_status!=='proposed').map(d=>d.listing_id));
    const matches=(await findNearbyClusters(b.criteria,db)).filter(l=>!excluded.has(l.listing_id));
    await insertContributions(db,id,propose(matches,Math.max(0,Number(b.total_quantity)-committed),b.unit).listings);
    await db.query('UPDATE digital_debo_batches SET updated_at=now() WHERE batch_id=$1',[id]);
  });
  return getBatchDetails(id,buyerId);
};
module.exports={preview,createBatch,getBatchDetails,listBatches,respond,closeBatch,expireBatches,replenish,uuid};
