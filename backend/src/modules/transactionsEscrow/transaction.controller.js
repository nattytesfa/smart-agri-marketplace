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
    const { listing_id, batch_id, farmer_id, amount, payment_method } = req.body;

    // Validate: either listing_id or batch_id must be provided
    if (!listing_id && !batch_id) {
      return res.status(400).json({ error: 'Either listing_id or batch_id is required' });
    }

    // Create transaction with escrow locked
    const transaction = await transactionService.createTransaction({
      listing_id,
      batch_id,
      buyer_id: buyerId,
      farmer_id,
      amount,
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
    if (typeof transaction_id!=='string' || !/^[0-9a-f-]{36}$/i.test(transaction_id)) {
      return res.status(400).json({ error: 'Missing transaction_id' });
    }
    await transactionService.recordUnverifiedNotification(transaction_id,req.body);
    res.status(503).json({error:'Payment verification is not configured. Notification recorded as unverified; no payment or inventory state was accepted.'});
  } catch (error) {
    next(error);
  }
};

// GET /api/transactions/:id
const getTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const transaction = await transactionService.getTransaction(id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.buyer_id!==req.user.id && transaction.farmer_id!==req.user.id) return res.status(404).json({error:'Transaction not found'});

    res.status(200).json(transaction);
  } catch (error) {
    next(error);
  }
};

// GET /api/transactions
const getMyTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'buyer'; // Default to buyer
    
    const transactions = await transactionService.getUserTransactions(userId, role);
    res.status(200).json(transactions);
  } catch (error) {
    next(error);
  }
};

// POST /api/transactions/:id/generate-qr
const generateQr = async (req, res, next) => {
  try {
    const { id } = req.params;
    const farmerId = req.user.id;

    // Verify farmer owns this transaction
    const transaction = await transactionService.getTransaction(id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (transaction.farmer_id !== farmerId) {
      return res.status(403).json({ error: 'Not authorized to generate QR for this transaction' });
    }
    if (transaction.payment_status!=='confirmed') return res.status(409).json({error:'Payment is pending; delivery QR cannot be issued yet'});

    // Generate QR token
    const qrToken = await transactionService.generateQrToken(id);

    res.status(200).json({
      transaction_id: id,
      qr_token: qrToken,
      // In production, generate a QR image here using qrcode library
      // For now, we return the token and let mobile generate the QR
    });

  } catch (error) {
    next(error);
  }
};

// POST /api/transactions/:id/release
const releaseEscrow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { qr_token } = req.body;
    const buyerId = req.user.id;

    // Verify transaction exists and belongs to buyer
    const transaction = await transactionService.getTransaction(id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (transaction.buyer_id !== buyerId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Verify QR token matches
    if (typeof qr_token!=='string' || !qr_token || !transaction.qr_token || transaction.qr_token !== qr_token) {
      return res.status(400).json({ error: 'Invalid QR token' });
    }

    // Release escrow
    const changed=await transactionService.releaseEscrow(id);

    res.status(200).json({
      message: changed ? 'Verified prototype fulfillment recorded. No real payout was performed.' : 'Transaction was already processed.',
      simulated: true,
      transaction_id: id,
    });

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
  getTransaction,
  getMyTransactions,
  generateQr,
  releaseEscrow,
  cancelCheckout,
};
