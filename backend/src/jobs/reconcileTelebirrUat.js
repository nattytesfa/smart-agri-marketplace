const pool = require('../config/db');
require('../modules/telebirrUat/service').recover()
  .then(count => console.log(`Reviewed ${count} UAT funding attempt(s); no wallet credits issued`))
  .catch(() => { console.error('UAT reconciliation unavailable'); process.exitCode = 1; })
  .finally(() => pool.end());
