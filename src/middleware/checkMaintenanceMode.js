const AppConfig = require('../models/AppConfig');
const cache = require('../config/cache');

const checkMaintenanceMode = async (req, res, next) => {
  // Always allow administration routes
  if (req.originalUrl.startsWith('/api/administration') || req.originalUrl.startsWith('/api/auth')) {
    return next();
  }

  try {
    let isMaintenance = cache.get('maintenance_mode');
    
    if (isMaintenance === undefined) {
      const config = await AppConfig.findOne({ key: 'maintenance_mode' });
      isMaintenance = config ? config.value : false;
      // Cache it for 1 minute
      cache.set('maintenance_mode', isMaintenance, 60);
    }

    if (isMaintenance) {
      return res.status(503).json({ 
        message: 'System is currently under maintenance. Please try again later.' 
      });
    }

    next();
  } catch (error) {
    console.error('Maintenance Check Error:', error);
    next();
  }
};

module.exports = checkMaintenanceMode;
