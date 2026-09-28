const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const userRoutes = require('./modules/users/users.routes');
const listingRoutes = require('./modules/listings/listing.routes');
const deboRoutes = require('./modules/digitalDebo/debo.routes');
const transactionRoutes = require('./modules/transactionsEscrow/transaction.routes');
const advisoryRoutes = require('./modules/advisory/advisory.routes');
const subscriptionRoutes = require('./modules/subscriptions/subscription.routes');
const adminRoutes = require('./modules/admin/admin.routes');

const app = express();

// Middleware first
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/debo', deboRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/advisory', advisoryRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler last
app.use(errorHandler);

module.exports = app;
