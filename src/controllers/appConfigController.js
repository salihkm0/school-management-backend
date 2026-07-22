// src/controllers/appConfigController.js
const AppConfig = require('../models/AppConfig');

const DEFAULT_CONFIG = {
  android: {
    minVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    updateMessage: 'A new version of PPMHSS app is available. Please update to continue.',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.ppmhss.app',
    releaseNotes: ['Bug fixes and performance improvements'],
  },
  ios: {
    minVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    updateMessage: 'A new version of PPMHSS app is available. Please update to continue.',
    appStoreUrl: 'https://apps.apple.com/app/ppmhss/id000000000',
    releaseNotes: ['Bug fixes and performance improvements'],
  }
};

/**
 * Compares two semver strings.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * GET /api/app-config/version
 * Query params: ?platform=android|ios&version=1.0.0
 */
exports.getAppVersion = async (req, res) => {
  try {
    const platform = (req.query.platform || 'android').toLowerCase();
    const currentVersion = req.query.version || '0.0.0';

    let configDoc = await AppConfig.findOne({ key: 'APP_VERSION_CONFIG' });
    let configMap = configDoc ? configDoc.value : DEFAULT_CONFIG;
    
    const config = configMap[platform] || configMap.android;

    const needsForceUpdate = compareSemver(currentVersion, config.minVersion) < 0;
    const needsSoftUpdate  = compareSemver(currentVersion, config.latestVersion) < 0;

    res.json({
      success: true,
      data: {
        platform,
        currentVersion,
        minVersion: config.minVersion,
        latestVersion: config.latestVersion,
        forceUpdate: needsForceUpdate,
        softUpdate: needsSoftUpdate && !needsForceUpdate,
        updateType: config.forceUpdate ? 'force' : 'soft',
        upToDate: !needsForceUpdate && !needsSoftUpdate,
        updateMessage: config.updateMessage,
        storeUrl: platform === 'ios' ? config.appStoreUrl : config.playStoreUrl,
        releaseNotes: config.releaseNotes || [],
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/app-config/version (Admin only — for updating the config)
 * Body: { platform, minVersion, latestVersion, forceUpdate, updateMessage, storeUrl }
 */
exports.updateAppVersion = async (req, res) => {
  try {
    const { platform, latestVersion, minVersion: reqMinVersion, updateType, updateMessage, releaseNotes, storeUrl } = req.body;

    if (!platform || (platform !== 'android' && platform !== 'ios')) {
      return res.status(400).json({ message: 'Invalid platform. Use "android" or "ios".' });
    }
    if (!latestVersion) {
      return res.status(400).json({ message: 'latestVersion is required.' });
    }

    let configDoc = await AppConfig.findOne({ key: 'APP_VERSION_CONFIG' });
    let configMap = configDoc ? configDoc.value : DEFAULT_CONFIG;

    // Based on updateType, we adjust forceUpdate and minVersion
    const forceUpdate = updateType === 'force';
    let minVersion = reqMinVersion || (forceUpdate ? latestVersion : configMap[platform].minVersion); // if soft, minVersion doesn't move up automatically
    
    // Ensure minVersion is never greater than latestVersion (e.g. if downgraded)
    if (compareSemver(minVersion, latestVersion) > 0) {
      minVersion = latestVersion;
    }

    configMap = {
      ...configMap,
      [platform]: {
        ...configMap[platform],
        minVersion,
        latestVersion,
        forceUpdate,
        updateMessage: updateMessage || configMap[platform].updateMessage,
        releaseNotes: releaseNotes || configMap[platform].releaseNotes,
        ...(platform === 'android' && storeUrl ? { playStoreUrl: storeUrl } : {}),
        ...(platform === 'ios' && storeUrl ? { appStoreUrl: storeUrl } : {})
      }
    };

    if (configDoc) {
      configDoc.value = configMap;
      configDoc.markModified('value');
      await configDoc.save();
    } else {
      await AppConfig.create({
        key: 'APP_VERSION_CONFIG',
        value: configMap,
        description: 'App version and update requirements'
      });
    }

    // Save History
    const AppUpdateHistory = require('../models/AppUpdateHistory');
    await AppUpdateHistory.create({
      platform,
      version: latestVersion,
      updateType: forceUpdate ? 'force' : 'soft',
      storeUrl: storeUrl || (platform === 'ios' ? configMap[platform].appStoreUrl : configMap[platform].playStoreUrl),
      createdBy: req.user ? req.user._id : null
    });

    res.json({ success: true, message: 'App version config updated.', data: configMap[platform] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/app-config/history
 * Fetch the history of app version updates.
 */
exports.getAppUpdateHistory = async (req, res) => {
  try {
    const AppUpdateHistory = require('../models/AppUpdateHistory');
    const history = await AppUpdateHistory.find().sort({ createdAt: -1 }).limit(50).populate('createdBy', 'name email');
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
