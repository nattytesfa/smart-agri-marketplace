const router=require('express').Router();
const {rbac}=require('../../middleware/rbac');
const config=require('./config');
const service=require('./service');
const handle=fn=>async(req,res,next)=>{try{res.json(await fn(req));}catch(e){next(e);}};
// No operational simulation surface in production, including capabilities.
router.use((req,res,next)=>{
  if(!config.available()) return res.status(404).json({error:'Demo payment method unavailable'});
  try{config.configuration();next();}catch(e){next(e);}
});
router.use(require('../../middleware/auth'));
router.get('/admin',rbac(['admin']),handle(req=>service.list(null,req.query)));
router.use(rbac(['buyer']));
router.get('/payments',handle(req=>service.list(req.user.id,req.query)));
router.post('/payments',handle(req=>service.create(req.user.id,req.body||{})));
router.get('/payments/:id',handle(req=>service.get(req.user.id,req.params.id)));
for(const action of ['approve','decline','cancel']) router.post(`/payments/:id/${action}`,handle(req=>service.act(req.user.id,req.params.id,action,req.body||{})));
module.exports=router;
