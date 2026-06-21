const pool = require('../../config/db');

/**
 * Find nearby listings of the same crop within a radius
 * and group them into clusters
 */
const findNearbyClusters = async (filters) => {
  const {
    crop_type,
    target_quantity,
    lat,
    lng,
    radius = 50000, // default 50km in meters
    min_quantity_per_farmer = 1, // minimum quantity per listing
  } = filters;

  let query = `
    SELECT 
      l.listing_id,
      l.farmer_id,
      l.crop_type,
      l.variety,
      l.quantity,
      l.price_per_unit,
      l.unit,
      ST_X(l.location_gps) as lat,
      ST_Y(l.location_gps) as lng,
      fp.social_trust_score,
      ST_Distance(
        l.location_gps,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)
      ) as distance_meters
    FROM produce_listings l
    JOIN farmer_profiles fp ON l.farmer_id = fp.farmer_id
    WHERE l.status = 'available'
      AND l.quantity >= $3
      AND l.crop_type = $4
      AND ST_DWithin(
        l.location_gps,
        ST_SetSRID(ST_MakePoint($1, $2), 4326),
        $5
      )
    ORDER BY distance_meters ASC
  `;

  const values = [lng, lat, min_quantity_per_farmer, crop_type, radius];

  const result = await pool.query(query, values);
  return result.rows;
};

/**
 * Group listings into clusters based on proximity
 * Simple algorithm: sort by distance, group adjacent listings
 */
const groupIntoClusters = (listings, maxDistanceBetweenFarmers = 10000) => {
  if (listings.length === 0) return [];

  const clusters = [];
  let currentCluster = [];
  let lastLat = null;
  let lastLng = null;

  for (const listing of listings) {
    if (currentCluster.length === 0) {
      currentCluster.push(listing);
      lastLat = listing.lat;
      lastLng = listing.lng;
      continue;
    }

    // Calculate distance from current listing to cluster centroid
    const distance = calculateDistance(
      lastLat, lastLng,
      listing.lat, listing.lng
    );

    if (distance <= maxDistanceBetweenFarmers) {
      currentCluster.push(listing);
      // Update centroid (simple average)
      lastLat = currentCluster.reduce((sum, l) => sum + l.lat, 0) / currentCluster.length;
      lastLng = currentCluster.reduce((sum, l) => sum + l.lng, 0) / currentCluster.length;
    } else {
      // Start a new cluster
      clusters.push(currentCluster);
      currentCluster = [listing];
      lastLat = listing.lat;
      lastLng = listing.lng;
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
};

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Create a cluster summary for the buyer
 */
const summarizeCluster = (cluster, targetQuantity) => {
  const totalQuantity = cluster.reduce((sum, l) => sum + l.quantity, 0);
  const avgPrice = cluster.reduce((sum, l) => sum + l.price_per_unit, 0) / cluster.length;
  const avgTrustScore = cluster.reduce((sum, l) => sum + l.social_trust_score, 0) / cluster.length;

  return {
    total_quantity: totalQuantity,
    farmer_count: cluster.length,
    average_price_per_unit: avgPrice,
    average_trust_score: avgTrustScore,
    meets_target: totalQuantity >= targetQuantity,
    listings: cluster.map(l => ({
      listing_id: l.listing_id,
      farmer_id: l.farmer_id,
      quantity: l.quantity,
      price_per_unit: l.price_per_unit,
      trust_score: l.social_trust_score,
      distance_meters: l.distance_meters,
      lat: l.lat,
      lng: l.lng,
    })),
  };
};

module.exports = {
  findNearbyClusters,
  groupIntoClusters,
  summarizeCluster,
  calculateDistance,
};