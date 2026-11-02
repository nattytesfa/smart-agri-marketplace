const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');
const simulationConfig = require('./modules/telebirrSimulation/config');
if (simulationConfig.available()) simulationConfig.configuration();

// Disabled UAT must not affect existing marketplace startup. Explicit opt-in
// validates merchant-specific configuration before opening the HTTP listener.
if (process.env.TELEBIRR_UAT_ENABLED === 'true') {
  require('./modules/telebirrUat/provider').config();
}

const PORT = config.port;
let expiring = false;
const expireDebo = async () => {
  if (expiring) return;
  expiring = true;
  try { await require('./modules/digitalDebo/debo.service').expireBatches(); }
  catch (e) { logger.error(`Digital Debo expiration failed: ${e.message}`); }
  finally { expiring = false; }
};
setInterval(expireDebo, 60000).unref();

app.listen(PORT, () => {
  logger.info(`🚀 Backend running on http://localhost:${PORT}`);
  logger.info(`📡 Health check: http://localhost:${PORT}/health`);
});
