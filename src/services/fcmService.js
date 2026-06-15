const admin = require('firebase-admin');
const logger = require('../utils/logger');

let initialized = false;

const initializeFirebase = () => {
  if (initialized) return;
  
  try {
    // Option 1: Use individual environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      });
    } 
    // Option 2: Use full JSON service account
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    // Option 3: Use default credentials (for development)
    else {
      try {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      } catch (defaultError) {
        logger.warn('No Firebase credentials found. Push notifications disabled.');
        return;
      }
    }
    
    initialized = true;
    logger.info('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  }
};

/**
 * Send push notification to a single device
 */
const sendToDevice = async (token, title, body, data = {}, options = {}) => {
  if (!initialized) {
    logger.warn('Firebase not initialized, skipping push notification');
    return { success: false, error: 'Firebase not initialized' };
  }
  
  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sound: 'default',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'school_management_channel',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      webpush: {
        fcmOptions: {
          link: data?.link || '/',
        },
      },
      token,
      ...options,
    };
    
    const response = await admin.messaging().send(message);
    logger.info(`✅ Push notification sent to device: ${response}`);
    return { success: true, response };
  } catch (error) {
    logger.error(`❌ Failed to send push notification: ${error.message}`);
    
    // If token is invalid, mark it for removal
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      return { success: false, error: error.message, invalidToken: true };
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to multiple devices
 */
const sendToDevices = async (tokens, title, body, data = {}) => {
  if (!initialized || !tokens.length) {
    return { success: false, sent: 0, failed: tokens.length };
  }
  
  const results = await Promise.all(
    tokens.map(async (token) => {
      const result = await sendToDevice(token, title, body, data);
      return { token, ...result };
    })
  );
  
  const sent = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const invalidTokens = results.filter(r => r.invalidToken).map(r => r.token);
  
  return { success: sent > 0, sent, failed, invalidTokens, results };
};

/**
 * Send push notification to a user by their userId
 */
const sendToUser = async (userId, title, body, data = {}) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      logger.info(`User ${userId} has no FCM tokens`);
      return { success: false, sent: 0, message: 'No FCM tokens' };
    }
    
    const tokens = user.getActiveFcmTokens();
    if (tokens.length === 0) {
      return { success: false, sent: 0, message: 'No active tokens' };
    }
    
    const result = await sendToDevices(tokens, title, body, data);
    
    // Remove invalid tokens
    if (result.invalidTokens && result.invalidTokens.length > 0) {
      for (const invalidToken of result.invalidTokens) {
        await user.removeFcmToken(invalidToken);
      }
      logger.info(`Removed ${result.invalidTokens.length} invalid tokens for user ${userId}`);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error sending push to user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to multiple users
 */
const sendToUsers = async (userIds, title, body, data = {}) => {
  const results = await Promise.all(
    userIds.map(async (userId) => {
      const result = await sendToUser(userId, title, body, data);
      return { userId, ...result };
    })
  );
  
  const totalSent = results.reduce((sum, r) => sum + (r.sent || 0), 0);
  const totalFailed = results.reduce((sum, r) => sum + (r.failed || 0), 0);
  
  return { success: totalSent > 0, totalSent, totalFailed, results };
};

/**
 * Register or update FCM token for a user
 */
const registerToken = async (userId, token, deviceInfo = {}) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    await user.addFcmToken(token, deviceInfo);
    logger.info(`✅ FCM token registered for user ${userId}`);
    return { success: true, tokens: user.fcmTokens };
  } catch (error) {
    logger.error(`Error registering FCM token:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Remove FCM token for a user
 */
const unregisterToken = async (userId, token) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    await user.removeFcmToken(token);
    logger.info(`✅ FCM token removed for user ${userId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Error removing FCM token:`, error);
    return { success: false, error: error.message };
  }
};

// Initialize on module load
initializeFirebase();

module.exports = {
  initializeFirebase,
  sendToDevice,
  sendToDevices,
  sendToUser,
  sendToUsers,
  registerToken,
  unregisterToken,
};