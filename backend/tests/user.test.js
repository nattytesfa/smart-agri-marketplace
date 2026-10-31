jest.mock('../src/config/supabaseClient',()=>({auth:{getUser:jest.fn()}}));
jest.mock('../src/middleware/accountIdentity',()=>({resolveAccount:jest.fn().mockResolvedValue(null),diagnostic:jest.fn()}));
const supabase=require('../src/config/supabaseClient');
const auth=require('../src/middleware/auth');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
test('missing Supabase bearer token is rejected',async()=>{
  const res=response(), next=jest.fn();await auth({headers:{}},res,next);
  expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();
});
test('only verified Supabase identity reaches protected listing routes',async()=>{
  require('../src/middleware/accountIdentity').resolveAccount.mockResolvedValueOnce({user_id:'verified-user',role:'farmer'});
  supabase.auth.getUser.mockResolvedValue({data:{user:{id:'verified-user'}},error:null});
  const req={headers:{authorization:'Bearer test-token'}},res=response(),next=jest.fn();
  await auth(req,res,next);expect(req.user.id).toBe('verified-user');expect(next).toHaveBeenCalled();
});
test('invalid session is rejected',async()=>{
  supabase.auth.getUser.mockResolvedValue({data:{user:null},error:{message:'expired'}});
  const res=response();await auth({headers:{authorization:'Bearer expired'}},res,jest.fn());expect(res.status).toHaveBeenCalledWith(401);
});
test('verified subject maps to application ID without changing its role',async()=>{
  require('../src/middleware/accountIdentity').resolveAccount.mockResolvedValueOnce({user_id:'legacy-buyer',role:'buyer'});
  supabase.auth.getUser.mockResolvedValue({data:{user:{id:'auth-buyer'}},error:null});
  const req={headers:{authorization:'Bearer valid'}},res=response(),next=jest.fn();
  await auth(req,res,next);
  expect(req.authUser.id).toBe('auth-buyer'); expect(req.user.id).toBe('legacy-buyer');
  expect(req.account.role).toBe('buyer'); expect(next).toHaveBeenCalled();
});
test('valid but unregistered identity cannot reach protected resources',async()=>{
  supabase.auth.getUser.mockResolvedValue({data:{user:{id:'unregistered'}},error:null});
  const req={headers:{authorization:'Bearer valid'},originalUrl:'/api/transactions'},res=response(),next=jest.fn();
  await auth(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
