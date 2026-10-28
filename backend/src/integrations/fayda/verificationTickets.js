const crypto = require('crypto');

// Development, single-process handoff from authenticated API to browser.
// Like the session store, this must be shared before running multiple instances.
const tickets = new Map();
const lifetime = 5 * 60 * 1000;

function issue(userId) {
  for (const [key, entry] of tickets) {
    if (entry.expires <= Date.now()) tickets.delete(key);
  }
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, { userId, expires: Date.now() + lifetime });
  return ticket;
}

function consume(ticket) {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  return entry && entry.expires > Date.now() ? entry.userId : null;
}

module.exports = { issue, consume };
