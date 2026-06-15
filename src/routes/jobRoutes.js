const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pdfQueue, importQueue } = require('../services/queue/jobQueue');

const DOWNLOAD_DIR = path.join(__dirname, '../../uploads/downloads');

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check pdf queue first
    let job = await pdfQueue.getJob(id);
    if (!job) {
      // Check import queue if not in pdf queue
      job = await importQueue.getJob(id);
    }
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;
    const failedReason = job.failedReason;
    
    return res.json({
      id: job.id,
      state, // 'waiting', 'active', 'completed', 'failed', 'delayed'
      progress,
      result,
      error: failedReason
    });
  } catch (err) {
    console.error('Error fetching job status:', err);
    res.status(500).json({ message: 'Error fetching job status' });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check pdf queue first
    let job = await pdfQueue.getJob(id);
    if (!job) {
      job = await importQueue.getJob(id);
    }
    
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    const state = await job.getState();
    if (state !== 'completed') {
      return res.status(400).json({ message: 'Job is not completed yet' });
    }
    
    const result = job.returnvalue;
    if (!result || !result.path) {
      return res.status(404).json({ message: 'Download file not found' });
    }
    
    if (fs.existsSync(result.path)) {
      res.download(result.path, result.originalFilename || result.filename);
    } else {
      res.status(404).json({ message: 'File no longer exists on server' });
    }
  } catch (err) {
    console.error('Error downloading job result:', err);
    res.status(500).json({ message: 'Error downloading file' });
  }
});

module.exports = router;
