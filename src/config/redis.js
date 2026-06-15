// const redis = require('redis');
// const logger = require('../utils/logger');

// let redisClient;

// const connectRedis = async () => {
//   try {
//     redisClient = redis.createClient({
//       url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
//       password: process.env.REDIS_PASSWORD || undefined
//     });

//     redisClient.on('error', (err) => {
//       logger.error('Redis Client Error:', err);
//     });

//     redisClient.on('connect', () => {
//       logger.info('Redis connected successfully');
//     });

//     await redisClient.connect();
//     return redisClient;
//   } catch (error) {
//     logger.error('Redis connection failed:', error);
//     return null;
//   }
// };

// const getCache = async (key) => {
//   if (!redisClient) return null;
//   try {
//     const data = await redisClient.get(key);
//     return data ? JSON.parse(data) : null;
//   } catch (error) {
//     logger.error('Redis get error:', error);
//     return null;
//   }
// };

// const setCache = async (key, value, expireSeconds = 3600) => {
//   if (!redisClient) return false;
//   try {
//     await redisClient.setEx(key, expireSeconds, JSON.stringify(value));
//     return true;
//   } catch (error) {
//     logger.error('Redis set error:', error);
//     return false;
//   }
// };

// const deleteCache = async (key) => {
//   if (!redisClient) return false;
//   try {
//     await redisClient.del(key);
//     return true;
//   } catch (error) {
//     logger.error('Redis delete error:', error);
//     return false;
//   }
// };

// const clearCachePattern = async (pattern) => {
//   if (!redisClient) return false;
//   try {
//     const keys = await redisClient.keys(pattern);
//     if (keys.length > 0) {
//       await redisClient.del(keys);
//     }
//     return true;
//   } catch (error) {
//     logger.error('Redis clear pattern error:', error);
//     return false;
//   }
// };

// module.exports = {
//   connectRedis,
//   getCache,
//   setCache,
//   deleteCache,
//   clearCachePattern
// };



// src/config/redis.js
const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient = null;
let isRedisAvailable = false;

const connectRedis = async () => {
  try {
    // Check for Upstash Redis URL
    const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL;
    const standardRedisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;
    
    let redisUrl;
    
    if (upstashRestUrl && process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Convert Upstash REST URL to Redis protocol
      const url = new URL(upstashRestUrl);
      redisUrl = `rediss://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${url.hostname}:${url.port || 6379}`;
      logger.info('📡 Configuring Upstash Redis connection');
    } 
    else if (standardRedisUrl) {
      redisUrl = standardRedisUrl;
      logger.info('📡 Using standard Redis URL');
    }
    else if (redisHost && redisHost !== 'localhost') {
      redisUrl = `redis://${redisHost}:${redisPort || 6379}`;
      if (process.env.REDIS_PASSWORD) {
        redisUrl = `redis://default:${process.env.REDIS_PASSWORD}@${redisHost}:${redisPort || 6379}`;
      }
      logger.info('📡 Using Redis host/port configuration');
    }
    else {
      logger.warn('⚠️ No Redis configuration found, running without Redis cache');
      return null;
    }
    
    // Create Redis client
    redisClient = createClient({
      url: redisUrl,
      socket: {
        tls: upstashRestUrl ? true : false, // Enable TLS for Upstash
        rejectUnauthorized: false,
        connectTimeout: 10000,
        keepAlive: 5000
      },
      pingInterval: 30000,
      commandsQueueMaxLength: 100,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis connection retry ${times} in ${delay}ms`);
        return delay;
      }
    });
    
    redisClient.on('connect', () => {
      logger.info('✅ Redis connected successfully');
      isRedisAvailable = true;
    });
    
    redisClient.on('ready', () => {
      logger.info('✅ Redis client ready');
    });
    
    redisClient.on('error', (err) => {
      logger.error('❌ Redis connection error:', err.message);
      isRedisAvailable = false;
    });
    
    redisClient.on('end', () => {
      logger.warn('⚠️ Redis connection ended');
      isRedisAvailable = false;
    });
    
    await redisClient.connect();
    
    // Test connection
    await redisClient.ping();
    logger.info('✅ Redis connection verified');
    
    return redisClient;
    
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error.message);
    isRedisAvailable = false;
    return null;
  }
};

// Safe wrapper functions that won't crash if Redis is unavailable
const getCache = async (key) => {
  if (!redisClient || !isRedisAvailable) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Redis GET error:', error.message);
    return null;
  }
};

const setCache = async (key, value, expireSeconds = 3600) => {
  if (!redisClient || !isRedisAvailable) return false;
  try {
    await redisClient.setEx(key, expireSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error('Redis SET error:', error.message);
    return false;
  }
};

const deleteCache = async (key) => {
  if (!redisClient || !isRedisAvailable) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DELETE error:', error.message);
    return false;
  }
};

const clearCachePattern = async (pattern) => {
  if (!redisClient || !isRedisAvailable) return false;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Cleared ${keys.length} cache keys matching pattern: ${pattern}`);
    }
    return true;
  } catch (error) {
    logger.error('Redis clear pattern error:', error.message);
    return false;
  }
};

const isRedisConnected = () => isRedisAvailable;

const disconnectRedis = async () => {
  if (redisClient && isRedisAvailable) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error.message);
    }
  }
};

module.exports = {
  connectRedis,
  getCache,
  setCache,
  deleteCache,
  clearCachePattern,
  isRedisConnected,
  disconnectRedis,
  getRedisClient: () => redisClient
};