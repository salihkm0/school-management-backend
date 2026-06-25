const winston = require('winston');
const path = require('path');
const Transport = require('winston-transport');

// Custom transport to save logs to MongoDB
class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    try {
      // Lazy load model to avoid circular dependencies and ensure DB is connected
      const SystemLog = require('../models/SystemLog');
      const mongoose = require('mongoose');
      
      if (mongoose.connection.readyState === 1) { // 1 = connected
        const logEntry = new SystemLog({
          level: info.level,
          message: info.message,
          meta: info.meta || Object.assign({}, info, { level: undefined, message: undefined, timestamp: undefined }),
          timestamp: new Date()
        });
        
        logEntry.save().then(savedLog => {
          // Emit to administration dashboard via socket
          // Skip if the log is about the broadcast itself to prevent infinite loops
          if (info.message && !info.message.includes('new_system_log')) {
            try {
              const { broadcastToRole } = require('../config/socket');
              broadcastToRole('administration', 'new_system_log', savedLog);
            } catch (e) {
              // Socket might not be initialized yet
            }
          }
        }).catch(err => {
          // Fallback to console if DB fails
          console.error('Failed to save log to MongoDB:', err);
        });
      }
    } catch (error) {
      // Ignore if model is not loaded yet or other errors
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log')
    }),
    new MongoDBTransport()
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;