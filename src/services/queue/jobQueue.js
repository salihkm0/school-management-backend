const { Queue } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

let redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const isUpstash = redisUrl.includes('upstash');

if (isUpstash && redisUrl.startsWith('redis://')) {
  redisUrl = redisUrl.replace('redis://', 'rediss://');
}

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  tls: isUpstash ? { rejectUnauthorized: false } : undefined,
});

connection.on('error', (err) => {
  console.error('[jobQueue] ioredis error:', err);
});

// Setup queues
const pdfQueue = new Queue('pdf-generation', { connection });
const importQueue = new Queue('bulk-import', { connection });

pdfQueue.on('error', (err) => console.error('[pdfQueue] error:', err));
importQueue.on('error', (err) => console.error('[importQueue] error:', err));

module.exports = {
  connection,
  pdfQueue,
  importQueue,
};
