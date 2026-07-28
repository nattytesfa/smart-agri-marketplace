/**
 * SMS Gateway Integration - Stub
 * Replace with actual API calls for Telebirr SMS, Twilio, etc.
 */

// Stub: Send SMS
const sendSms = async (phoneNumber, message) => {
  console.log(`[SMS GATEWAY] Sending to: ${phoneNumber}`);
  console.log(`[SMS GATEWAY] Message: ${message}`);
  
  // Simulate API call
  return {
    success: true,
    message_id: `MSG_${Date.now()}`,
    status: 'sent',
  };
};

// Stub: Send bulk SMS
const sendBulkSms = async (phoneNumbers, message) => {
  console.log(`[SMS GATEWAY] Sending bulk SMS to ${phoneNumbers.length} recipients`);
  console.log(`[SMS GATEWAY] Message: ${message}`);
  
  const results = phoneNumbers.map(phone => ({
    phone,
    success: true,
    message_id: `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  }));
  
  return {
    success: true,
    total: results.length,
    results,
  };
};

// Stub: Check SMS status
const checkSmsStatus = async (messageId) => {
  return {
    message_id: messageId,
    status: 'delivered',
    delivered_at: new Date().toISOString(),
  };
};

module.exports = {
  sendSms,
  sendBulkSms,
  checkSmsStatus,
};