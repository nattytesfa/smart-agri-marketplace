const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : ['23514','22P02','22007','22008'].includes(err.code) ? 400
    : err.code === '23503' || err.code === '23505' ? 409 : err.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Service temporarily unavailable. Please retry.'
    : err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 200 KB'
    : err.code ? 'Invalid listing data or conflicting operation' : err.message });
};
module.exports = errorHandler;
