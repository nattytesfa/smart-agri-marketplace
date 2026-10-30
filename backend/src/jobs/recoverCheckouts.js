// Can run from cron/systemd independently of the HTTP server:
// npm run checkouts:recover
const pool=require('../config/db');
require('../modules/transactionsEscrow/transaction.service').recoverCheckouts()
  .then(count=>console.log(`Recovered ${count} expired prototype checkout(s)`))
  .catch(error=>{console.error(error.message);process.exitCode=1;})
  .finally(()=>pool.end());
