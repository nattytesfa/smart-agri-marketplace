const m=require('../src/utils/money');
const {propose}=require('../src/modules/digitalDebo/clustering.util');
test.each([
  ['1','10.075','10.08'],['1','1.005','1.01'],['1','0.005','0.01'],['1','0.004999','0.00'],
  ['0.5','20.15','10.08'],['3','0.335','1.01'],['1e-3','10','0.01'],['1000','0.010075','10.08'],
])('ETB half-up exact line rounding %s × %s', (q,p,expected)=>expect(m.formatMinor(m.lineMinor(q,p))).toBe(expected));
test('sum rounded contribution cents, not floats or unrounded batch values',()=>{
  expect(m.sumMoney(['0.01','0.02','10.08'])).toBe('10.11');
  const p=propose([{listing_id:'a',farmer_id:'a',unit:'quintal',available_quantity:1,price_per_unit:'10.075',distance_meters:0}],1);
  expect(p.estimated_total).toBe('10.08');expect(p.listings[0].unit_price).toBe('10.075');
});
test('arbitrary integer sums do not lose cents',()=>expect(m.sumMoney(['90071992547409.91','0.01'])).toBe('90071992547409.92'));
test('price ceiling uses exact decimals and compatible unit conversion',()=>{
  expect(m.withinPrice('10.075',100,1,'1007.50')).toBe(true);
  expect(m.withinPrice('1.000000000000000001',1,1,'1')).toBe(false);
  expect(m.sameDecimal('10.0750','1.0075e1')).toBe(true);
});
test.each([true,[],{},'NaN','Infinity','-1','1e999',''])('rejects invalid decimal %j',v=>expect(()=>m.lineMinor(1,v)).toThrow());
