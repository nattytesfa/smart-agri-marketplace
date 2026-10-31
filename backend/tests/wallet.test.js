jest.mock('../src/config/db',()=>({query:jest.fn(),connect:jest.fn()}));
const wallet=require('../src/modules/transactionsEscrow/wallet.service');
const money=require('../src/utils/money');
const pool=require('../src/config/db');
const saved={...process.env};
afterEach(()=>{process.env={...saved};jest.clearAllMocks();});
test.each(['0','-1','0.001','1e3','NaN','Infinity','',1,null,{},'9999999999999'])('rejects invalid top-up %p',v=>expect(()=>wallet.amount(v)).toThrow());
test.each([['0.01',1n],['501000.00',50100000n],['10000',1000000n]])('exact cents %s',(s,n)=>expect(wallet.amount(s)).toBe(n));
test.each([[-1n,'-0.01'],[-108n,'-1.08'],[0n,'0.00'],[50100000n,'501000.00']])('signed money %s',(n,s)=>expect(money.formatMinor(n)).toBe(s));
test.each(['','short','key with spaces','x'.repeat(129),null])('invalid idempotency %p',k=>expect(()=>wallet.key(k)).toThrow());
test('disabled wallet top-up touches no database',async()=>{
  process.env.NODE_ENV='demo';process.env.SIMULATED_PAYMENTS_ENABLED='true';process.env.DEMO_WALLETS_ENABLED='false';
  await expect(wallet.topUp('buyer',{})).rejects.toMatchObject({status:503});
  expect(pool.connect).not.toHaveBeenCalled();
});
test('production forbids virtual funding even when both switches enabled',async()=>{
  process.env.NODE_ENV='production';process.env.SIMULATED_PAYMENTS_ENABLED='true';process.env.DEMO_WALLETS_ENABLED='true';
  await expect(wallet.topUp('buyer',{})).rejects.toMatchObject({status:503});
  expect(pool.connect).not.toHaveBeenCalled();
});
