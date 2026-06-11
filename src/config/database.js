const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // ── Connection Pool ──────────────────────────────────────────
      maxPoolSize: 20,          // max concurrent connections (was default 5)
      minPoolSize: 5,           // keep at least 5 alive
      maxIdleTimeMS: 30000,     // close idle connections after 30s
      // ── Timeouts ────────────────────────────────────────────────
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 10000,
      // ── Heartbeat ───────────────────────────────────────────────
      heartbeatFrequencyMS: 10000,
      // ── Disable command buffering; fail fast when disconnected ──
      bufferCommands: false,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

module.exports = connectDB;