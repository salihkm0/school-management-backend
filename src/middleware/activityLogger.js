// middleware/activityLogger.js
const ActivityService = require('../services/activityService');
const { SEVERITY } = require('../models/RecentActivity');

// Middleware to log API requests
const logApiRequest = async (req, res, next) => {
  const startTime = Date.now();
  
  // Store original send function
  const originalSend = res.send;
  
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Only log important endpoints
    const importantEndpoints = [
      '/api/students', '/api/staff', '/api/exams', '/api/marks',
      '/api/attendance', '/api/staff-duty', '/api/classes', '/api/subjects'
    ];
    
    const shouldLog = importantEndpoints.some(endpoint => req.originalUrl.includes(endpoint));
    
    if (shouldLog && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) {
      const statusCode = res.statusCode;
      const isSuccess = statusCode >= 200 && statusCode < 300;
      
      ActivityService.logActivity({
        title: `${req.method} ${req.originalUrl}`,
        description: `API ${req.method} request to ${req.originalUrl} completed with status ${statusCode}`,
        activityType: 'system_api_call',
        entityType: 'system',
        performedBy: req.user?._id,
        performedByName: req.user?.name || 'System',
        performedByRole: req.user?.role || 'system',
        details: {
          method: req.method,
          url: req.originalUrl,
          statusCode,
          responseTime: `${responseTime}ms`,
          isSuccess
        },
        severity: isSuccess ? SEVERITY.INFO : SEVERITY.ERROR,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }).catch(console.error);
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = { logApiRequest };