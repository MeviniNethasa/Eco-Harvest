// backend/src/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables from backend/.env or root
dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/stripe', require('./routes/stripeRoutes'));
app.use('/api/farmers', require('./routes/farmerRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    server: 'EcoHarvest Node.js + Express API',
    database: 'MongoDB Atlas',
    timestamp: new Date().toISOString(),
  });
});

// Root welcome endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to EcoHarvest Backend REST API',
    documentation: '/api/health',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`🚀 EcoHarvest Express Server running on port ${PORT}`);
  console.log(`📡 Base URL: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=============================================`);
});

module.exports = { app, server };
