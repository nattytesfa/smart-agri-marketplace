const transactionService = require('./transaction.service');
const { validationResult } = require('express-validator');

// POST /api/transactions/initiate
const initiateTransaction = async (req, res, next) => {
  try {
    await transactionService.recoverCheckouts();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const buyerId = req.user.id;
    const { listing_id, batch_id, payment_method, quantity, request_id } = req.body;

    // Validate: either listing_id or batch_id must be provided
    if (!listing_id && !batch_id) {
      return res.status(400).json({ error: 'Either listing_id or batch_id is required' });
    }

    // Create transaction with escrow locked
    const transaction = await transactionService.createTransaction({
      listing_id,
      batch_id,
      buyer_id: buyerId,
      quantity,
      request_id,
      payment_method,
    });

    // No gateway is called. This explicit mode is the evidence that makes a
    // prototype timeout safely cancellable, unlike a missing external callback.
    const paymentResponse = {simulated:true,status:'pending',checkout_url:null};

    res.status(201).json({
      message: 'Prototype checkout recorded. Payment is pending; no funds collected or escrow funded.',
      simulated: true,
      transaction: transaction,
      payment: paymentResponse,
    });

  } catch (error) {
    next(error);
  }
};

// POST /api/webhooks/telebirr
const handleWebhook = async (req, res, next) => {
  try {
    const { transaction_id } = req.body;

    // Verify webhook signature (stub for now)
    if (typeof transaction_id!=='string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(transaction_id)) {
      return res.status(400).json({ error: 'Missing transaction_id' });
    }
    await transactionService.recordUnverifiedNotification(transaction_id,req.body);
    res.status(503).json({error:'Payment verification is not configured. Notification recorded as unverified; no payment or inventory state was accepted.'});
  } catch (error) {
    next(error);
  }
};

const cancelCheckout = async (req,res,next) => {
  try {
    await transactionService.recoverCheckouts();
    res.json(await transactionService.cancelCheckout(req.params.id,req.user.id));
  } catch(e){next(e);}
};

module.exports = {
  initiateTransaction,
  handleWebhook,
  cancelCheckout,
};
