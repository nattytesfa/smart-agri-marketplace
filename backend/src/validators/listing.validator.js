const { body, query, param } = require('express-validator');

const fields = (prefix = '') => {
  const f = name => body(prefix + name);
  return [
    f('client_id').optional().isUUID(),
    f('operation_id').optional().isUUID(),
    f('version').optional().isInt({ min: 1 }),
    f('crop_type').isString().trim().isLength({ min: 1, max: 80 }).withMessage('Select a crop or enter a custom crop name'),
    f('variety').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Crop variety is required'),
    f('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than zero'),
    f('price_per_unit').isFloat({ gt: 0 }).withMessage('Price must be greater than zero'),
    f('unit').optional().isIn(['quintal', 'kg', 'ton']),
    f('location_lat').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    f('location_lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
    f('kebele').optional({ nullable: true }).isString().trim().isLength({ max: 160 }),
    f('description').optional({ nullable: true }).isString().isLength({ max: 500 }),
    f('quality_grade').optional({ nullable: true }).isIn(['A', 'B', 'C', 'not_graded']),
    f('harvest_date').optional({ nullable: true }).custom(value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10)) {
        throw new Error('Harvest date must be a valid date, not in the future');
      }
      return true;
    }),
    f('image_url').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).custom((value, { req }) => {
      const origin = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
      if (!origin || !value.startsWith(`${origin}/storage/v1/object/public/produce-images/${req.user.id}/`)) {
        throw new Error('Use an image uploaded to your produce storage');
      }
      return true;
    }),
    f('status').optional().isIn(['available', 'sold']),
    f('crop_type').custom((_, { req, pathValues }) => {
      const data = prefix ? req.body.listings[Number(pathValues[0])] : req.body;
      const hasLat = data.location_lat != null;
      const hasLng = data.location_lng != null;
      if (hasLat !== hasLng || (!hasLat && !data.kebele?.trim())) throw new Error('Provide GPS coordinates or a Kebele');
      return true;
    }),
  ];
};
const createListingValidator = fields();
const syncListingsValidator = [body('listings').isArray({ min: 1, max: 50 }), ...fields('listings.*.'), body('listings.*.client_id').isUUID()];
const idValidator = [param('id').isUUID()];
const searchValidator = [
  ...['min_price', 'max_price'].map(k => query(k).optional().isFloat({ min: 0 })),
  query('lat').optional().isFloat({ min: -90, max: 90 }),
  query('lng').optional().isFloat({ min: -180, max: 180 }),
  query('radius').optional().isFloat({ gt: 0, max: 1000000 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0, max: 1000000 }),
  query('sort').optional().isIn(['newest','price_asc','price_desc','distance']),
  query('status').optional().isIn(['available','reserved','sold']),
  query('quality_grade').optional().isIn(['A','B','C','not_graded']),
  query('harvest_from').optional().isISO8601({ strict: true }),
  query('harvest_to').optional().isISO8601({ strict: true }),
  ...['crop_type','location','search','unit'].map(k => query(k).optional().isString().isLength({ max: 160 })),
  query('radius').custom((_, { req }) => {
    if ((req.query.lat == null) !== (req.query.lng == null) ||
      ((req.query.radius != null || req.query.sort === 'distance') && req.query.lat == null)) throw new Error('GPS coordinates are required for distance searches');
    if (req.query.min_price != null && req.query.max_price != null && +req.query.min_price > +req.query.max_price) throw new Error('Minimum price exceeds maximum price');
    return true;
  }),
];
module.exports = { createListingValidator, syncListingsValidator, idValidator, searchValidator };
