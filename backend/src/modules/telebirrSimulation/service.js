// No provider imports, SDK calls, merchant configuration, or real payment proof.
const { randomUUID } = require('crypto');
const pool = require('../../config/db');
const wallet = require('../transactionsEscrow/wallet.service');
const money = require('../../utils/money');
const config = require('./config');
const fail = (status,message) => Object.assign(new Error(message),{status});
const view = p => ({ payment_id:p.payment_id, reference:p.reference, amount:money.formatMinor(BigInt(p.amount_minor)),
  currency:p.currency, status:p.status, created_at:p.created_at, expires_at:p.expires_at, authorized_at:p.authorized_at,
  ledger_reference:p.ledger_event_id, environment:p.environment, simulated:true,
  label:'Demo only — No real money will be transferred.' });
function createService({db=pool}={}) {
  const atomic = async action => {
    const c=await db.connect();
    try { await c.query('BEGIN'); const r=await action(c); await c.query('COMMIT'); return r; }
    catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  };
  const buyer = async (c,owner) => {
    if ((await c.query('SELECT role FROM users WHERE user_id=$1',[owner])).rows[0]?.role !== 'buyer') throw fail(403,'Buyer role required');
  };
  const owned = async (c,owner,id) => {
    if (typeof id!=='string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw fail(400,'Invalid simulation payment ID');
    await buyer(c,owner);
    const p=(await c.query('SELECT * FROM telebirr_demo_payments WHERE payment_id=$1 AND buyer_id=$2 FOR UPDATE',[id,owner])).rows[0];
    if (!p) throw fail(404,'Demo payment not found');
    return expire(c,p);
  };
  const expire = async (c,p) => {
    if (p.status==='PENDING_AUTHORIZATION') {
      const r=await c.query("UPDATE telebirr_demo_payments SET status='EXPIRED' WHERE payment_id=$1 AND expires_at<=clock_timestamp() RETURNING *",[p.payment_id]);
      if(r.rows[0]) return r.rows[0];
    }
    return p;
  };
  return {
    async create(owner,input) {
      const {expirySeconds}=config.configuration();
      const cents=wallet.amount(input.amount), key=wallet.key(input.idempotency_key);
      if(input.confirm_demo!==true) throw fail(400,'Explicit demo confirmation required');
      if(cents>wallet.amount(process.env.DEMO_WALLET_MAX_TOP_UP||'1000000.00') || cents>100000000n) throw fail(400,'Demo top-up transaction limit exceeded');
      return atomic(async c => {
        await buyer(c,owner);
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`telebirr-demo:${owner}`]);
        const old=(await c.query('SELECT * FROM telebirr_demo_payments WHERE buyer_id=$1 AND idempotency_key=$2 FOR UPDATE',[owner,key])).rows[0];
        if(old) {
          if(BigInt(old.amount_minor)!==cents) throw fail(409,'Idempotency key already used with different details');
          return view(await expire(c,old));
        }
        const count=(await c.query("SELECT count(*)::int AS count FROM telebirr_demo_payments WHERE buyer_id=$1 AND created_at>now()-interval '1 hour'",[owner])).rows[0].count;
        if(count>=10) throw fail(429,'Demo payment request hourly limit reached');
        const id=randomUUID();
        return view((await c.query(`INSERT INTO telebirr_demo_payments(payment_id,buyer_id,reference,amount_minor,environment,idempotency_key,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+$7*interval '1 second') RETURNING *`,
        [id,owner,`DEMO-TB-${id}`,cents.toString(),process.env.NODE_ENV,key,expirySeconds])).rows[0]);
      });
    },
    async act(owner,id,action,input={}) {
      config.configuration();
      if(!['approve','decline','cancel'].includes(action)) throw fail(400,'Invalid action');
      const cents=action==='approve'?wallet.amount(input.amount):null;
      if(action==='approve' && input.confirm_demo!==true) throw fail(400,'Explicit demo authorization required');
      return atomic(async c => {
        const p=await owned(c,owner,id);
        if(cents!==null && cents!==BigInt(p.amount_minor)) throw fail(409,'Payment amount mismatch');
        // Same-action retries return the durable result; incompatible replays fail.
        const target={approve:'CREDITED',decline:'DECLINED',cancel:'CANCELLED'}[action];
        if(p.status===target || p.status==='EXPIRED') return view(p);
        if(p.status!=='PENDING_AUTHORIZATION') throw fail(409,'Demo payment is already terminal');
        if(action!=='approve') return view((await c.query('UPDATE telebirr_demo_payments SET status=$2 WHERE payment_id=$1 RETURNING *',[id,target])).rows[0]);
        await c.query("UPDATE telebirr_demo_payments SET status='AUTHORIZED',authorized_at=clock_timestamp() WHERE payment_id=$1",[id]);
        const credit=await wallet.creditTopUp(c,owner,{amount:money.formatMinor(cents),idempotency_key:`telebirr-demo:${id}`,confirm_demo:true});
        return view((await c.query("UPDATE telebirr_demo_payments SET status='CREDITED',ledger_event_id=$2 WHERE payment_id=$1 RETURNING *",[id,credit.reference])).rows[0]);
      });
    },
    async get(owner,id) { config.configuration(); return atomic(async c=>view(await owned(c,owner,id))); },
    async list(owner,query={}) {
      config.configuration();
      const limit=Number(query.limit||25),offset=Number(query.offset||0);
      if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>100000) throw fail(400,'Invalid pagination');
      if(query.status && !['PENDING_AUTHORIZATION','AUTHORIZED','CREDITED','DECLINED','CANCELLED','EXPIRED','FAILED'].includes(query.status)) throw fail(400,'Invalid status filter');
      return atomic(async c=>{
        if(owner) await buyer(c,owner);
        // Reconciliation only expires pending attempts, never completed payments.
        await c.query("UPDATE telebirr_demo_payments SET status='EXPIRED' WHERE status='PENDING_AUTHORIZATION' AND expires_at<=clock_timestamp() AND ($1::uuid IS NULL OR buyer_id=$1)",[owner]);
        const rows=(await c.query(`SELECT p.*,u.full_name FROM telebirr_demo_payments p JOIN users u ON u.user_id=p.buyer_id
          WHERE ($1::uuid IS NULL OR buyer_id=$1) AND ($4::text IS NULL OR status=$4)
          ORDER BY p.created_at DESC,p.payment_id DESC LIMIT $2 OFFSET $3`,[owner,limit+1,offset,query.status||null])).rows;
        return {items:rows.slice(0,limit).map(p=>({...view(p),...(!owner?{buyer_id:p.buyer_id,buyer:p.full_name}:{})})),has_more:rows.length>limit};
      });
    },
  };
}
module.exports={...createService(),createService};
