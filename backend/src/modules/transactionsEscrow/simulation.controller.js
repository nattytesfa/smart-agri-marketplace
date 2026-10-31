const service = require('./simulation.service');
const action = fn => async (req, res, next) => {
  try { res.json(await fn(req)); } catch (e) { next(e); }
};
exports.list = action(r => service.list(r.user.id));
exports.details = action(r => service.details(r.params.id, r.user.id));
exports.pay = action(r => service.pay(r.params.id, r.user.id, r.body));
exports.ready = action(r => service.ready(r.params.id, r.params.aid, r.user.id));
exports.qr = action(r => service.issueQr(r.params.id, r.params.aid, r.user.id));
exports.verify = action(r => service.verifyQr(r.params.id, r.params.aid, r.user.id, r.body || {}));
exports.settle = action(r => service.settle(r.params.id, r.params.aid, r.user.id));
exports.dispute = action(r => service.dispute(r.params.id, r.params.aid, r.user.id, r.body || {}));
exports.adminList = action(r => service.list(r.user.id, true));
exports.adminDetails = action(r => service.details(r.params.id, r.user.id, true));
exports.resolve = action(r => service.resolve(r.params.did, r.user.id, r.body || {}));
exports.legacyQr = action(() => { throw Object.assign(new Error('Use allocation-level QR generation and verification; legacy reusable QR tokens are disabled'), { status: 410 }); });
