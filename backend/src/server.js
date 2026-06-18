const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`🚀 Backend running on http://localhost:${PORT}`);
  logger.info(`📡 Health check: http://localhost:${PORT}/health`);
});