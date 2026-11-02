const fs = require('fs');
const path = require('path');

// Public Supabase CA obtained from the URL published by Supabase Studio.
// Never trust a root copied from an unverified peer connection.
function databaseOptions(connectionString, env = process.env) {
  let url;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch (_) { throw new Error('Valid PostgreSQL DATABASE_URL required'); }
  const hostname = url.hostname;
  // pg-connection-string otherwise overwrites an explicit ssl object when
  // these URL parameters are present. Enforce verified TLS in one place.
  for (const name of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(name);
  const ssl = { rejectUnauthorized: true, servername: hostname };
  if (env.DATABASE_CA_CERT_PATH) {
    try { ssl.ca = fs.readFileSync(path.resolve(env.DATABASE_CA_CERT_PATH), 'utf8'); }
    catch (_) { throw new Error('Configured database CA could not be loaded'); }
  } else if (hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9]+\.supabase\.co$/.test(hostname)) {
    ssl.ca = fs.readFileSync(path.resolve(__dirname, '../../certs/supabase-root-2021.crt'), 'utf8');
  }
  return { connectionString: url.toString(), ssl };
}
module.exports = { databaseOptions };
