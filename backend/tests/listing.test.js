const express = require('express');
const request = require('supertest');
const { randomUUID } = require('crypto');

jest.mock('../src/middleware/auth', () => (req,res,next) => {
  if (!req.headers.authorization) return res.status(401).json({error:'Unauthorized'});
  req.user = {id:'farmer'}; next();
});
jest.mock('../src/middleware/rbac', () => ({rbac: () => (req,res,next) =>
  req.headers.authorization === 'Bearer buyer' ? res.status(403).json({error:'Farmer required'}) : next()}));
jest.mock('../src/modules/listings/listing.service', () => ({
  createListing: jest.fn(), getAvailableListings: jest.fn(),getFarmerListings: jest.fn(),
  createListingsBatch: jest.fn(),updateListing: jest.fn(),deleteListing: jest.fn(),getListing: jest.fn(),
}));
jest.mock('../src/config/supabaseClient', () => ({storage:{from:jest.fn()}}));
jest.mock('../src/config/logger', () => ({error:jest.fn()}));
const service = require('../src/modules/listings/listing.service');
const storage = require('../src/config/supabaseClient').storage;
const app = express();
app.use(express.json());
app.use('/api/listings',require('../src/modules/listings/listing.routes'));
app.use(require('../src/middleware/errorHandler'));
const valid = () => ({client_id:randomUUID(),operation_id:randomUUID(),crop_type:'Teff',variety:'White',quantity:2,price_per_unit:3000,unit:'quintal',kebele:'Bole'});
const post = data => request(app).post('/api/listings').set('Authorization','Bearer farmer').send(data);
beforeEach(() => {
  jest.clearAllMocks();
  service.createListing.mockResolvedValue({listing_id:randomUUID(),version:1});
  service.getAvailableListings.mockResolvedValue([]);
  service.getFarmerListings.mockResolvedValue([]);
  process.env.SUPABASE_URL='https://storage.test';
  storage.from.mockReturnValue({upload:jest.fn().mockResolvedValue({error:null}),getPublicUrl:jest.fn().mockReturnValue({data:{publicUrl:'https://storage.test/crop.jpg'}})});
});
test('creates required-only listing without image',async()=>{
  const data=valid(); const r=await post(data); expect(r.status).toBe(201);
  expect(service.createListing).toHaveBeenCalledWith(data,'farmer');
});
test('accepts null optional fields and GPS zero coordinates',async()=>{
  const r=await post({...valid(),kebele:null,location_lat:0,location_lng:0,image_url:null,harvest_date:null,quality_grade:null,description:null});
  expect(r.status).toBe(201);
});
test('accepts harvest grade multilingual multiline description',async()=>{
  expect((await post({...valid(),harvest_date:'2020-01-02',quality_grade:'A',description:'Fresh\nጤፍ'})).status).toBe(201);
});
test.each([
  ['negative quantity',{quantity:-1}], ['zero quantity',{quantity:0}], ['negative price',{price_per_unit:-2}],
  ['missing crop',{crop_type:''}], ['missing variety',{variety:''}], ['missing location',{kebele:null}],
  ['partial GPS',{location_lat:9}], ['invalid latitude',{location_lat:91,location_lng:38}],
  ['invalid longitude',{location_lat:9,location_lng:181}], ['invalid grade',{quality_grade:'certified'}],
  ['long description',{description:'a'.repeat(501)}], ['future harvest',{harvest_date:'2999-01-01'}],
  ['impossible harvest',{harvest_date:'2026-02-30'}],['unsupported unit',{unit:'10'}],
  ['invalid image URL',{image_url:'javascript:alert(1)'}], ['reserved creation',{status:'reserved'}],
])('rejects %s',async(_,changes)=>{expect((await post({...valid(),...changes})).status).toBe(400);expect(service.createListing).not.toHaveBeenCalled();});
test('requires authentication',async()=>{expect((await request(app).post('/api/listings').send(valid())).status).toBe(401);});
test('buyers cannot create',async()=>{expect((await request(app).post('/api/listings').set('Authorization','Bearer buyer').send(valid())).status).toBe(403);});
test('trusted user identity ignores client farmer_id',async()=>{
  await post({...valid(),farmer_id:'somebody-else'});
  expect(service.createListing.mock.calls[0][1]).toBe('farmer');
});
test('retrieval passes valid search filters',async()=>{
  const r=await request(app).get('/api/listings?crop_type=Teff&lat=0&lng=0&radius=1000&sort=distance&limit=20').set('Authorization','Bearer farmer');
  expect(r.status).toBe(200);expect(service.getAvailableListings.mock.calls[0][0].lat).toBe('0');
});
test.each(['radius=1','lat=91&lng=0','min_price=100&max_price=1','limit=10000','sort=arbitrary','quality_grade=official'])('rejects invalid search %s',async query=>{
  expect((await request(app).get('/api/listings?'+query).set('Authorization','Bearer farmer')).status).toBe(400);
});
test('bulk sync validates optional fields too',async()=>{
  expect((await request(app).post('/api/listings/sync').set('Authorization','Bearer farmer').send({listings:[{...valid(),description:'a'.repeat(501)}]})).status).toBe(400);
});
test('bulk sync returns per-record reconciliation',async()=>{
  service.createListingsBatch.mockResolvedValue({synced:[{client_id:'a',listing_id:'b',version:1}],failed:[]});
  const r=await request(app).post('/api/listings/sync').set('Authorization','Bearer farmer').send({listings:[valid()]});
  expect(r.status).toBe(201);expect(r.body.synced[0].listing_id).toBe('b');
});
test('update requires version and operation UUID',async()=>{
  const id=randomUUID();
  expect((await request(app).put('/api/listings/'+id).set('Authorization','Bearer farmer').send(valid())).status).toBe(400);
  service.updateListing.mockResolvedValue({listing_id:id,version:2});
  expect((await request(app).put('/api/listings/'+id).set('Authorization','Bearer farmer').send({...valid(),version:1})).status).toBe(200);
});
test('delete requires version and passes trusted owner',async()=>{
  const id=randomUUID(); service.deleteListing.mockResolvedValue({listing_id:id});
  expect((await request(app).delete('/api/listings/'+id).set('Authorization','Bearer farmer').send({version:1})).status).toBe(200);
  expect(service.deleteListing).toHaveBeenCalledWith(id,'farmer',1);
});
test('database failure produces an error, not a successful create',async()=>{
  service.createListing.mockRejectedValue(new Error('database unavailable'));
  expect((await post(valid())).status).toBe(500);
});
test('image ownership is checked',async()=>{
  service.getListing.mockResolvedValue({farmer_id:'other'});
  expect((await request(app).post(`/api/listings/${randomUUID()}/images/${randomUUID()}`).set('Authorization','Bearer farmer').attach('image',Buffer.from([255,216,255]),'crop.jpg')).status).toBe(403);
});
test('optional image reference must belong to configured farmer storage',async()=>{
  expect((await post({...valid(),image_url:'https://external.example/crop.jpg'})).status).toBe(400);
  expect((await post({...valid(),image_url:'https://storage.test/storage/v1/object/public/produce-images/farmer/crop.jpg'})).status).toBe(201);
});
test('image upload uses stable owned storage key',async()=>{
  const id=randomUUID(), imageId=randomUUID();service.getListing.mockResolvedValue({farmer_id:'farmer'});
  const r=await request(app).post(`/api/listings/${id}/images/${imageId}`).set('Authorization','Bearer farmer').attach('image',Buffer.from([255,216,255,217]),'crop.jpg');
  expect(r.status).toBe(200);expect(r.body.image_url).toBeTruthy();
  expect(storage.from.mock.results[0].value.upload.mock.calls[0][0]).toBe(`farmer/${id}/${imageId}.jpg`);
});
test('malformed image rejected',async()=>{
  service.getListing.mockResolvedValue({farmer_id:'farmer'});
  expect((await request(app).post(`/api/listings/${randomUUID()}/images/${randomUUID()}`).set('Authorization','Bearer farmer').attach('image',Buffer.from('not an image'),'crop.jpg')).status).toBe(400);
});
test('oversize image rejected with predictable HTTP status',async()=>{
  service.getListing.mockResolvedValue({farmer_id:'farmer'});
  expect((await request(app).post(`/api/listings/${randomUUID()}/images/${randomUUID()}`).set('Authorization','Bearer farmer').attach('image',Buffer.alloc(204801),'crop.jpg')).status).toBe(413);
});
test('storage failure preserves listing and returns retryable error',async()=>{
  service.getListing.mockResolvedValue({farmer_id:'farmer'});
  storage.from.mockReturnValue({upload:jest.fn().mockResolvedValue({error:new Error('storage unavailable')})});
  expect((await request(app).post(`/api/listings/${randomUUID()}/images/${randomUUID()}`).set('Authorization','Bearer farmer').attach('image',Buffer.from([255,216,255,217]),'crop.jpg')).status).toBe(503);
  expect(service.deleteListing).not.toHaveBeenCalled();
});
