const { body } = require('express-validator');

const upgradeValidator = [
  body('plan_type')
    .optional()
    .isIn(['premium', 'free'])
    .withMessage('plan_type must be "premium" or "free"'),
  body('payment_method')
    .optional()
    .isIn(['telebirr', 'cbe_birr'])
    .withMessage('payment_method must be "telebirr" or "cbe_birr"'),
];

module.exports = { upgradeValidator };