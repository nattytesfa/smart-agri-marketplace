const pool = require('../../config/db');
const money = require('../../utils/money');
const fail = (message) => Object.assign(new Error(message), { status: 400 });
const units = { kg: 1, quintal: 100, ton: 1000 };
const validateRequest = (input) => {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw fail('Request must be an object');
  const keys=['crop_type','target_quantity','unit','lat','lng','radius','variety','quality_grade','max_price','delivery_date','notes','preferred_location'];
  const f=Object.fromEntries(keys.filter(k=>input[k]!=null).map(k=>[k,input[k]]));
  f.unit=input.unit || 'quintal'; f.radius=input.radius ?? 50000;
  for (const key of ['target_quantity','lat','lng','radius']) {
    if (!['string','number'].includes(typeof f[key]) || String(f[key]).trim() === '' || !Number.isFinite(Number(f[key]))) throw fail(`Invalid ${key}`);
    f[key] = Number(f[key]);
  }
  if (typeof f.crop_type !== 'string' || !f.crop_type.trim() || f.crop_type.length > 100) throw fail('Crop type is required');
  f.crop_type = f.crop_type.trim();
  if (f.target_quantity <= 0 || f.target_quantity > 1e9 || Math.abs(f.lat)>90 || Math.abs(f.lng)>180 || f.radius<=0 || f.radius>Number(process.env.DEBO_MAX_RADIUS_METERS || 200000) || typeof f.unit!=='string' || !Object.hasOwn(units,f.unit)) throw fail('Invalid quantity, location, radius or unit');
  for (const key of ['variety','quality_grade','notes','preferred_location']) {
    if (f[key] != null && (typeof f[key] !== 'string' || f[key].length > (key==='notes' ? 500 : 100))) throw fail(`Invalid ${key}`);
  }
  if (f.quality_grade && !['A','B','C','not_graded'].includes(f.quality_grade)) throw fail('Invalid quality grade');
  if (f.max_price != null && (!['string','number'].includes(typeof f.max_price) || !Number.isFinite(Number(f.max_price)) || Number(f.max_price)<=0)) throw fail('Maximum price must be positive');
  if (f.max_price != null) f.max_price=money.positiveDecimal(f.max_price);
  if (f.delivery_date && (!/^\d{4}-\d{2}-\d{2}$/.test(f.delivery_date) || !Number.isFinite(Date.parse(f.delivery_date)) || new Date(f.delivery_date).toISOString().slice(0,10)!==f.delivery_date || f.delivery_date<new Date().toISOString().slice(0,10))) throw fail('Delivery date must be today or later');
  return f;
};
const findNearbyClusters = async (input, db = pool) => {
  const f = validateRequest(input);
  const { rows } = await db.query(`SELECT l.listing_id,l.farmer_id,u.full_name AS farmer_name,l.crop_type,l.variety,l.quality_grade,
    l.unit,l.quantity,l.price_per_unit,l.image_url,l.kebele,l.harvest_date,
    public.debo_available(l) AS available_quantity,
    ST_Distance(l.location_gps::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_meters
    FROM produce_listings l JOIN users u ON u.user_id=l.farmer_id
    WHERE l.status = 'available' AND l.deleted_at IS NULL AND l.sync_status='cloud'
    AND l.location_gps IS NOT NULL AND lower(l.crop_type)=lower($3)
    AND ($5::text IS NULL OR lower(l.variety)=lower($5))
    AND ($6::text IS NULL OR l.quality_grade=$6) AND l.unit IN ('kg','quintal','ton')
    AND public.debo_available(l)>0
    AND ST_DWithin(l.location_gps::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$4)
    ORDER BY distance_meters,l.listing_id`, [f.lng,f.lat,f.crop_type,f.radius,f.variety || null,f.quality_grade || null]);
  return rows.filter(l => Number.isFinite(Number(l.available_quantity)) && Number.isFinite(Number(l.price_per_unit)) && Number(l.price_per_unit)>0 &&
    (f.max_price == null || money.withinPrice(l.price_per_unit,units[f.unit],units[l.unit],f.max_price)));
};
// Distances are calculated by PostGIS. No arbitrary farmer-to-farmer clustering
// excludes otherwise suitable supply inside the buyer's selected radius.
const propose = (listings, target, unit = 'quintal') => {
  let remaining = Number(target);
  const seen = new Set(), contributions = [];
  for (const l of [...listings].sort((a,b)=>Number(a.distance_meters)-Number(b.distance_meters) || String(a.listing_id).localeCompare(String(b.listing_id)))) {
    if (seen.has(l.listing_id) || !units[l.unit] || remaining<=0) continue;
    seen.add(l.listing_id);
    const factor = units[l.unit]/units[unit];
    const q = Math.min(Number(l.available_quantity), Number((remaining/factor).toPrecision(15)));
    if (!(q>0)) continue;
    money.positiveDecimal(q); money.positiveDecimal(l.price_per_unit);
    contributions.push({...l, proposed_quantity:q, conversion_factor:factor, contribution_quantity:q*factor, unit_price:String(l.price_per_unit), subtotal:money.formatMinor(money.lineMinor(q,l.price_per_unit))});
    remaining = Number(Math.max(0,remaining-q*factor).toPrecision(15));
  }
  return { listings:contributions, total_quantity:Number(target)-remaining, remaining_quantity:remaining,
    meets_target:remaining===0, farmer_count:new Set(contributions.map(l=>l.farmer_id)).size,
    estimated_total:money.sumMoney(contributions.map(l=>l.subtotal)), pricing_policy:money.policy, currency:'ETB', unit };
};
module.exports = { findNearbyClusters, propose, validateRequest, units };
