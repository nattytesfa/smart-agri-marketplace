jest.mock('../src/config/db',()=>({query:jest.fn()}));
const pool=require('../src/config/db');
const identity=require('../src/middleware/accountIdentity');
afterEach(()=>jest.clearAllMocks());
test('only explicit identity link or unbound exact UUID can resolve an account',async()=>{
  pool.query.mockResolvedValue({rows:[{user_id:'application-id',role:'buyer'}]});
  expect(await identity.resolveAccount('verified-subject')).toEqual({user_id:'application-id',role:'buyer'});
  const [sql,args]=pool.query.mock.calls[0];
  expect(sql).toContain('auth_user_id=$1');
  expect(sql).toContain('auth_user_id IS NULL AND user_id=$1');
  expect(sql).not.toContain('phone_number'); expect(args).toEqual(['verified-subject']);
});
test('an unlinked identity is never assigned another account or default role',async()=>{
  pool.query.mockResolvedValue({rows:[]}); expect(await identity.resolveAccount('unknown')).toBeNull();
});
test('opt-in diagnostic logs contain IDs and route status, never credentials or query strings',()=>{
  const old=process.env.AUTH_DIAGNOSTICS;process.env.AUTH_DIAGNOSTICS='true';
  const log=jest.spyOn(console,'info').mockImplementation(()=>{});
  try {
    identity.diagnostic({method:'POST',originalUrl:'/api/transactions/initiate?private=hidden',headers:{authorization:'Bearer secret'},authUser:{id:'auth-id',phone:'private'},account:{user_id:'app-id',role:'buyer'}},'protected_request',201);
    const output=log.mock.calls[0][0]; expect(output).toContain('app-id');expect(output).toContain('201');
    for(const secret of ['Bearer','secret','private','hidden'])expect(output).not.toContain(secret);
  }finally{log.mockRestore();if(old===undefined)delete process.env.AUTH_DIAGNOSTICS;else process.env.AUTH_DIAGNOSTICS=old;}
});
