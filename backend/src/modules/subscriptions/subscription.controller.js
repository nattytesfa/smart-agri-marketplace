const subscriptionService = require('./subscription.service');
const telebirr = require('../transactionsEscrow/telebirr.integration');
const {validationResult} = require('express-validator');

// POST /api/subscriptions/upgrade
const upgradeSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { plan_type = 'premium', payment_method = 'telebirr' } = req.body;

    // Get current subscription
    const current = await subscriptionService.getUserSubscription(userId);
    if (current && current.plan_type === 'premium' && current.is_active) {
      return res.status(400).json({ error: 'Already on Premium plan' });
    }

    // In production, charge the user via Telebirr/CBE
    // For sandbox, we simulate the payment
    let paymentResponse = null;
    if (payment_method === 'telebirr' || payment_method === 'cbe_birr') {
      paymentResponse = await telebirr.initiatePayment(
        299, // Premium fee (ETB/month)
        req.user.phone_number,
        `SUB_${Date.now()}`
      );
    }

    // Create/update subscription
    const subscription = await subscriptionService.createSubscription(
      userId,
      plan_type,
      payment_method
    );

    res.status(201).json({
      message: `Successfully upgraded to ${plan_type} plan`,
      subscription,
      payment: paymentResponse,
    });

  } catch (error) {
    next(error);
  }
};

// GET /api/subscriptions/status
const getSubscriptionStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const subscription = await subscriptionService.getUserSubscription(userId);
    
    res.status(200).json({
      has_subscription: !!subscription,
      is_active: subscription?.is_active || false,
      plan_type: subscription?.plan_type || 'free',
      notification_channel: subscription?.notification_channel || 'push_only',
      expires_at: subscription?.end_date || null,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/subscriptions/cancel
const cancelSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await subscriptionService.cancelSubscription(userId);
    
    if (!result) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    res.status(200).json({
      message: 'Subscription cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upgradeSubscription,
  getSubscriptionStatus,
  cancelSubscription,
};