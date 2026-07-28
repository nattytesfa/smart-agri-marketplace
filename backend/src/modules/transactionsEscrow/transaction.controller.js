const transactionService = require('./transaction.service');
const telebirr = require('./telebirr.integration');
const { validationResult } = require('express-validator');

// POST /api/transactions/initiate
const initiateTransaction = async (req, res, next) => {
  try {
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

    // If payment_method is 'telebirr', initiate payment
    let paymentResponse = null;
    if (payment_method === 'telebirr' || payment_method === 'cbe_birr') {
      // In sandbox, we skip actual payment
      // In production, we would redirect to payment gateway
      paymentResponse = await telebirr.initiatePayment(
        amount,
        req.user.phone_number,
        transaction.transaction_id
      );
    }

    res.status(201).json({
      message: 'Transaction initiated. Escrow locked.',
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
    const { transaction_id, reference, status } = req.body;

    // Verify webhook signature (stub for now)
    if (!transaction_id) {
      return res.status(400).json({ error: 'Missing transaction_id' });
    }

    if (status === 'completed') {
      // Confirm payment
      await transactionService.confirmPayment(transaction_id, reference);
      
      // Get transaction details to notify farmer
      const transaction = await transactionService.getTransaction(transaction_id);
      
      // Send notification to farmer
      if (transaction) {
        await telebirr.sendSms(
          transaction.farmer_phone,
          `✅ Payment of ETB ${transaction.amount} locked in escrow. Proceed with delivery for transaction ${transaction_id}`
        );
      }
    }

    res.status(200).json({ message: 'Webhook processed' });
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
    if (transaction.qr_token !== qr_token) {
      return res.status(400).json({ error: 'Invalid QR token' });
    }

    // Release escrow
    await transactionService.releaseEscrow(id);

    // Notify farmer
    await telebirr.sendSms(
      transaction.farmer_phone,
      `💰 Funds of ETB ${transaction.amount} released to your wallet for transaction ${id}`
    );

    res.status(200).json({
      message: 'Escrow released successfully',
      transaction_id: id,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  initiateTransaction,
  handleWebhook,
  getTransaction,
  getMyTransactions,
  generateQr,
  releaseEscrow,
};