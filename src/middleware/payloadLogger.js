const logger = require('../utils/logger');

const payloadLogger = (req, res, next) => {
  // Only log POST, PUT, DELETE requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Clone the body to avoid mutating it and to strip sensitive fields
    const bodyToLog = { ...req.body };
    
    // Obfuscate sensitive fields
    const sensitiveFields = ['password', 'confirmPassword', 'token', 'oldPassword', 'newPassword'];
    sensitiveFields.forEach(field => {
      if (bodyToLog[field]) {
        bodyToLog[field] = '[REDACTED]';
      }
    });

    const logMeta = {
      method: req.method,
      url: req.originalUrl,
      userId: req.user ? req.user.id : 'unauthenticated',
      role: req.user ? req.user.role : 'unauthenticated',
      ip: req.ip || req.connection.remoteAddress,
      payload: bodyToLog
    };

    logger.info(`API Payload: ${req.method} ${req.originalUrl}`, logMeta);
  }
  
  next();
};

module.exports = payloadLogger;
