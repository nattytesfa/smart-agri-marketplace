const {
  findNearbyClusters,
  groupIntoClusters,
  summarizeCluster,
} = require('./clustering.util');
const deboService = require('./debo.service');

// POST /api/debo/aggregate
const aggregateListings = async (req, res, next) => {
  try {
    const {
      crop_type,
      target_quantity,
      lat,
      lng,
      radius = 50000, // 50km default
    } = req.body;

    if (!crop_type || !target_quantity || lat == null || lng == null) {
      return res.status(400).json({
        error: 'Missing required fields: crop_type, target_quantity, lat, lng'
      });
    }

    // 1. Find nearby listings
    const nearbyListings = await findNearbyClusters({
      crop_type,
      target_quantity,
      lat,
      lng,
      radius,
    });

    if (nearbyListings.length === 0) {
      return res.status(404).json({
        error: 'No listings found in this area',
        clusters: [],
      });
    }

    // 2. Group into clusters
    const clusters = groupIntoClusters(nearbyListings);

    // 3. Summarize each cluster
    const summarizedClusters = clusters.map((cluster, index) => ({
      cluster_id: index + 1,
      ...summarizeCluster(cluster, target_quantity),
    }));

    // 4. Filter clusters that meet the target quantity
    const viableClusters = summarizedClusters.filter(c => c.meets_target);

    res.status(200).json({
      total_listings_found: nearbyListings.length,
      total_clusters: clusters.length,
      viable_clusters: viableClusters,
      all_clusters: summarizedClusters,
      recommendations: viableClusters.length > 0
        ? `Found ${viableClusters.length} cluster(s) that meet your quantity requirement`
        : 'No cluster meets your quantity requirement. Try increasing radius or reducing target.',
    });

  } catch (error) {
    next(error);
  }
};

// POST /api/debo/batches – create a batch from selected cluster
const createBatch = async (req, res, next) => {
  try {
    const { cluster_listings, crop_type } = req.body;
    const buyerId = req.user.id;

    if (!cluster_listings || cluster_listings.length === 0) {
      return res.status(400).json({ error: 'No listings selected' });
    }

    // Calculate total quantity
    const totalQuantity = cluster_listings.reduce((sum, l) => sum + l.quantity, 0);
    const listingIds = cluster_listings.map(l => l.listing_id);

    // Create batch
    const batchId = await deboService.createBatch(
      buyerId,
      { total_quantity: totalQuantity },
      crop_type
    );

    // Link listings to batch
    await deboService.linkListingsToBatch(batchId, listingIds);

    // Update listing statuses to 'reserved'
    for (const id of listingIds) {
      await pool.query(
        'UPDATE produce_listings SET status = $1 WHERE listing_id = $2',
        ['reserved', id]
      );
    }

    res.status(201).json({
      message: 'Batch created successfully',
      batch_id: batchId,
      total_quantity: totalQuantity,
      farmer_count: cluster_listings.length,
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/debo/batches/:id
const getBatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const batch = await deboService.getBatchDetails(id);

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.status(200).json(batch);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  aggregateListings,
  createBatch,
  getBatch,
};