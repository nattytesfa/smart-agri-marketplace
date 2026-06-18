const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const config = require('./env');

const supabaseAdmin = createClient(
  config.supabaseUrl,
  config.supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    realtime: {
      transport: WebSocket
    }
  }
);

module.exports = supabaseAdmin;