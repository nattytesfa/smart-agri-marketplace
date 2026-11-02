const router = require('express').Router();
const { rbac } = require('../../middleware/rbac');
const service = require('./service');
const handle = fn => async (req,res,next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
router.use(require('../../middleware/auth'));
router.get('/admin', rbac(['admin']), handle(req => service.list(null,req.query)));
router.use(rbac(['buyer']));
router.get('/capabilities', handle(() => service.capabilities()));
router.get('/', handle(req => service.list(req.user.id,req.query)));
router.post('/', handle(req => service.create(req.user.id,req.body || {})));
router.get('/:id', handle(req => service.get(req.user.id,req.params.id)));
router.post('/:id/verify', handle(req => service.verify(req.user.id,req.params.id)));
router.post('/:id/sdk-complete', handle(req => service.verify(req.user.id,req.params.id,true)));
// No unsigned notification receiver. Add only with the official auth contract.
module.exports = router;
