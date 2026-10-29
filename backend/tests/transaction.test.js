jest.mock('../src/config/db',()=>({connect:jest.fn(),query:jest.fn()}));
const pool=require('../src/config/db');
const service=require('../src/modules/transactionsEscrow/transaction.service');
test('database failures roll back reservation and transaction together',async()=>{
  const db={query:jest.fn().mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue({rows:[]}),release:jest.fn()};
  pool.connect.mockResolvedValue(db);
  await expect(service.createTransaction({listing_id:'listing'})).rejects.toThrow('database unavailable');
  expect(db.query).toHaveBeenCalledWith('ROLLBACK');expect(db.release).toHaveBeenCalled();
});
test('escrow release updates listing lifecycle atomically',async()=>{
  pool.query.mockResolvedValue({rows:[{transaction_id:'t'}]});
  await service.releaseEscrow('t');
  expect(pool.query.mock.calls[0][0]).toContain('UPDATE produce_listings');
  expect(pool.query.mock.calls[0][1]).toEqual(['t','released']);
});
