const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const userRoutes = require('./modules/users/users.routes');
const listingRoutes = require('./modules/listings/listing.routes');

const app = express();

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

// Global error handler
app.use(errorHandler);

app.use('/api/listings', listingRoutes);

module.exports = app;