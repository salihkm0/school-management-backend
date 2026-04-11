const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const connectedUsers = new Map();
const userRooms = new Map();

let ioInstance = null;

const setupSocket = (io) => {
  ioInstance = io;
  
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    connectedUsers.set(userId, socket.id);
    
    logger.info(`User connected: ${userId} (${socket.user.role})`);

    socket.join(`role:${socket.user.role}`);
    socket.join(`user:${userId}`);

    if (socket.user.role === 'staff') {
      socket.join(`staff:${userId}`);
    } else if (socket.user.role === 'parent') {
      socket.join(`parent:${userId}`);
    }

    io.emit('user:online', {
      userId,
      role: socket.user.role,
      timestamp: new Date()
    });

    socket.on('join:class', (classId) => {
      socket.join(`class:${classId}`);
      userRooms.set(socket.id, [...(userRooms.get(socket.id) || []), `class:${classId}`]);
    });

    socket.on('leave:class', (classId) => {
      socket.leave(`class:${classId}`);
      const rooms = userRooms.get(socket.id) || [];
      userRooms.set(socket.id, rooms.filter(r => r !== `class:${classId}`));
    });

    socket.on('exam:start', (data) => {
      io.to(`class:${data.classId}`).emit('exam:started', {
        examId: data.examId,
        examName: data.examName,
        startTime: data.startTime,
        duration: data.duration
      });
    });

    socket.on('marks:entered', (data) => {
      data.parentIds.forEach(parentId => {
        io.to(`user:${parentId}`).emit('marks:updated', {
          studentId: data.studentId,
          studentName: data.studentName,
          examId: data.examId,
          examName: data.examName,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          marksObtained: data.marksObtained,
          maxMarks: data.maxMarks
        });
      });
    });

    socket.on('student:promoted', (data) => {
      io.to(`user:${data.parentId}`).emit('student:promoted', {
        studentId: data.studentId,
        studentName: data.studentName,
        fromClass: data.fromClass,
        toClass: data.toClass,
        status: data.status
      });
    });

    socket.on('duty:assigned', (data) => {
      io.to(`user:${data.staffId}`).emit('duty:assigned', {
        dutyId: data.dutyId,
        className: data.className,
        dutyDate: data.dutyDate,
        dutyType: data.dutyType
      });
    });

    socket.on('chat:message', async (data) => {
      const message = {
        id: Date.now(),
        from: userId,
        fromName: socket.user.name,
        to: data.to,
        message: data.message,
        timestamp: new Date(),
        read: false
      };

      const recipientSocketId = connectedUsers.get(data.to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('chat:message', message);
      }
      
      socket.emit('chat:message', message);
    });

    socket.on('chat:typing', (data) => {
      const recipientSocketId = connectedUsers.get(data.to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('chat:typing', {
          from: userId,
          fromName: socket.user.name,
          isTyping: data.isTyping
        });
      }
    });

    socket.on('notification:read', async (data) => {
      socket.emit('notification:read', { notificationId: data.notificationId });
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      userRooms.delete(socket.id);
      
      io.emit('user:offline', {
        userId,
        role: socket.user.role,
        timestamp: new Date()
      });
      
      logger.info(`User disconnected: ${userId}`);
    });
  });

  return io;
};

// Export broadcast functions that use the io instance
const broadcastToClass = (classId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`class:${classId}`).emit(event, data);
  }
};

const broadcastToRole = (role, event, data) => {
  if (ioInstance) {
    ioInstance.to(`role:${role}`).emit(event, data);
  }
};

const broadcastToUser = (userId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
};

module.exports = { 
  setupSocket, 
  connectedUsers,
  broadcastToClass,
  broadcastToRole,
  broadcastToUser
};