/**
 * Telebirr Payment Integration - Stub for development
 * Replace with actual API calls in production
 */

// Stub: Initiate payment
const initiatePayment = async (amount, phoneNumber, transactionId) => {
  console.log(`[TELEBIRR] Initiating payment of ETB ${amount} for transaction ${transactionId}`);
  console.log(`[TELEBIRR] Phone: ${phoneNumber}`);
  
  // Simulate payment processing
  return {
    success: true,
    reference: `TB_${Date.now()}`,
    status: 'pending',
    checkout_url: null, // In sandbox, we skip redirect
  };
};

// Stub: Verify payment status
const verifyPayment = async (reference) => {
  console.log(`[TELEBIRR] Verifying payment for reference: ${reference}`);
  
  // Simulate successful verification
  return {
    success: true,
    status: 'completed',
    amount: 1000,
  };
};

// Stub: Process refund
const processRefund = async (reference, amount) => {
  console.log(`[TELEBIRR] Processing refund of ETB ${amount} for reference: ${reference}`);
  return {
    success: true,
    refund_reference: `REF_${Date.now()}`,
  };
};

// Stub: Send SMS notification
const sendSms = async (phone, message) => {
  console.log(`[TELEBIRR SMS] To: ${phone}`);
  console.log(`[TELEBIRR SMS] Message: ${message}`);
  return { success: true };
};

module.exports = {
  initiatePayment,
  verifyPayment,
  processRefund,
  sendSms,
};