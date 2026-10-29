jest.mock('../src/config/db', () => ({query:jest.fn()}));
const pool=require('../src/config/db');
const {calculateDistance,summarizeCluster,findNearbyClusters}=require('../src/modules/digitalDebo/clustering.util');
test('Haversine is meter accurate at Ethiopian latitudes',()=>{
  expect(calculateDistance(9,38,9,38)).toBe(0);
  expect(calculateDistance(9,38,9.01,38)).toBeCloseTo(1111.95,1);
});
test('PostgreSQL numeric strings aggregate numerically',()=>{
  const result=summarizeCluster([{quantity:'2.5',price_per_unit:'200',social_trust_score:'0.8'},
    {quantity:'3',price_per_unit:'400',social_trust_score:'1'}],5);
  expect(result.total_quantity).toBe(5.5);expect(result.average_price_per_unit).toBe(300);expect(result.meets_target).toBe(true);
});
test('clustering excludes deleted/reserved listings and compares meters',async()=>{
  pool.query.mockResolvedValue({rows:[]});
  await findNearbyClusters({crop_type:'Teff',lat:9,lng:38,radius:5000});
  const [sql,args]=pool.query.mock.calls[0];
  expect(sql).toContain('::geography');expect(sql).toContain('deleted_at IS NULL');
  expect(sql).toContain("l.status = 'available'");expect(args).toEqual([38,9,1,'Teff',5000,'quintal']);
});
test('invalid coordinates rejected',async()=>{
  await expect(findNearbyClusters({lat:100,lng:38})).rejects.toMatchObject({status:400});
});
