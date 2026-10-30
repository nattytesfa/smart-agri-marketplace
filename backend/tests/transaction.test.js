jest.mock('../src/config/db',()=>({connect:jest.fn(),query:jest.fn()}));
const pool=require('../src/config/db');
const service=require('../src/modules/transactionsEscrow/transaction.service');
beforeEach(()=>jest.clearAllMocks());
test('database failures roll back reservation and transaction together',async()=>{
  const db={query:jest.fn().mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue({rows:[]}),release:jest.fn()};
  pool.connect.mockResolvedValue(db);
  await expect(service.createTransaction({listing_id:'listing'})).rejects.toThrow('database unavailable');
  expect(db.query).toHaveBeenCalledWith('ROLLBACK');expect(db.release).toHaveBeenCalled();
});
test('pending payment cannot fulfill inventory',async()=>{
  const db={query:jest.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{escrow_status:'locked',payment_status:'pending',checkout_status:'pending'}]}).mockResolvedValue({rows:[]}),release:jest.fn()};
  pool.connect.mockResolvedValue(db);
  await expect(service.releaseEscrow('t')).rejects.toMatchObject({status:409});
  expect(db.query).toHaveBeenCalledWith('ROLLBACK');
  expect(db.query.mock.calls.some(([sql])=>sql.includes('UPDATE produce_listings'))).toBe(false);
});
test('unverified callbacks cannot use the old confirmation shortcut',async()=>{
  await expect(service.confirmPayment('t','fake')).rejects.toMatchObject({status:503});
  expect(pool.query).not.toHaveBeenCalled();
});
test('checkout timeout is configurable and invalid deployment settings fail closed',()=>{
  const old=process.env.PENDING_PAYMENT_TIMEOUT_SECONDS;
  try{process.env.PENDING_PAYMENT_TIMEOUT_SECONDS='60';expect(service.pendingTimeoutSeconds()).toBe(60);
    process.env.PENDING_PAYMENT_TIMEOUT_SECONDS='0';expect(()=>service.pendingTimeoutSeconds()).toThrow();
  }finally{if(old===undefined)delete process.env.PENDING_PAYMENT_TIMEOUT_SECONDS;else process.env.PENDING_PAYMENT_TIMEOUT_SECONDS=old;}
});
