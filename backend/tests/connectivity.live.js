// Opt-in real Supabase bearer-token smoke test. Creates two temporary Auth
// identities, rolls all public-table fixtures back, then deletes those identities.
// Never prints tokens/passwords or sends OTP/SMS. No payment provider is called.
if (process.env.LIVE_AUTH_TEST!=='1') {
  console.log('Not run: set LIVE_AUTH_TEST=1 to create temporary Auth test identities.');
} else {
  const assert=require('assert').strict,fs=require('fs'),{randomUUID,randomBytes}=require('crypto');
  const original=require('../src/config/db'),config=require('../src/config/env');
  const admin=require('../src/config/supabaseClient'),{createClient}=require('@supabase/supabase-js');
  const env=require('dotenv').parse(fs.readFileSync(require('path').resolve(__dirname,'../../mobile/.env')));
  const identities=[];
  (async()=>{
    let db;
    try {
      assert.equal(env.SUPABASE_URL,config.supabaseUrl,'Mobile and backend must use the same Supabase project');
      for(const role of ['farmer','buyer']) {
        const email=`debo-smoke-${randomUUID()}@example.com`,password=randomBytes(32).toString('base64url');
        const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
        if(created.error)throw new Error(`Auth fixture creation failed: ${created.error.message}`);
        const identity={id:created.data.user.id,role};identities.push(identity);
        const client=createClient(config.supabaseUrl,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:require('ws')}});
        const signed=await client.auth.signInWithPassword({email,password});
        if(signed.error)throw new Error(`Auth fixture login failed: ${signed.error.message}`);
        identity.token=signed.data.session.access_token;
      }
      db=await original.connect();await db.query('BEGIN');
      for(const u of identities) await db.query("INSERT INTO users(user_id,phone_number,role,hashed_password,full_name) VALUES($1,$2,$3,'smoke-only','Connectivity smoke')",[u.id,`smoke-${u.id}`,u.role]);
      const wrapped={query:(sql,args)=>db.query(sql==='BEGIN'?'SAVEPOINT smoke_operation':sql==='COMMIT'?'RELEASE SAVEPOINT smoke_operation':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT smoke_operation':sql,args),release(){}};
      require.cache[require.resolve('../src/config/db')].exports={query:(sql,args)=>db.query(sql,args),connect:async()=>wrapped};
      // Real mounted app and real auth middleware: no auth mock is installed.
      const app=require('../src/app'),request=require('supertest');
      const farmer=identities[0],buyer=identities[1],crop=`Auth smoke ${randomUUID()}`;
      const listing=await request(app).post('/api/listings').set('Authorization',`Bearer ${farmer.token}`).send({client_id:randomUUID(),operation_id:randomUUID(),crop_type:crop,variety:'White',quantity:1,unit:'quintal',price_per_unit:'10.075',location_lat:9.03,location_lng:38.74});
      assert.equal(listing.status,201,JSON.stringify(listing.body));
      const market=await request(app).get('/api/listings').query({crop_type:crop}).set('Authorization',`Bearer ${buyer.token}`);
      assert.equal(market.status,200);assert.equal(market.body.length,1);
      const batch=await request(app).post('/api/debo/batches').set('Authorization',`Bearer ${buyer.token}`).send({crop_type:crop,target_quantity:1,lat:9.03,lng:38.74,radius:1000,request_id:randomUUID()});
      assert.equal(batch.status,201,JSON.stringify(batch.body));assert.equal(batch.body.estimated_total,'10.08');
      const accepted=await request(app).post(`/api/debo/batches/${batch.body.batch_id}/contributions/${listing.body.listing.listing_id}/respond`).set('Authorization',`Bearer ${farmer.token}`).send({action:'accepted',quantity:1});
      assert.equal(accepted.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.status,'filled');
      const detail=await request(app).get(`/api/debo/batches/${batch.body.batch_id}`).set('Authorization',`Bearer ${buyer.token}`);
      assert.equal(detail.status,200);assert.equal(detail.body.confirmed_total,'10.08');
      console.log('PASS real Supabase farmer/buyer authentication, listing synchronization/discovery, Debo request, confirmation and final total through mounted Express routes');
    } finally {
      if(db){await db.query('ROLLBACK');db.release();}
      let cleanupError;
      for(const u of identities){const result=await admin.auth.admin.deleteUser(u.id);if(result.error)cleanupError=new Error(`Auth fixture cleanup failed for ${u.id}: ${result.error.message}`);}
      await original.end();
      if(cleanupError)throw cleanupError;
      console.log('Rolled back public fixtures and removed temporary Auth identities.');
    }
  })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
