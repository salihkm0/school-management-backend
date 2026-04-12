// src/config/socket.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Notification = require("../models/Notification");
const logger = require("../utils/logger");

const connectedUsers = new Map();
const userRooms = new Map();
const userHeartbeats = new Map();
let ioInstance = null;

// Configuration constants
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 35000; // 35 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

// Broadcast functions that will be exported
const broadcastToClass = (classId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`class:${classId}`).emit(event, data);
    logger.info(`Broadcast to class ${classId}: ${event}`);
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to class");
  }
};

const broadcastToRole = (role, event, data) => {
  if (ioInstance) {
    ioInstance.to(`role:${role}`).emit(event, data);
    logger.info(`Broadcast to role ${role}: ${event}`);
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to role");
  }
};

const broadcastToUser = (userId, event, data) => {
  if (ioInstance) {
    console.log(`📡 Broadcasting to user ${userId}: ${event}`);
    console.log(`Data:`, JSON.stringify(data, null, 2));
    
    // Emit to both rooms for redundancy
    ioInstance.to(`user:${userId}`).emit(event, data);
    ioInstance.to(`user:${userId}:notifications`).emit(event, data);
    
    logger.info(`Broadcast to user ${userId}: ${event}`);
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to user");
  }
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

const isUserConnected = (userId) => {
  return connectedUsers.has(userId);
};

// Helper function to send pending notifications
async function sendPendingNotifications(socket, userId) {
  try {
    const pendingNotifications = await Notification.find({
      userId,
      deliveredAt: null,
      createdAt: { $lt: new Date(Date.now() - 5000) } // Older than 5 seconds
    }).sort({ createdAt: -1 }).limit(50);
    
    if (pendingNotifications.length > 0) {
      logger.info(`Sending ${pendingNotifications.length} pending notifications to user ${userId}`);
      
      for (const notification of pendingNotifications) {
        const notificationPayload = {
          id: notification._id,
          _id: notification._id,
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type || 'info',
          data: notification.data,
          timestamp: notification.createdAt,
          createdAt: notification.createdAt,
          read: notification.isRead,
          isRead: notification.isRead,
          readAt: notification.readAt
        };
        
        socket.emit("notification", notificationPayload);
        socket.emit("new_notification", notificationPayload);
        
        // Mark as delivered
        await Notification.findByIdAndUpdate(notification._id, {
          deliveredAt: new Date()
        });
      }
    }
  } catch (error) {
    logger.error(`Error sending pending notifications to user ${userId}:`, error);
  }
}

// Setup heartbeat monitoring for a socket
const setupHeartbeat = (socket, userId) => {
  // Clear existing heartbeat interval
  if (userHeartbeats.has(userId)) {
    clearInterval(userHeartbeats.get(userId));
  }
  
  // Set up heartbeat listener
  socket.on("heartbeat", (data) => {
    const now = new Date();
    const clientTime = data.timestamp ? new Date(data.timestamp) : now;
    const latency = now - clientTime;
    
    // Update last heartbeat time
    socket.lastHeartbeat = now;
    
    // Respond to heartbeat
    socket.emit("heartbeat:response", {
      timestamp: now,
      clientTime: data.timestamp,
      latency: latency,
      serverTime: now.toISOString()
    });
    
    // Log high latency
    if (latency > 1000) {
      logger.warn(`High latency detected for user ${userId}: ${latency}ms`);
    }
  });
  
  // Monitor heartbeat timeout
  const heartbeatMonitor = setInterval(() => {
    if (socket.connected && socket.lastHeartbeat) {
      const timeSinceLastHeartbeat = Date.now() - socket.lastHeartbeat;
      if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
        logger.warn(`Heartbeat timeout for user ${userId}, disconnecting...`);
        socket.disconnect(true);
      }
    }
  }, HEARTBEAT_INTERVAL);
  
  userHeartbeats.set(userId, heartbeatMonitor);
  
  // Initial heartbeat
  socket.lastHeartbeat = Date.now();
};

const setupSocket = (io) => {
  ioInstance = io;

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Get token from multiple possible sources
      let token = socket.handshake.auth.token;
      
      // Check auth object for token
      if (!token && socket.handshake.auth) {
        token = socket.handshake.auth.token;
      }

      // Also check query parameter
      if (!token && socket.handshake.query) {
        token = socket.handshake.query.token;
      }

      // Also check headers
      if (!token && socket.handshake.headers) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      logger.info(`Socket.IO authentication attempt - Token present: ${!!token}`);

      if (!token) {
        logger.error("Socket.IO authentication failed: No token provided");
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.info(`Token decoded successfully for user: ${decoded.id}`);

        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
          logger.error("Socket.IO authentication failed: User not found");
          return next(new Error("Authentication error: User not found"));
        }

        if (!user.isActive) {
          logger.error("Socket.IO authentication failed: User account disabled");
          return next(new Error("Authentication error: Account disabled"));
        }

        socket.user = user;
        logger.info(`Socket.IO authenticated: ${user.email} (${user.role})`);
        next();
      } catch (jwtError) {
        logger.error("Socket.IO JWT verification failed:", jwtError.message);
        return next(new Error("Authentication error: Invalid token"));
      }
    } catch (error) {
      logger.error("Socket.IO authentication error:", error.message);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    const userRole = socket.user.role;
    const userName = socket.user.name || socket.user.email;
    
    // Store connection info
    connectedUsers.set(userId, {
      socketId: socket.id,
      role: userRole,
      name: userName,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    logger.info(`User connected: ${userId} (${userRole}) - ${userName}`);
    logger.info(`Socket connected: ${socket.id} - User: ${socket.user.email}`);
    logger.info(`Total connected users: ${connectedUsers.size}`);

    // Join user to role-based rooms
    socket.join(`role:${userRole}`);
    socket.join(`user:${userId}`);
    socket.join(`user:${userId}:notifications`); // IMPORTANT: Join notification room
    
    logger.info(`User ${userId} joined rooms: user:${userId} and user:${userId}:notifications`);
    
    // Join role-specific rooms
    if (userRole === "staff") {
      socket.join(`staff:${userId}`);
    } else if (userRole === "parent") {
      socket.join(`parent:${userId}`);
    } else if (userRole === "admin") {
      socket.join("admin");
    }

    // Send confirmation to client with connection details
    socket.emit("connected", {
      message: "Connected to Socket.IO server",
      userId: userId,
      role: userRole,
      name: userName,
      timestamp: new Date(),
      serverTime: new Date().toISOString()
    });

    // Broadcast user online to all connected clients
    io.emit("user:online", {
      userId,
      role: userRole,
      name: userName,
      timestamp: new Date(),
      totalConnected: connectedUsers.size
    });

    // Setup heartbeat monitoring
    setupHeartbeat(socket, userId);

    // Send any pending notifications that weren't delivered
    sendPendingNotifications(socket, userId);

    // Handle client ready event
    socket.on("client:ready", (data) => {
      logger.info(`Client ready: ${socket.user.email} - Platform: ${data.platform || 'unknown'}`);
      socket.emit("client:ready:ack", {
        status: "ready",
        timestamp: new Date(),
        userId: userId
      });
    });

    // Handle join class room
    socket.on("join:class", (classId) => {
      if (!classId) {
        socket.emit("error", { message: "Class ID is required" });
        return;
      }
      
      logger.info(`User ${userId} joining class: ${classId}`);
      socket.join(`class:${classId}`);
      
      const rooms = userRooms.get(socket.id) || [];
      if (!rooms.includes(`class:${classId}`)) {
        userRooms.set(socket.id, [...rooms, `class:${classId}`]);
      }
      
      socket.emit("joined:class", {
        classId,
        message: `Successfully joined class ${classId}`,
        timestamp: new Date()
      });
      
      // Notify others in the class (optional)
      socket.to(`class:${classId}`).emit("user:joined:class", {
        userId,
        userName: socket.user.name,
        timestamp: new Date()
      });
    });

    // Handle leave class room
    socket.on("leave:class", (classId) => {
      if (!classId) {
        socket.emit("error", { message: "Class ID is required" });
        return;
      }
      
      logger.info(`User ${userId} leaving class: ${classId}`);
      socket.leave(`class:${classId}`);
      
      const rooms = userRooms.get(socket.id) || [];
      userRooms.set(
        socket.id,
        rooms.filter((r) => r !== `class:${classId}`)
      );
      
      socket.emit("left:class", { 
        classId, 
        message: `Successfully left class ${classId}`,
        timestamp: new Date()
      });
      
      // Notify others in the class (optional)
      socket.to(`class:${classId}`).emit("user:left:class", {
        userId,
        userName: socket.user.name,
        timestamp: new Date()
      });
    });

    // Handle exam start event
    socket.on("exam:start", (data) => {
      const { classId, examId, examName, startTime, duration } = data;
      
      if (!classId || !examId) {
        socket.emit("error", { message: "Class ID and Exam ID are required" });
        return;
      }
      
      logger.info(`Exam start event for class ${classId}: ${examName}`);
      
      io.to(`class:${classId}`).emit("exam:started", {
        examId,
        examName,
        startTime: startTime || new Date(),
        duration: duration || 180,
        startedBy: userId,
        startedByName: socket.user.name,
        timestamp: new Date()
      });
    });

    // Handle marks entered event
    socket.on("marks:entered", (data) => {
      const { studentId, studentName, examId, examName, subjectName, marksObtained, maxMarks, parentIds } = data;
      
      if (!studentId || !parentIds || parentIds.length === 0) {
        socket.emit("error", { message: "Student ID and parent IDs are required" });
        return;
      }
      
      const percentage = (marksObtained / maxMarks) * 100;
      const grade = getGrade(percentage);
      
      logger.info(`Marks entered for student ${studentId}: ${subjectName} - ${marksObtained}/${maxMarks}`);
      
      parentIds.forEach((parentId) => {
        io.to(`user:${parentId}`).emit("marks:updated", {
          studentId,
          studentName,
          examId,
          examName,
          subjectName,
          marksObtained,
          maxMarks,
          percentage: percentage.toFixed(2),
          grade,
          timestamp: new Date()
        });
      });
    });

    // Handle student promotion event
    socket.on("student:promoted", (data) => {
      const { studentId, studentName, fromClass, toClass, status, parentId } = data;
      
      if (!studentId || !parentId) {
        socket.emit("error", { message: "Student ID and parent ID are required" });
        return;
      }
      
      logger.info(`Student promoted: ${studentName} from ${fromClass} to ${toClass}`);
      
      io.to(`user:${parentId}`).emit("student:promoted", {
        studentId,
        studentName,
        fromClass,
        toClass,
        status: status || "passed",
        timestamp: new Date()
      });
    });

    // Handle duty assignment event
    socket.on("duty:assigned", (data) => {
      const { dutyId, staffId, className, dutyDate, dutyType } = data;
      
      if (!dutyId || !staffId) {
        socket.emit("error", { message: "Duty ID and staff ID are required" });
        return;
      }
      
      logger.info(`Duty assigned to staff: ${staffId} - ${dutyType} for ${className}`);
      
      io.to(`user:${staffId}`).emit("duty:assigned", {
        dutyId,
        className,
        dutyDate,
        dutyType,
        assignedBy: userId,
        assignedByName: socket.user.name,
        timestamp: new Date()
      });
    });

    // Handle chat message
    socket.on("chat:message", async (data) => {
      const { to, message, messageType = "text" } = data;
      
      if (!to || !message) {
        socket.emit("error", { message: "Recipient and message are required" });
        return;
      }
      
      const messageData = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: userId,
        fromName: socket.user.name,
        fromRole: userRole,
        to: to,
        message: message,
        messageType: messageType,
        timestamp: new Date(),
        read: false,
        delivered: false
      };

      logger.info(`Chat message from ${socket.user.name} to ${to}`);

      // Send to recipient if online
      const recipientInfo = connectedUsers.get(to);
      if (recipientInfo) {
        io.to(recipientInfo.socketId).emit("chat:message", messageData);
        messageData.delivered = true;
        messageData.deliveredAt = new Date();
      }
      
      // Send delivery confirmation to sender
      socket.emit("chat:message:delivered", {
        id: messageData.id,
        to: to,
        delivered: messageData.delivered,
        timestamp: new Date()
      });
      
      // Send message back to sender for display
      socket.emit("chat:message", messageData);
    });

    // Handle typing indicator
    socket.on("chat:typing", (data) => {
      const { to, isTyping } = data;
      
      if (!to) return;
      
      const recipientInfo = connectedUsers.get(to);
      if (recipientInfo) {
        io.to(recipientInfo.socketId).emit("chat:typing", {
          from: userId,
          fromName: socket.user.name,
          isTyping: isTyping,
          timestamp: new Date()
        });
      }
    });

    // Handle mark notification as read
    socket.on("notification:read", async (data) => {
      const { notificationId } = data;
      
      if (!notificationId) {
        socket.emit("error", { message: "Notification ID is required" });
        return;
      }
      
      try {
        await Notification.findOneAndUpdate(
          { _id: notificationId, userId: userId },
          { isRead: true, readAt: new Date() }
        );
        
        socket.emit("notification:read:confirmed", { 
          notificationId, 
          readAt: new Date() 
        });
        
        logger.info(`Notification ${notificationId} marked as read by user ${userId}`);
      } catch (error) {
        logger.error(`Error marking notification as read: ${error.message}`);
        socket.emit("error", { message: "Failed to mark notification as read" });
      }
    });

    // Handle notification subscription
    socket.on("subscribe:notifications", () => {
      socket.join(`user:${userId}:notifications`);
      logger.info(`User ${userId} subscribed to notifications`);
      
      socket.emit("subscribed:notifications", {
        status: "subscribed",
        timestamp: new Date()
      });
    });

    // Handle notification unsubscription
    socket.on("unsubscribe:notifications", () => {
      socket.leave(`user:${userId}:notifications`);
      logger.info(`User ${userId} unsubscribed from notifications`);
      
      socket.emit("unsubscribed:notifications", {
        status: "unsubscribed",
        timestamp: new Date()
      });
    });

    // Handle notification received acknowledgment
    socket.on("notification:received", async (data) => {
      const { notificationId } = data;
      
      if (!notificationId) return;
      
      try {
        await Notification.findByIdAndUpdate(notificationId, {
          deliveredAt: new Date()
        });
        
        logger.info(`Notification ${notificationId} received by user ${userId}`);
      } catch (error) {
        logger.error(`Error updating notification delivery: ${error.message}`);
      }
    });

    // Handle notification click acknowledgment
    socket.on("notification:clicked", async (data) => {
      const { notificationId } = data;
      
      if (!notificationId) return;
      
      try {
        await Notification.findByIdAndUpdate(notificationId, {
          clickedAt: new Date()
        });
        
        logger.info(`Notification ${notificationId} clicked by user ${userId}`);
        
        // Emit to analytics room for tracking
        io.to("analytics").emit("notification:clicked:analytics", {
          notificationId,
          userId,
          userRole,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error(`Error updating notification click: ${error.message}`);
      }
    });

    // Handle get online users
    socket.on("get:online:users", () => {
      const onlineUsers = Array.from(connectedUsers.entries()).map(([id, info]) => ({
        userId: id,
        role: info.role,
        name: info.name,
        connectedAt: info.connectedAt
      }));
      
      socket.emit("online:users", {
        users: onlineUsers,
        total: onlineUsers.length,
        timestamp: new Date()
      });
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      logger.info(`Socket disconnected: ${socket.id} - User: ${socket.user.email} - Reason: ${reason}`);
      
      // Update last activity
      const userInfo = connectedUsers.get(userId);
      if (userInfo) {
        userInfo.lastActivity = new Date();
        userInfo.disconnectReason = reason;
        connectedUsers.set(userId, userInfo);
      }
      
      // Remove from connected users after a delay (to handle quick reconnects)
      setTimeout(() => {
        const stillConnected = Array.from(io.sockets.sockets.values()).some(
          (s) => s.user && s.user._id.toString() === userId
        );
        
        if (!stillConnected) {
          connectedUsers.delete(userId);
          logger.info(`User ${userId} removed from connected users. Total: ${connectedUsers.size}`);
          
          // Broadcast user offline
          io.emit("user:offline", {
            userId,
            role: userRole,
            name: userName,
            timestamp: new Date(),
            reason: reason,
            totalConnected: connectedUsers.size
          });
        }
      }, 5000);
      
      // Clear heartbeat monitor
      if (userHeartbeats.has(userId)) {
        clearInterval(userHeartbeats.get(userId));
        userHeartbeats.delete(userId);
      }
      
      // Clear user rooms
      userRooms.delete(socket.id);
      
      logger.info(`User disconnected: ${userId}`);
    });
    
    // Handle errors
    socket.on("error", (error) => {
      logger.error(`Socket error for user ${userId}:`, error);
    });
  });

  return io;
};

// Helper function to calculate grade
function getGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}

// Cleanup function for server shutdown
const cleanup = () => {
  logger.info("Cleaning up Socket.IO connections...");
  
  // Clear all heartbeat intervals
  for (const [userId, interval] of userHeartbeats.entries()) {
    clearInterval(interval);
    logger.info(`Cleared heartbeat for user ${userId}`);
  }
  
  userHeartbeats.clear();
  
  // Disconnect all sockets
  if (ioInstance) {
    const sockets = ioInstance.sockets.sockets;
    for (const [id, socket] of sockets) {
      socket.disconnect(true);
    }
  }
  
  connectedUsers.clear();
  userRooms.clear();
  
  logger.info("Socket.IO cleanup completed");
};

module.exports = {
  setupSocket,
  connectedUsers: () => connectedUsers,
  getConnectedUsers,
  isUserConnected,
  broadcastToClass,
  broadcastToRole,
  broadcastToUser,
  cleanup
};