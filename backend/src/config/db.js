const { Pool } = require('pg');
const config = require('./env');
const { databaseOptions } = require('./databaseTls');

const pool = new Pool({
  ...databaseOptions(config.databaseUrl),
});

module.exports = pool;
