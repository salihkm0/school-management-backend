const NodeCache = require('node-cache');

// Standard TTL is 5 minutes
const stdCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

module.exports = stdCache;
