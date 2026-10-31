// Shared token contract: only opaque, random delivery references are displayed.
// Raw tokens are returned once; only SHA-256 digests are persisted.
const { randomBytes, createHash } = require('crypto');
exports.generate = () => randomBytes(32).toString('base64url');
exports.hash = token => createHash('sha256').update(token).digest('hex');
