jest.mock('../src/config/db',()=>({query:jest.fn(),connect:jest.fn()}));
jest.mock('../src/config/supabaseClient',()=>({auth:{getUser:jest.fn()}}));
jest.mock('../src/middleware/accountIdentity',()=>({resolveAccount:jest.fn(),diagnostic:jest.fn()}));
jest.mock('../src/modules/telebirrSimulation/service',()=>({list:jest.fn(),create:jest.fn(),get:jest.fn(),act:jest.fn()}));
const express=require('express');
const request=require('supertest');
const pool=require('../src/config/db');
const supabase=require('../src/config/supabaseClient');
const identity=require('../src/middleware/accountIdentity');
const service=require('../src/modules/telebirrSimulation/service');
const app=express();app.use(express.json());app.use('/demo',require('../src/modules/telebirrSimulation/routes'));
const saved={...process.env};
beforeEach(()=>{
 jest.clearAllMocks();Object.assign(process.env,{NODE_ENV:'test',TELEBIRR_SIMULATION_ENABLED:'true',DEMO_WALLETS_ENABLED:'true',SIMULATED_PAYMENTS_ENABLED:'true'});
 supabase.auth.getUser.mockResolvedValue({data:{user:{id:'auth'}},error:null});
 identity.resolveAccount.mockResolvedValue({user_id:'buyer'});
 pool.query.mockResolvedValue({rows:[{role:'buyer'}]});
});
afterEach(()=>{process.env={...saved};});
test('unauthenticated simulation cannot create',async()=>{
 expect((await request(app).post('/demo/payments').send({})).status).toBe(401);
 expect(service.create).not.toHaveBeenCalled();
});
test('farmer cannot authorize simulation',async()=>{
 pool.query.mockResolvedValue({rows:[{role:'farmer'}]});
 expect((await request(app).post('/demo/payments/id/approve').set('Authorization','Bearer test').send({})).status).toBe(403);
 expect(service.act).not.toHaveBeenCalled();
});
test('owner always comes from authenticated application mapping',async()=>{
 service.create.mockResolvedValue({status:'PENDING_AUTHORIZATION'});
 expect((await request(app).post('/demo/payments').set('Authorization','Bearer test').send({buyer_id:'forged'})).status).toBe(200);
 expect(service.create).toHaveBeenCalledWith('buyer',expect.any(Object));
});
test.each(['approve','decline','cancel'])('%s route binds authenticated owner',async action=>{
 service.act.mockResolvedValue({status:'CREDITED'});
 expect((await request(app).post(`/demo/payments/id/${action}`).set('Authorization','Bearer test').send({amount:'1'})).status).toBe(200);
 expect(service.act).toHaveBeenCalledWith('buyer','id',action,{amount:'1'});
});
test('buyer cannot use admin monitor',async()=>{
 expect((await request(app).get('/demo/admin').set('Authorization','Bearer test')).status).toBe(403);
});
test('admin monitor has no write endpoint',async()=>{
 pool.query.mockResolvedValue({rows:[{role:'admin'}]});service.list.mockResolvedValue({items:[]});
 expect((await request(app).get('/demo/admin').set('Authorization','Bearer test')).status).toBe(200);
 expect((await request(app).post('/demo/payments/id/approve').set('Authorization','Bearer test').send({})).status).toBe(403);
});
test.each(['TELEBIRR_SIMULATION_ENABLED','DEMO_WALLETS_ENABLED','SIMULATED_PAYMENTS_ENABLED'])('disabled %s hides operational surface',async flag=>{
 process.env[flag]='false';
 expect((await request(app).post('/demo/payments').set('Authorization','Bearer test').send({})).status).toBe(404);
 expect(service.create).not.toHaveBeenCalled();
});
test('production hides endpoint even when every flag is true',async()=>{
 process.env.NODE_ENV='production';
 expect((await request(app).post('/demo/payments/id/approve').set('Authorization','Bearer test').send({})).status).toBe(404);
 expect(service.act).not.toHaveBeenCalled();expect(supabase.auth.getUser).not.toHaveBeenCalled();
});
