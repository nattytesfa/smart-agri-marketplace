jest.mock('../src/config/db',()=>({query:jest.fn(),connect:jest.fn()}));
const pool=require('../src/config/db');
const {validateRequest,findNearbyClusters,propose}=require('../src/modules/digitalDebo/clustering.util');
const f={crop_type:'Teff',target_quantity:100,lat:9,lng:38,radius:5000};
const listing=(id,quantity,extra={})=>({listing_id:id,farmer_id:id,unit:'quintal',available_quantity:quantity,price_per_unit:200,distance_meters:10,...extra});
beforeEach(()=>jest.clearAllMocks());
test.each([
  [{target_quantity:0}], [{target_quantity:-1}], [{target_quantity:true}], [{target_quantity:''}],
  [{lat:91}], [{lng:181}], [{lat:null}], [{radius:0}], [{radius:200001}], [{unit:'bag'}], [{unit:'toString'}], [{unit:['kg']}],
  [{max_price:0}], [{max_price:true}], [{delivery_date:'2026-02-30'}], [{delivery_date:'2000-01-01'}], [{quality_grade:'certified'}],
])('rejects invalid request %j',changes=>expect(()=>validateRequest({...f,...changes})).toThrow());
test('default unit and radius',()=>expect(validateRequest({...f,radius:undefined})).toMatchObject({radius:50000,unit:'quintal'}));
test('one farmer partial contribution caps at target',()=>{
  const p=propose([listing('a',140)],100); expect(p.total_quantity).toBe(100);expect(p.listings[0].proposed_quantity).toBe(100);expect(p.estimated_total).toBe('20000.00');
});
test('40 + 35 + 25 quintal example preserves per-farmer pricing',()=>{
  const p=propose([listing('a',40),listing('b',35,{price_per_unit:300}),listing('c',25,{price_per_unit:400})],100);
  expect(p.meets_target).toBe(true);expect(p.farmer_count).toBe(3);expect(p.estimated_total).toBe('28500.00');
});
test('insufficient supply stays incomplete',()=>expect(propose([listing('a',40)],100)).toMatchObject({total_quantity:40,remaining_quantity:60,meets_target:false}));
test('converts compatible units including unit prices',()=>{
  const p=propose([listing('a',1500,{unit:'kg',price_per_unit:20}),listing('b',1,{unit:'ton',price_per_unit:20000})],20);
  expect(p.total_quantity).toBe(20);expect(p.listings[1].proposed_quantity).toBe(0.5);expect(p.estimated_total).toBe('40000.00');
});
test('duplicates and fully reserved stock do not count',()=>{
  const p=propose([listing('a',20),listing('a',20),listing('b',0)],100);expect(p.total_quantity).toBe(20);expect(p.listings).toHaveLength(1);
});
test('fractional and tiny positive requests do not count zero proposals as full',()=>{
  expect(propose([listing('a',0.1),listing('b',0.2)],0.3)).toMatchObject({total_quantity:0.3,meets_target:true});
  expect(propose([],1e-10).meets_target).toBe(false);
  expect(propose([listing('a',1)],1e-10).listings[0].proposed_quantity).toBe(1e-10);
});
test('deterministic distance then listing ID order',()=>expect(propose([listing('z',10),listing('a',20),listing('b',30,{distance_meters:1})],40).listings.map(l=>l.listing_id)).toEqual(['b','a']));
test('spatial query applies crop variety grade radius synchronization and stock filters',async()=>{
  pool.query.mockResolvedValue({rows:[]}); await findNearbyClusters({...f,variety:'White',quality_grade:'A'});
  const [sql,args]=pool.query.mock.calls[0];expect(args).toEqual([38,9,'Teff',5000,'White','A']);
  for(const text of ['::geography','ST_DWithin','location_gps IS NOT NULL','deleted_at IS NULL',"sync_status='cloud'","l.status = 'available'",'public.debo_available(l)>0','lower(l.variety)','l.quality_grade=$6'])expect(sql).toContain(text);
});
test('max price converts requested unit before comparison',async()=>{
  pool.query.mockResolvedValue({rows:[listing('a',100,{unit:'kg',price_per_unit:21}),listing('b',100,{unit:'kg',price_per_unit:19})]});
  expect((await findNearbyClusters({...f,max_price:2000})).map(l=>l.listing_id)).toEqual(['b']);
});
test('failed confirmation transaction rolls back and releases its connection',async()=>{
  const db={query:jest.fn().mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce(new Error('DB failure')).mockResolvedValue({rows:[]}),release:jest.fn()};pool.connect.mockResolvedValue(db);
  const id='11111111-1111-4111-8111-111111111111';
  await expect(require('../src/modules/digitalDebo/debo.service').respond(id,id,id,{action:'accepted',quantity:1})).rejects.toThrow('DB failure');
  expect(db.query).toHaveBeenCalledWith('ROLLBACK');expect(db.release).toHaveBeenCalled();
});
