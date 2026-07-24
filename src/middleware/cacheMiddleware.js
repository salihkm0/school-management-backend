const { getCache, setCache, clearCachePattern } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Middleware to cache API responses in Redis.
 * @param {number} duration - Cache duration in seconds (default: 3600 = 1 hour)
 * @param {string} prefix - Custom prefix for the cache key (default: route base path)
 */
const cacheRoute = (duration = 3600, prefix = '') => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Default prefix is the base route (e.g. /api/classes -> classes)
    const baseRoute = req.baseUrl.split('/').pop();
    const cachePrefix = prefix || baseRoute;
    
    // Construct cache key: prefix:full_url
    // e.g., classes:/api/classes?limit=10
    const cacheKey = `${cachePrefix}:${req.originalUrl}`;

    try {
      const cachedData = await getCache(cacheKey);
      
      if (cachedData) {
        // If data exists in cache, send it and skip route handler
        return res.json(cachedData);
      }

      // If no cache, we need to intercept the response
      // Override res.json to catch the output before it goes to the client
      const originalJson = res.json.bind(res);
      
      res.json = (body) => {
        // Only cache successful responses (e.g., success: true)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Fire and forget caching (don't await it so we don't delay the response)
          setCache(cacheKey, body, duration).catch(err => {
            logger.error(`Error saving cache for ${cacheKey}:`, err);
          });
        }
        
        // Call the original res.json with the body
        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next(); // Continue even if cache fails
    }
  };
};

/**
 * Helper to clear cache patterns when data is modified
 * @param {string} prefix - The prefix of the cache to clear (e.g., 'classes')
 */
const clearCache = async (prefix) => {
  try {
    await clearCachePattern(`${prefix}:*`);
  } catch (error) {
    logger.error(`Error clearing cache for prefix ${prefix}:`, error);
  }
};

/**
 * Middleware to invalidate cache on successful modifications (POST, PUT, DELETE)
 * @param {string} prefix - The prefix of the cache to clear
 */
const invalidateCache = (prefix) => {
  return (req, res, next) => {
    // Only invalidate if the request is successful
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Fire and forget
        clearCache(prefix);
      }
    });
    next();
  };
};

module.exports = {
  cacheRoute,
  clearCache,
  invalidateCache
};
