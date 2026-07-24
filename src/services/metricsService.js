const os = require('os');
const SystemMetric = require('../models/SystemMetric');
const logger = require('../utils/logger');

let metricsInterval;

const initMetricsCollection = () => {
  // Collect metrics every 15 minutes (900000 ms)
  const INTERVAL_MS = 15 * 60 * 1000;
  
  // Initial collection after 10 seconds (let server start up)
  setTimeout(collectAndSaveMetrics, 10000);
  
  metricsInterval = setInterval(collectAndSaveMetrics, INTERVAL_MS);
  logger.info('📈 System metrics collection started (running every 15 minutes)');
};

const collectAndSaveMetrics = async () => {
  try {
    const cpuLoad = os.loadavg()[0]; // 1-minute load average
    const memUsage = process.memoryUsage();
    
    // Optional: Try to get Socket.io connection count if accessible via a global or function
    // But for now, we leave it at 0 or omit it.

    const metric = new SystemMetric({
      cpuLoad,
      memoryUsed: memUsage.heapUsed,
      totalMemory: memUsage.heapTotal,
      activeConnections: 0
    });

    await metric.save();
  } catch (error) {
    logger.error('Failed to save system metrics:', error);
  }
};

const stopMetricsCollection = () => {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
};

module.exports = {
  initMetricsCollection,
  stopMetricsCollection
};
