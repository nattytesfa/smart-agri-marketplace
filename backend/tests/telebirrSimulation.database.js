// Full wallet/escrow regression plus simulation assertions in a disposable schema.
process.env.WALLET_TEST='1';
process.env.TELEBIRR_DEMO_TEST='1';
require('./simulation.database');
