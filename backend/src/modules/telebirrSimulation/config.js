const fail = message => Object.assign(new Error(message), { status: 503 });
function available() {
  return ['development','test','demo'].includes(process.env.NODE_ENV) &&
    ['TELEBIRR_SIMULATION_ENABLED','SIMULATED_PAYMENTS_ENABLED','DEMO_WALLETS_ENABLED'].every(k => process.env[k] === 'true');
}
function configuration() {
  if (!available()) throw fail('Telebirr simulation is disabled in this environment');
  const expirySeconds = Number(process.env.TELEBIRR_SIMULATION_EXPIRY_SECONDS || '300');
  if (!Number.isSafeInteger(expirySeconds) || expirySeconds < 1 || expirySeconds > 900) throw fail('Invalid simulation expiry configuration');
  return { expirySeconds };
}
module.exports = { available, configuration };
