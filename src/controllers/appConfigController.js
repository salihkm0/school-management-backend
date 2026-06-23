// src/controllers/appConfigController.js
// Public endpoint — no auth required — returns app version config

// ── In-memory config (edit here to roll out updates) ──────────────────────────
// You can later move this to a DB/environment variable.
const APP_VERSION_CONFIG = {
  android: {
    minVersion: '1.0.0',          // Force-update if app version < this
    latestVersion: '1.0.0',       // Soft-prompt if app version < this
    forceUpdate: false,
    updateMessage: 'A new version of PPMHSS app is available. Please update to continue.',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.ppmhss.app',
    releaseNotes: [
      'Bug fixes and performance improvements',
    ],
  },
  ios: {
    minVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    updateMessage: 'A new version of PPMHSS app is available. Please update to continue.',
    appStoreUrl: 'https://apps.apple.com/app/ppmhss/id000000000',
    releaseNotes: [
      'Bug fixes and performance improvements',
    ],
  },
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
exports.getAppVersion = (req, res) => {
  const platform = (req.query.platform || 'android').toLowerCase();
  const currentVersion = req.query.version || '0.0.0';

  const config = APP_VERSION_CONFIG[platform] || APP_VERSION_CONFIG.android;

  const needsForceUpdate = compareSemver(currentVersion, config.minVersion) < 0;
  const needsSoftUpdate  = compareSemver(currentVersion, config.latestVersion) < 0;

  res.json({
    success: true,
    data: {
      platform,
      currentVersion,
      minVersion: config.minVersion,
      latestVersion: config.latestVersion,
      forceUpdate: needsForceUpdate || config.forceUpdate,
      softUpdate: needsSoftUpdate && !needsForceUpdate && !config.forceUpdate,
      upToDate: !needsForceUpdate && !needsSoftUpdate,
      updateMessage: config.updateMessage,
      storeUrl: platform === 'ios' ? config.appStoreUrl : config.playStoreUrl,
      releaseNotes: config.releaseNotes || [],
    }
  });
};

/**
 * PUT /api/app-config/version (Admin only — for updating the config)
 * Body: { platform, minVersion, latestVersion, forceUpdate, updateMessage }
 */
exports.updateAppVersion = (req, res) => {
  const { platform, minVersion, latestVersion, forceUpdate, updateMessage, releaseNotes } = req.body;

  if (!platform || !APP_VERSION_CONFIG[platform]) {
    return res.status(400).json({ message: 'Invalid platform. Use "android" or "ios".' });
  }
  if (!minVersion || !latestVersion) {
    return res.status(400).json({ message: 'minVersion and latestVersion are required.' });
  }

  // Update in-memory config (restart will reset — move to DB for persistence)
  APP_VERSION_CONFIG[platform] = {
    ...APP_VERSION_CONFIG[platform],
    minVersion,
    latestVersion,
    forceUpdate: forceUpdate ?? APP_VERSION_CONFIG[platform].forceUpdate,
    updateMessage: updateMessage || APP_VERSION_CONFIG[platform].updateMessage,
    releaseNotes: releaseNotes || APP_VERSION_CONFIG[platform].releaseNotes,
  };

  res.json({ success: true, message: 'App version config updated.', data: APP_VERSION_CONFIG[platform] });
};
