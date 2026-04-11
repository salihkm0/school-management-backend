// const express = require('express');
// const http = require('http');
// const socketIO = require('socket.io');
// const cors = require('cors');
// const helmet = require('helmet');
// const compression = require('compression');
// const morgan = require('morgan');
// const dotenv = require('dotenv');
// const path = require('path');

// dotenv.config();

// const connectDB = require('./src/config/database');
// const { setupSocket } = require('./src/config/socket');
// const errorHandler = require('./src/middleware/errorHandler');

// // Import routes
// const authRoutes = require('./src/routes/authRoutes');
// const studentRoutes = require('./src/routes/studentRoutes');
// const staffRoutes = require('./src/routes/staffRoutes');
// const classRoutes = require('./src/routes/classRoutes');
// const examRoutes = require('./src/routes/examRoutes');
// const markRoutes = require('./src/routes/markRoutes');
// const attendanceRoutes = require('./src/routes/attendanceRoutes');
// const staffDutyRoutes = require('./src/routes/staffDutyRoutes');
// const analyticsRoutes = require('./src/routes/analyticsRoutes');
// const notificationRoutes = require('./src/routes/notificationRoutes');
// const subjectRoutes = require('./src/routes/subjectRoutes');

// const app = express();
// const server = http.createServer(app);
// const io = socketIO(server, {
//   cors: {
//     origin: process.env.CORS_ORIGIN?.split(',') || '*',
//     methods: ['GET', 'POST', 'PUT', 'DELETE'],
//     credentials: true
//   }
// });

// // Connect to MongoDB
// connectDB();

// // Setup Socket.IO
// setupSocket(io);

// // Middleware
// app.use(helmet({
//   crossOriginResourcePolicy: { policy: "cross-origin" }
// }));
// app.use(compression());
// app.use(cors({
//   origin: process.env.CORS_ORIGIN?.split(',') || '*',
//   credentials: true
// }));
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(morgan('dev'));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // API Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/students', studentRoutes);
// app.use('/api/staff', staffRoutes);
// app.use('/api/classes', classRoutes);
// app.use('/api/exams', examRoutes);
// app.use('/api/marks', markRoutes);
// app.use('/api/attendance', attendanceRoutes);
// app.use('/api/staff-duty', staffDutyRoutes);
// app.use('/api/analytics', analyticsRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/api/subjects', subjectRoutes);

// // Health check
// app.get('/api/health', (req, res) => {
//   res.status(200).json({ status: 'OK', timestamp: new Date() });
// });

// // Error handling middleware
// app.use(errorHandler);

// // 404 handler
// app.use((req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

// const PORT = process.env.PORT || 5000;

// server.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
//   console.log(`📡 Socket.IO server ready`);
// });

// // Handle unhandled promise rejections
// process.on('unhandledRejection', (err) => {
//   console.error('Unhandled Rejection:', err);
//   server.close(() => process.exit(1));
// });

// process.on('uncaughtException', (err) => {
//   console.error('Uncaught Exception:', err);
//   server.close(() => process.exit(1));
// });

// module.exports = { app, server, io };



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

const app = express();
const server = http.createServer(app);

// IMPORTANT: Socket.IO configuration for Render
const io = socketIO(server, {
  cors: {
    origin: '*', // Allow all origins for mobile app
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type']
  },
  // Critical for Render's proxy
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  // Connection settings
  pingTimeout: 60000,
  pingInterval: 25000,
  // Path setting (optional, default is /socket.io)
  path: '/socket.io/',
  // Allow upgrades
  allowUpgrades: true,
  // Cookie settings
  cookie: false
});

// Connect to MongoDB
connectDB();

// Setup Socket.IO
setupSocket(io);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Disable CSP for Socket.IO
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

// Health check endpoint - IMPORTANT for Render
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

// IMPORTANT: Use process.env.PORT for Render
const PORT = process.env.PORT || 5055;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});

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