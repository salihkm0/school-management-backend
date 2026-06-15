// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const connectDB = require('./src/config/database');
const { setupSocket } = require('./src/config/socket');
const errorHandler = require('./src/middleware/errorHandler');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const staffRoutes = require('./src/routes/staffRoutes');
const classRoutes = require('./src/routes/classRoutes');
const examRoutes = require('./src/routes/examRoutes');
const markRoutes = require('./src/routes/markRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const staffDutyRoutes = require('./src/routes/staffDutyRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const subjectRoutes = require('./src/routes/subjectRoutes');
const studentFilterRoutes = require('./src/routes/studentFilterRoutes');
const recentActivityRoutes = require('./src/routes/recentActivityRoutes');
const academicYearRoutes = require('./src/routes/academicYearRoutes');
const subjectClassTemplateRoutes = require('./src/routes/subjectClassTemplateRoutes');
const parentRoutes = require('./src/routes/parentRoutes');
const idCardRoutes = require('./src/routes/pdf/idCardRoutes');
const statisticalDataRoutes = require('./src/routes/pdf/statisticalDataRoutes');
const studentListRoutes = require('./src/routes/pdf/studentListRoutes');
const riceDistributionRoutes = require('./src/routes/pdf/riceDistributionRoutes');
const noonMealRoutes = require('./src/routes/pdf/noonMealRoutes');
const midDayMealRoutes = require('./src/routes/pdf/midDayMealRoutes');
const noonFeedingRegisterRoutes = require('./src/routes/pdf/noonFeedingRegisterRoutes');
const balanceRiceDistributionRoutes = require('./src/routes/pdf/balanceRiceDistributionRoutes');
const bhakshyaBadrathaRoutes = require('./src/routes/pdf/bhakshyaBadrathaRoutes');
const specialRiceDistributionRoutes = require('./src/routes/pdf/specialRiceDistributionRoutes');
const marklistRoutes = require('./src/routes/pdf/marklistRoutes');
const bankAccountDetailsRoutes = require('./src/routes/pdf/bankAccountDetailsRoutes');
const certificateRoutes = require('./src/routes/pdf/certificateRoutes');
const abstractRoutes = require('./src/routes/pdf/abstractRoutes');
const textBookDistributionRoutes = require('./src/routes/pdf/textBookDistributionRoutes');
const classPtaRoutes = require('./src/routes/pdf/classPtaRoutes');
const staffListRoutes = require('./src/routes/pdf/staffListRoutes');
const classTeacherListRoutes = require('./src/routes/pdf/classTeacherListRoutes');
const feeCollectionRoutes = require('./src/routes/pdf/feeCollectionRoutes');
const promotionListRoutes = require('./src/routes/pdf/promotionListRoutes');
const userRoutes = require('./src/routes/userRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const searchRoutes = require('./src/routes/searchRoutes');
const reportCardRoutes = require('./src/routes/pdf/reportCardRoutes');
const historicalImportRoutes = require('./src/routes/historicalImportRoutes');
const jobRoutes = require('./src/routes/jobRoutes');

const app = express();
const server = http.createServer(app);

// Socket.IO configuration
// const io = socketIO(server, {
//   cors: {
//     origin: '*',
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     credentials: true,
//     allowedHeaders: ['Authorization', 'Content-Type']
//   },
//   transports: ['websocket', 'polling'],
//   allowEIO3: true,
//   pingTimeout: 60000,
//   pingInterval: 25000,
//   path: '/socket.io/',
//   allowUpgrades: true,
//   cookie: false
// });


// Socket.IO configuration - OPTIMIZED FOR RENDER FREE TIER
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type']
  },
  // IMPORTANT: Use polling first, then upgrade to websocket
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 120000, // Increased for Render's slower responses
  pingInterval: 25000,
  path: '/socket.io/',
  allowUpgrades: true,
  cookie: false,
  // Render-specific settings
  maxHttpBufferSize: 1e6, // 1 MB
  connectTimeout: 45000,
  // Enable compression
  perMessageDeflate: {
    threshold: 1024 // Compress messages > 1KB
  }
});

// Connect to MongoDB
connectDB();

// Connect to Redis (optional - won't crash if fails)
const { connectRedis, disconnectRedis } = require('./src/config/redis');

connectRedis().then(client => {
  if (client) {
    console.log('🎯 Redis cache layer ready with Upstash');
  } else {
    console.log('⚠️ Running without Redis cache (fallback mode)');
  }
});

// Update shutdown handlers
const gracefulShutdown = async () => {
  console.log('Received shutdown signal, closing connections...');
  await disconnectRedis();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

// // Update shutdown handlers
// const gracefulShutdown = async () => {
//   console.log('Received shutdown signal, closing connections...');
  
//   // Close Puppeteer browsers
//   await closeAbstractBrowser().catch(err => console.error('Error closing abstract browser:', err));
//   await closeBalanceRiceBrowser().catch(err => console.error('Error closing balance rice browser:', err));
  
//   await disconnectRedis();
//   server.close(() => {
//     console.log('Server closed');
//     process.exit(0);
//   });
// };

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);


// Setup Socket.IO
setupSocket(io);

// Set up EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(compression());
app.use(cors({
  origin: '*',
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/staff-duty', staffDutyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/student-filters', studentFilterRoutes);
app.use('/api/recent-activities', recentActivityRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/subject-templates', subjectClassTemplateRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);

//pdf routes
app.use('/api/pdf/statistical-data', statisticalDataRoutes);
app.use('/api/pdf/id-card', idCardRoutes);
app.use('/api/pdf/student-list', studentListRoutes);
app.use('/api/pdf/rice-distribution', riceDistributionRoutes);
app.use('/api/pdf/noon-meal', noonMealRoutes);
app.use('/api/pdf/mid-day-meal', midDayMealRoutes);
app.use('/api/pdf/noon-feeding-register', noonFeedingRegisterRoutes);
app.use('/api/pdf/balance-rice-distribution', balanceRiceDistributionRoutes);
app.use('/api/pdf/bhakshya-badratha', bhakshyaBadrathaRoutes);
app.use('/api/pdf/special-rice-distribution', specialRiceDistributionRoutes);
app.use('/api/pdf/marklist', marklistRoutes);
app.use('/api/pdf/bank-account-details', bankAccountDetailsRoutes);
app.use('/api/pdf/certificate', certificateRoutes);
app.use('/api/pdf/abstract', abstractRoutes);
app.use('/api/pdf/text-book-distribution', textBookDistributionRoutes);
app.use('/api/pdf/class-pta', classPtaRoutes);
app.use('/api/pdf/staff-list', staffListRoutes);
app.use('/api/pdf/class-teacher-list', classTeacherListRoutes);
app.use('/api/pdf/fee-collection', feeCollectionRoutes);
app.use('/api/pdf/promotion-list', promotionListRoutes);
app.use('/api/pdf/report-card', reportCardRoutes);

// Historical mark import (standalone — does not affect main system)
app.use('/api/historical-imports', historicalImportRoutes);

// Background Jobs route
app.use('/api/jobs', jobRoutes);


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    socketIO: io.engine ? 'ready' : 'not ready',
    connections: io.engine?.clientsCount || 0
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'School Management API',
    version: '1.0.0',
    status: 'running'
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5055;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📄 Views directory: ${path.join(__dirname, 'src', 'views')}`);
});

// Start background workers
require('./src/services/queue/workers/pdfWorker');

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});

module.exports = { app, server, io };