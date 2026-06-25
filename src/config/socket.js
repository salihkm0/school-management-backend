// // src/config/socket.js
// const jwt = require("jsonwebtoken");
// const User = require("../models/User");
// const Notification = require("../models/Notification");
// const { RecentActivity, ACTIVITY_TYPES, SEVERITY } = require("../models/RecentActivity");
// const logger = require("../utils/logger");

// const connectedUsers = new Map();
// const userRooms = new Map();
// const userHeartbeats = new Map();
// let ioInstance = null;

// // Configuration constants
// const HEARTBEAT_INTERVAL = 30000; // 30 seconds
// const HEARTBEAT_TIMEOUT = 35000; // 35 seconds
// const MAX_RECONNECT_ATTEMPTS = 10;

// // Helper function to calculate grade
// function getGrade(percentage) {
//   if (percentage >= 90) return "A+";
//   if (percentage >= 80) return "A";
//   if (percentage >= 70) return "B+";
//   if (percentage >= 60) return "B";
//   if (percentage >= 50) return "C+";
//   if (percentage >= 40) return "C";
//   if (percentage >= 33) return "D";
//   return "F";
// }

// // Helper function to send pending notifications
// async function sendPendingNotifications(socket, userId) {
//   try {
//     const pendingNotifications = await Notification.find({
//       userId,
//       deliveredAt: null,
//       createdAt: { $lt: new Date(Date.now() - 5000) }, // Older than 5 seconds
//     })
//       .sort({ createdAt: -1 })
//       .limit(50);

//     if (pendingNotifications.length > 0) {
//       logger.info(
//         `Sending ${pendingNotifications.length} pending notifications to user ${userId}`,
//       );

//       for (const notification of pendingNotifications) {
//         const notificationPayload = {
//           id: notification._id,
//           _id: notification._id,
//           userId: notification.userId,
//           title: notification.title,
//           message: notification.message,
//           type: notification.type || "info",
//           data: notification.data,
//           timestamp: notification.createdAt,
//           createdAt: notification.createdAt,
//           read: notification.isRead,
//           isRead: notification.isRead,
//           readAt: notification.readAt,
//         };

//         socket.emit("notification", notificationPayload);

//         // Mark as delivered
//         await Notification.findByIdAndUpdate(notification._id, {
//           deliveredAt: new Date(),
//         });
//       }
//     }
//   } catch (error) {
//     logger.error(
//       `Error sending pending notifications to user ${userId}:`,
//       error,
//     );
//   }
// }

// // Setup heartbeat monitoring for a socket
// const setupHeartbeat = (socket, userId) => {
//   if (userHeartbeats.has(userId)) {
//     clearInterval(userHeartbeats.get(userId));
//   }

//   socket.on("heartbeat", (data) => {
//     const now = new Date();
//     const clientTime = data.timestamp ? new Date(data.timestamp) : now;
//     const latency = now - clientTime;

//     socket.lastHeartbeat = now;

//     socket.emit("heartbeat:response", {
//       timestamp: now,
//       clientTime: data.timestamp,
//       latency: latency,
//       serverTime: now.toISOString(),
//     });

//     if (latency > 1000) {
//       logger.warn(`High latency detected for user ${userId}: ${latency}ms`);
//     }
//   });

//   const heartbeatMonitor = setInterval(() => {
//     if (socket.connected && socket.lastHeartbeat) {
//       const timeSinceLastHeartbeat = Date.now() - socket.lastHeartbeat;
//       if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
//         logger.warn(`Heartbeat timeout for user ${userId}, disconnecting...`);
//         socket.disconnect(true);
//       }
//     }
//   }, HEARTBEAT_INTERVAL);

//   userHeartbeats.set(userId, heartbeatMonitor);
//   socket.lastHeartbeat = Date.now();
// };

// // Broadcast functions
// const broadcastToClass = (classId, event, data) => {
//   if (ioInstance) {
//     ioInstance.to(`class:${classId}`).emit(event, data);
//     ioInstance.to(`class:${classId}:updates`).emit(event, data);
//     logger.info(`Broadcast to class ${classId}: ${event}`);
//   } else {
//     logger.warn("Socket.IO not initialized, cannot broadcast to class");
//   }
// };

// const broadcastToRole = (role, event, data) => {
//   if (ioInstance) {
//     ioInstance.to(`role:${role}`).emit(event, data);
//     logger.info(`Broadcast to role ${role}: ${event}`);
//   } else {
//     logger.warn("Socket.IO not initialized, cannot broadcast to role");
//   }
// };

// const broadcastToUser = (userId, event, data) => {
//   if (ioInstance) {
//     ioInstance.to(`user:${userId}`).emit(event, data);
//     ioInstance.to(`user:${userId}:notifications`).emit(event, data);
//     logger.info(`Broadcast to user ${userId}: ${event}`);
//   } else {
//     logger.warn("Socket.IO not initialized, cannot broadcast to user");
//   }
// };

// const broadcastToAll = (event, data) => {
//   if (ioInstance) {
//     ioInstance.emit(event, data);
//     logger.info(`Broadcast to all: ${event}`);
//   } else {
//     logger.warn("Socket.IO not initialized, cannot broadcast to all");
//   }
// };

// const getConnectedUsers = () => {
//   return Array.from(connectedUsers.keys());
// };

// const isUserConnected = (userId) => {
//   return connectedUsers.has(userId);
// };

// const setupSocket = (io) => {
//   ioInstance = io;

//   logger.info("✅ Socket.IO instance set in setupSocket");

//   // Authentication middleware
//   io.use(async (socket, next) => {
//     try {
//       let token = socket.handshake.auth.token;

//       if (!token && socket.handshake.auth) {
//         token = socket.handshake.auth.token;
//       }

//       if (!token && socket.handshake.query) {
//         token = socket.handshake.query.token;
//       }

//       if (!token && socket.handshake.headers) {
//         const authHeader = socket.handshake.headers.authorization;
//         if (authHeader && authHeader.startsWith("Bearer ")) {
//           token = authHeader.substring(7);
//         }
//       }

//       logger.info(`Socket.IO authentication attempt - Token present: ${!!token}`);

//       if (!token) {
//         logger.error("Socket.IO authentication failed: No token provided");
//         return next(new Error("Authentication error: No token provided"));
//       }

//       try {
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         logger.info(`Token decoded successfully for user: ${decoded.id}`);

//         const user = await User.findById(decoded.id).select("-password");

//         if (!user) {
//           logger.error("Socket.IO authentication failed: User not found");
//           return next(new Error("Authentication error: User not found"));
//         }

//         if (!user.isActive) {
//           logger.error("Socket.IO authentication failed: User account disabled");
//           return next(new Error("Authentication error: Account disabled"));
//         }

//         socket.user = user;
//         logger.info(`Socket.IO authenticated: ${user.email} (${user.role})`);
//         next();
//       } catch (jwtError) {
//         logger.error("Socket.IO JWT verification failed:", jwtError.message);
//         return next(new Error("Authentication error: Invalid token"));
//       }
//     } catch (error) {
//       logger.error("Socket.IO authentication error:", error.message);
//       next(new Error("Authentication error"));
//     }
//   });

//   io.on("connection", (socket) => {
//     const userId = socket.user._id.toString();
//     const userRole = socket.user.role;
//     const userName = socket.user.name || socket.user.email;

//     // Store connection info
//     connectedUsers.set(userId, {
//       socketId: socket.id,
//       role: userRole,
//       name: userName,
//       connectedAt: new Date(),
//       lastActivity: new Date(),
//     });

//     logger.info(`✅ User connected: ${userId} (${userRole}) - ${userName}`);
//     logger.info(`   Socket ID: ${socket.id}`);
//     logger.info(`   Total connected users: ${connectedUsers.size}`);

//     // Join user to all necessary rooms
//     socket.join(`role:${userRole}`);
//     socket.join(`user:${userId}`);
//     socket.join(`user:${userId}:notifications`);
//     socket.join(`user:${userId}:updates`);
//     socket.join(`user:${userId}:activities`);

//     // Role-specific rooms
//     if (userRole === "staff") {
//       socket.join(`staff:${userId}`);
//       socket.join(`role:staff`);
//     } else if (userRole === "parent") {
//       socket.join(`parent:${userId}`);
//       socket.join(`role:parent`);
//     } else if (userRole === "admin") {
//       socket.join("admin");
//       socket.join(`role:admin`);
//     }

//     // Send confirmation
//     socket.emit("connected", {
//       message: "Connected to Socket.IO server",
//       userId: userId,
//       role: userRole,
//       name: userName,
//       socketId: socket.id,
//       timestamp: new Date(),
//       serverTime: new Date().toISOString(),
//     });

//     // Broadcast user online
//     io.emit("user:online", {
//       userId,
//       role: userRole,
//       name: userName,
//       socketId: socket.id,
//       timestamp: new Date(),
//       totalConnected: connectedUsers.size,
//     });

//     setupHeartbeat(socket, userId);
//     sendPendingNotifications(socket, userId);

//     // ==================== CLIENT READY ====================
//     socket.on("client:ready", (data) => {
//       logger.info(`Client ready: ${socket.user.email} - Platform: ${data.platform || "unknown"}`);
//       socket.emit("client:ready:ack", {
//         status: "ready",
//         timestamp: new Date(),
//         userId: userId,
//       });
//     });

//     // ==================== CLASS EVENTS ====================
//     socket.on("join:class", (classId) => {
//       if (!classId) {
//         socket.emit("error", { message: "Class ID is required" });
//         return;
//       }

//       logger.info(`User ${userId} joining class: ${classId}`);
//       socket.join(`class:${classId}`);
//       socket.join(`class:${classId}:updates`);

//       const rooms = userRooms.get(socket.id) || [];
//       if (!rooms.includes(`class:${classId}`)) {
//         userRooms.set(socket.id, [...rooms, `class:${classId}`]);
//       }

//       socket.emit("joined:class", {
//         classId,
//         message: `Successfully joined class ${classId}`,
//         timestamp: new Date(),
//       });

//       socket.to(`class:${classId}`).emit("user:joined:class", {
//         userId,
//         userName: socket.user.name,
//         role: userRole,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("leave:class", (classId) => {
//       if (!classId) return;

//       logger.info(`User ${userId} leaving class: ${classId}`);
//       socket.leave(`class:${classId}`);
//       socket.leave(`class:${classId}:updates`);

//       const rooms = userRooms.get(socket.id) || [];
//       userRooms.set(
//         socket.id,
//         rooms.filter((r) => r !== `class:${classId}`),
//       );

//       socket.emit("left:class", {
//         classId,
//         message: `Successfully left class ${classId}`,
//         timestamp: new Date(),
//       });

//       socket.to(`class:${classId}`).emit("user:left:class", {
//         userId,
//         userName: socket.user.name,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== CLASS CRUD EVENTS ====================
//     socket.on("class:created", (data) => {
//       const { classId, className, academicYear, subjectCount } = data;

//       logger.info(`New class created: ${className}`);

//       broadcastToRole("admin", "class:created", {
//         classId,
//         className,
//         academicYear,
//         subjectCount,
//         createdBy: userId,
//         createdByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("class:updated", (data) => {
//       const { classId, className, changes } = data;

//       logger.info(`Class updated: ${className}`);

//       broadcastToClass(classId, "class:updated", {
//         classId,
//         className,
//         changes,
//         updatedBy: userId,
//         updatedByName: userName,
//         timestamp: new Date(),
//       });

//       broadcastToRole("admin", "class:updated", {
//         classId,
//         className,
//         changes,
//         updatedBy: userId,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("class:deleted", (data) => {
//       const { classId, className, transferredTo } = data;

//       logger.info(`Class deleted: ${className}`);

//       broadcastToRole("admin", "class:deleted", {
//         classId,
//         className,
//         transferredTo,
//         deletedBy: userId,
//         deletedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("class:teacher:assigned", (data) => {
//       const { classId, className, teacherId, teacherName } = data;

//       logger.info(`Class teacher assigned: ${teacherName} to ${className}`);

//       broadcastToClass(classId, "class:teacher:assigned", {
//         classId,
//         className,
//         teacherId,
//         teacherName,
//         assignedBy: userId,
//         assignedByName: userName,
//         timestamp: new Date(),
//       });

//       broadcastToUser(teacherId, "class:teacher:assigned", {
//         classId,
//         className,
//         assignedBy: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("timetable:updated", (data) => {
//       const { classId, className, periodsCount } = data;

//       logger.info(`Timetable updated for class: ${className}`);

//       broadcastToClass(classId, "timetable:updated", {
//         classId,
//         className,
//         periodsCount,
//         updatedBy: userId,
//         updatedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== SUBJECT TEACHER EVENTS ====================
//     socket.on("subject:teacher:assigned", (data) => {
//       const { classId, className, subjectName, teacherName, periodsPerWeek } = data;

//       logger.info(`Subject teacher assigned: ${teacherName} to teach ${subjectName} in ${className}`);

//       broadcastToClass(classId, "subject:teacher:assigned", {
//         classId,
//         className,
//         subjectName,
//         teacherName,
//         periodsPerWeek,
//         assignedBy: userId,
//         assignedByName: userName,
//         timestamp: new Date(),
//       });

//       broadcastToRole("admin", "subject:teacher:assigned", {
//         classId,
//         className,
//         subjectName,
//         teacherName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("subject:teacher:removed", (data) => {
//       const { classId, className, subjectName, teacherName } = data;

//       logger.info(`Subject teacher removed: ${teacherName} from ${subjectName} in ${className}`);

//       broadcastToClass(classId, "subject:teacher:removed", {
//         classId,
//         className,
//         subjectName,
//         teacherName,
//         removedBy: userId,
//         removedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== EXAM EVENTS ====================
//     socket.on("exam:start", (data) => {
//       const { classId, examId, examName, startTime, duration } = data;

//       if (!classId || !examId) {
//         socket.emit("error", { message: "Class ID and Exam ID are required" });
//         return;
//       }

//       logger.info(`Exam start event for class ${classId}: ${examName}`);

//       io.to(`class:${classId}`).emit("exam:started", {
//         examId,
//         examName,
//         startTime: startTime || new Date(),
//         duration: duration || 180,
//         startedBy: userId,
//         startedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("exam:created", (data) => {
//       const { examId, examName, classIds, startDate, endDate, subjectCount } = data;

//       logger.info(`New exam created: ${examName}`);

//       for (const classId of classIds) {
//         io.to(`class:${classId}`).emit("exam:created", {
//           examId,
//           examName,
//           startDate,
//           endDate,
//           subjectCount,
//           timestamp: new Date(),
//         });
//       }

//       broadcastToRole("admin", "exam:created", {
//         examId,
//         examName,
//         classCount: classIds.length,
//         subjectCount,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("exam:updated", (data) => {
//       const { examId, examName, classIds } = data;

//       logger.info(`Exam updated: ${examName}`);

//       for (const classId of classIds) {
//         io.to(`class:${classId}`).emit("exam:updated", {
//           examId,
//           examName,
//           updatedBy: userId,
//           updatedByName: userName,
//           timestamp: new Date(),
//         });
//       }
//     });

//     socket.on("exam:published", (data) => {
//       const { examId, examName, resultsPublishedAt } = data;

//       logger.info(`Exam published: ${examName}`);

//       broadcastToRole("admin", "exam:published", {
//         examId,
//         examName,
//         resultsPublishedAt,
//         publishedBy: userId,
//         publishedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== MARKS EVENTS ====================
//     socket.on("marks:entered", (data) => {
//       const {
//         studentId,
//         studentName,
//         examId,
//         examName,
//         subjectName,
//         marksObtained,
//         maxMarks,
//         parentIds,
//         classId,
//       } = data;

//       if (!studentId || !parentIds || parentIds.length === 0) return;

//       const percentage = (marksObtained / maxMarks) * 100;
//       const grade = getGrade(percentage);

//       logger.info(`Marks entered for student ${studentName}: ${subjectName} - ${marksObtained}/${maxMarks}`);

//       parentIds.forEach((parentId) => {
//         io.to(`user:${parentId}`).emit("marks:updated", {
//           studentId,
//           studentName,
//           examId,
//           examName,
//           subjectName,
//           marksObtained,
//           maxMarks,
//           percentage: percentage.toFixed(2),
//           grade,
//           timestamp: new Date(),
//         });
//       });

//       // Notify class about marks update
//       if (classId) {
//         io.to(`class:${classId}`).emit("marks:entered", {
//           studentName,
//           examName,
//           subjectName,
//           timestamp: new Date(),
//         });
//       }
//     });

//     socket.on("marks:bulk-entered", (data) => {
//       const { classId, examName, count } = data;

//       logger.info(`Bulk marks entered for class ${classId}: ${count} records`);

//       io.to(`class:${classId}`).emit("marks:bulk-entered", {
//         examName,
//         count,
//         enteredBy: userId,
//         enteredByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("marks:finalized", (data) => {
//       const { examId, examName, classId, studentCount } = data;

//       logger.info(`Marks finalized for exam: ${examName}`);

//       io.to(`class:${classId}`).emit("marks:finalized", {
//         examId,
//         examName,
//         studentCount,
//         finalizedBy: userId,
//         finalizedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("marks:reviewed", (data) => {
//       const { examId, examName, classId, reviewedBy } = data;

//       logger.info(`Marks reviewed for exam: ${examName}`);

//       broadcastToRole("admin", "marks:reviewed", {
//         examId,
//         examName,
//         classId,
//         reviewedBy: reviewedBy || userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== STUDENT EVENTS ====================
//     socket.on("student:added", (data) => {
//       const { studentId, studentName, classId } = data;

//       logger.info(`New student added: ${studentName} to class ${classId}`);

//       io.to(`class:${classId}`).emit("student:added", {
//         studentId,
//         studentName,
//         timestamp: new Date(),
//       });

//       broadcastToRole("admin", "student:added", {
//         studentId,
//         studentName,
//         classId,
//         addedBy: userId,
//         addedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("student:updated", (data) => {
//       const { studentId, studentName, classId, changes } = data;

//       logger.info(`Student updated: ${studentName}`);

//       io.to(`class:${classId}`).emit("student:updated", {
//         studentId,
//         studentName,
//         changes,
//         updatedBy: userId,
//         updatedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("student:deleted", (data) => {
//       const { studentId, studentName, classId } = data;

//       logger.info(`Student deleted: ${studentName}`);

//       io.to(`class:${classId}`).emit("student:deleted", {
//         studentId,
//         studentName,
//         deletedBy: userId,
//         deletedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("student:promoted", (data) => {
//       const { studentId, studentName, fromClass, toClass, status, parentId } = data;

//       if (!studentId || !parentId) return;

//       logger.info(`Student promoted: ${studentName} from ${fromClass} to ${toClass}`);

//       io.to(`user:${parentId}`).emit("student:promoted", {
//         studentId,
//         studentName,
//         fromClass,
//         toClass,
//         status: status || "passed",
//         promotedBy: userId,
//         promotedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== ACADEMIC YEAR EVENTS ====================
//     socket.on("academicYear:created", (data) => {
//       const { academicYearId, year, name } = data;

//       logger.info(`New academic year created: ${year}`);

//       broadcastToRole("admin", "academicYear:created", {
//         academicYearId,
//         year,
//         name,
//         createdBy: userId,
//         createdByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("academicYear:set:current", (data) => {
//       const { academicYearId, year, name, previousYear } = data;

//       logger.info(`Current academic year set to: ${year}`);

//       broadcastToRole("admin", "academicYear:set:current", {
//         academicYearId,
//         year,
//         name,
//         previousYear,
//         setBy: userId,
//         setByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== DUTY EVENTS ====================
//     socket.on("duty:assigned", (data) => {
//       const { dutyId, staffId, className, dutyDate, dutyType } = data;

//       if (!dutyId || !staffId) return;

//       logger.info(`Duty assigned to staff: ${staffId} - ${dutyType} for ${className}`);

//       io.to(`user:${staffId}`).emit("duty:assigned", {
//         dutyId,
//         className,
//         dutyDate,
//         dutyType,
//         assignedBy: userId,
//         assignedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("duties:auto-assigned", (data) => {
//       const { dutyType, totalDates, totalAssignments } = data;

//       logger.info(`Auto-assigned duties: ${totalAssignments} duties for ${totalDates} dates`);

//       broadcastToRole("admin", "duties:auto-assigned", {
//         dutyType,
//         totalDates,
//         totalAssignments,
//         assignedBy: userId,
//         assignedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== ATTENDANCE EVENTS ====================
//     socket.on("attendance:warning", (data) => {
//       const { studentId, studentName, month, year, attendancePercentage, parentId } = data;

//       if (!parentId) return;

//       logger.info(`Attendance warning for student ${studentName}: ${attendancePercentage}%`);

//       io.to(`user:${parentId}`).emit("attendance:warning", {
//         studentId,
//         studentName,
//         month,
//         year,
//         attendancePercentage,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("attendance:bulk-updated", (data) => {
//       const { classId, total, warnings } = data;

//       logger.info(`Bulk attendance updated for class ${classId}: ${total} records, ${warnings} warnings`);

//       io.to(`class:${classId}`).emit("attendance:bulk-updated", {
//         total,
//         warnings,
//         updatedBy: userId,
//         updatedByName: userName,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== RECENT ACTIVITY EVENTS ====================
//     socket.on("activity:created", (data) => {
//       const { activityId, title, description, activityType, entityType, severity } = data;

//       logger.info(`New activity: ${title}`);

//       // Broadcast to admins for important activities
//       if (severity === SEVERITY.WARNING || severity === SEVERITY.ERROR) {
//         broadcastToRole("admin", "activity:important", {
//           activityId,
//           title,
//           description,
//           activityType,
//           entityType,
//           severity,
//           timestamp: new Date(),
//         });
//       }

//       // Broadcast to user's personal activity stream
//       broadcastToUser(userId, "activity:created", {
//         activityId,
//         title,
//         description,
//         activityType,
//         severity,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("get:recent:activities", async (data) => {
//       const { limit = 20 } = data || {};

//       try {
//         const activities = await RecentActivity.find()
//           .sort({ createdAt: -1 })
//           .limit(limit)
//           .populate('performedBy', 'name role');

//         socket.emit("recent:activities", {
//           activities,
//           timestamp: new Date(),
//         });
//       } catch (error) {
//         logger.error(`Error fetching recent activities: ${error.message}`);
//         socket.emit("error", { message: "Failed to fetch recent activities" });
//       }
//     });

//     // ==================== SUBSCRIPTION EVENTS ====================
//     socket.on("subscribe:notifications", () => {
//       socket.join(`user:${userId}:notifications`);
//       logger.info(`User ${userId} subscribed to notifications`);
//       socket.emit("subscribed:notifications", { status: "subscribed", timestamp: new Date() });
//     });

//     socket.on("subscribe:updates", () => {
//       socket.join(`user:${userId}:updates`);
//       logger.info(`User ${userId} subscribed to real-time updates`);
//       socket.emit("subscribed:updates", { status: "subscribed", timestamp: new Date() });
//     });

//     socket.on("subscribe:dashboard", () => {
//       socket.join(`user:${userId}:dashboard`);
//       logger.info(`User ${userId} subscribed to dashboard updates`);
//       socket.emit("subscribed:dashboard", { status: "subscribed", timestamp: new Date() });
//     });

//     socket.on("subscribe:activities", () => {
//       socket.join(`user:${userId}:activities`);
//       logger.info(`User ${userId} subscribed to activities`);
//       socket.emit("subscribed:activities", { status: "subscribed", timestamp: new Date() });
//     });

//     socket.on("subscribe:exams", () => {
//       socket.join(`user:${userId}:exams`);
//       logger.info(`User ${userId} subscribed to exam updates`);
//       socket.emit("subscribed:exams", { status: "subscribed", timestamp: new Date() });
//     });

//     socket.on("subscribe:marks", () => {
//       socket.join(`user:${userId}:marks`);
//       logger.info(`User ${userId} subscribed to marks updates`);
//       socket.emit("subscribed:marks", { status: "subscribed", timestamp: new Date() });
//     });

//     // ==================== NOTIFICATION EVENTS ====================
//     socket.on("notification:read", async (data) => {
//       const { notificationId } = data;

//       if (!notificationId) return;

//       try {
//         await Notification.findOneAndUpdate(
//           { _id: notificationId, userId: userId },
//           { isRead: true, readAt: new Date() },
//         );

//         socket.emit("notification:read:confirmed", {
//           notificationId,
//           readAt: new Date(),
//         });

//         logger.info(`Notification ${notificationId} marked as read by user ${userId}`);
//       } catch (error) {
//         logger.error(`Error marking notification as read: ${error.message}`);
//       }
//     });

//     socket.on("notification:received", async (data) => {
//       const { notificationId } = data;

//       if (!notificationId) return;

//       try {
//         await Notification.findByIdAndUpdate(notificationId, {
//           deliveredAt: new Date(),
//         });
//       } catch (error) {
//         logger.error(`Error updating notification delivery: ${error.message}`);
//       }
//     });

//     // ==================== USER MANAGEMENT ====================
//     socket.on("get:online:users", () => {
//       const onlineUsers = Array.from(connectedUsers.entries()).map(([id, info]) => ({
//         userId: id,
//         role: info.role,
//         name: info.name,
//         connectedAt: info.connectedAt,
//         lastActivity: info.lastActivity,
//       }));

//       socket.emit("online:users", {
//         users: onlineUsers,
//         total: onlineUsers.length,
//         timestamp: new Date(),
//       });
//     });

//     socket.on("get:user:status", ({ userId: targetUserId }) => {
//       const isOnline = connectedUsers.has(targetUserId);
//       const userInfo = connectedUsers.get(targetUserId);

//       socket.emit("user:status", {
//         userId: targetUserId,
//         online: isOnline,
//         lastSeen: userInfo?.lastActivity || null,
//         timestamp: new Date(),
//       });
//     });

//     // ==================== CHAT EVENTS ====================
//     socket.on("chat:message", async (data) => {
//       const { to, message, messageType = "text" } = data;

//       if (!to || !message) return;

//       const messageData = {
//         id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//         from: userId,
//         fromName: userName,
//         fromRole: userRole,
//         to: to,
//         message: message,
//         messageType: messageType,
//         timestamp: new Date(),
//         read: false,
//         delivered: false,
//       };

//       logger.info(`Chat message from ${userName} to ${to}`);

//       const recipientInfo = connectedUsers.get(to);
//       if (recipientInfo) {
//         io.to(recipientInfo.socketId).emit("chat:message", messageData);
//         messageData.delivered = true;
//         messageData.deliveredAt = new Date();
//       }

//       socket.emit("chat:message:delivered", {
//         id: messageData.id,
//         to: to,
//         delivered: messageData.delivered,
//         timestamp: new Date(),
//       });

//       socket.emit("chat:message", messageData);
//     });

//     socket.on("chat:typing", (data) => {
//       const { to, isTyping } = data;

//       if (!to) return;

//       const recipientInfo = connectedUsers.get(to);
//       if (recipientInfo) {
//         io.to(recipientInfo.socketId).emit("chat:typing", {
//           from: userId,
//           fromName: userName,
//           isTyping: isTyping,
//           timestamp: new Date(),
//         });
//       }
//     });

//     // ==================== DISCONNECT ====================
//     socket.on("disconnect", (reason) => {
//       logger.info(`Socket disconnected: ${socket.id} - User: ${socket.user.email} - Reason: ${reason}`);

//       const userInfo = connectedUsers.get(userId);
//       if (userInfo) {
//         userInfo.lastActivity = new Date();
//         userInfo.disconnectReason = reason;
//         connectedUsers.set(userId, userInfo);
//       }

//       setTimeout(() => {
//         const stillConnected = Array.from(io.sockets.sockets.values()).some(
//           (s) => s.user && s.user._id.toString() === userId,
//         );

//         if (!stillConnected) {
//           connectedUsers.delete(userId);
//           logger.info(`User ${userId} removed from connected users. Total: ${connectedUsers.size}`);

//           io.emit("user:offline", {
//             userId,
//             role: userRole,
//             name: userName,
//             timestamp: new Date(),
//             reason: reason,
//             totalConnected: connectedUsers.size,
//           });
//         }
//       }, 5000);

//       if (userHeartbeats.has(userId)) {
//         clearInterval(userHeartbeats.get(userId));
//         userHeartbeats.delete(userId);
//       }

//       userRooms.delete(socket.id);
//       logger.info(`User disconnected: ${userId}`);
//     });

//     socket.on("error", (error) => {
//       logger.error(`Socket error for user ${userId}:`, error);
//     });
//   });

//   return io;
// };

// const cleanup = () => {
//   logger.info("Cleaning up Socket.IO connections...");

//   for (const [userId, interval] of userHeartbeats.entries()) {
//     clearInterval(interval);
//     logger.info(`Cleared heartbeat for user ${userId}`);
//   }

//   userHeartbeats.clear();

//   if (ioInstance) {
//     const sockets = ioInstance.sockets.sockets;
//     for (const [id, socket] of sockets) {
//       socket.disconnect(true);
//     }
//   }

//   connectedUsers.clear();
//   userRooms.clear();

//   logger.info("Socket.IO cleanup completed");
// };

// module.exports = {
//   setupSocket,
//   connectedUsers: () => connectedUsers,
//   getConnectedUsers,
//   isUserConnected,
//   broadcastToClass,
//   broadcastToRole,
//   broadcastToUser,
//   broadcastToAll,
//   cleanup,
// };




// src/config/socket.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { RecentActivity, ACTIVITY_TYPES, SEVERITY } = require("../models/RecentActivity");
const logger = require("../utils/logger");

const connectedUsers = new Map();
const userRooms = new Map();
const userHeartbeats = new Map();
let ioInstance = null;

// Configuration constants - RENDER OPTIMIZED
const HEARTBEAT_INTERVAL = 45000; // Increased from 30s to 45s for Render
const HEARTBEAT_TIMEOUT = 60000; // Increased from 35s to 60s for Render
const MAX_RECONNECT_ATTEMPTS = 10;
const CLEANUP_INTERVAL = 60000; // 1 minute cleanup interval

// Helper function to calculate grade
function getGrade(percentage) {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C+";
  if (percentage >= 40) return "C";
  if (percentage >= 33) return "D";
  return "F";
}

// Periodic cleanup of stale connections
let cleanupInterval = null;

const startCleanupInterval = () => {
  if (cleanupInterval) clearInterval(cleanupInterval);
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let staleCount = 0;
    
    for (const [userId, info] of connectedUsers.entries()) {
      const lastActivity = info.lastActivity?.getTime() || 0;
      if (now - lastActivity > 300000) { // 5 minutes inactivity
        connectedUsers.delete(userId);
        staleCount++;
        logger.info(`Cleaned up stale connection for user ${userId}`);
      }
    }
    
    if (staleCount > 0) {
      logger.info(`Cleaned up ${staleCount} stale connections. Total: ${connectedUsers.size}`);
    }
  }, CLEANUP_INTERVAL);
};

// Helper function to send pending notifications
async function sendPendingNotifications(socket, userId) {
  try {
    const pendingNotifications = await Notification.find({
      userId,
      isRead: false,
      deliveredAt: null,
      createdAt: { $lt: new Date(Date.now() - 5000) },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    if (pendingNotifications.length > 0) {
      logger.info(`Sending ${pendingNotifications.length} pending notifications to user ${userId}`);

      for (const notification of pendingNotifications) {
        const notificationPayload = {
          id: notification._id,
          _id: notification._id,
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type || "info",
          data: notification.data,
          timestamp: notification.createdAt,
          createdAt: notification.createdAt,
          read: notification.isRead,
          isRead: notification.isRead,
          readAt: notification.readAt,
        };

        socket.emit("notification", notificationPayload);

        await Notification.findByIdAndUpdate(notification._id, {
          deliveredAt: new Date(),
        });
      }
    }
  } catch (error) {
    logger.error(`Error sending pending notifications to user ${userId}:`, error);
  }
}

// Setup heartbeat monitoring for a socket - RENDER OPTIMIZED
const setupHeartbeat = (socket, userId) => {
  if (userHeartbeats.has(userId)) {
    clearInterval(userHeartbeats.get(userId));
  }

  let consecutiveMissed = 0;
  const MAX_CONSECUTIVE_MISSED = 3;

  socket.on("heartbeat", (data) => {
    const now = new Date();
    const clientTime = data.timestamp ? new Date(data.timestamp) : now;
    const latency = now - clientTime;

    socket.lastHeartbeat = now;
    consecutiveMissed = 0;

    socket.emit("heartbeat:response", {
      timestamp: now,
      clientTime: data.timestamp,
      latency: latency,
      serverTime: now.toISOString(),
    });

    // Update last activity for cleanup
    const userInfo = connectedUsers.get(userId);
    if (userInfo) {
      userInfo.lastActivity = now;
      connectedUsers.set(userId, userInfo);
    }

    if (latency > 2000) { // Increased threshold for Render
      logger.warn(`High latency detected for user ${userId}: ${latency}ms`);
    }
  });

  const heartbeatMonitor = setInterval(() => {
    if (socket.connected) {
      if (socket.lastHeartbeat) {
        const timeSinceLastHeartbeat = Date.now() - socket.lastHeartbeat;
        if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
          consecutiveMissed++;
          logger.warn(`Heartbeat missed ${consecutiveMissed}/${MAX_CONSECUTIVE_MISSED} for user ${userId}`);
          
          if (consecutiveMissed >= MAX_CONSECUTIVE_MISSED) {
            logger.warn(`Heartbeat timeout for user ${userId}, disconnecting...`);
            socket.disconnect(true);
          }
        }
      } else {
        // First heartbeat check
        socket.lastHeartbeat = Date.now();
      }
    }
  }, HEARTBEAT_INTERVAL);

  userHeartbeats.set(userId, heartbeatMonitor);
  socket.lastHeartbeat = Date.now();
};

// Broadcast functions with error handling for Render
const broadcastToClass = (classId, event, data) => {
  if (ioInstance) {
    try {
      ioInstance.to(`class:${classId}`).emit(event, data);
      ioInstance.to(`class:${classId}:updates`).emit(event, data);
      logger.debug(`Broadcast to class ${classId}: ${event}`);
    } catch (error) {
      logger.error(`Error broadcasting to class ${classId}:`, error.message);
    }
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to class");
  }
};

const broadcastToRole = (role, event, data) => {
  if (ioInstance) {
    try {
      ioInstance.to(`role:${role}`).emit(event, data);
      logger.debug(`Broadcast to role ${role}: ${event}`);
    } catch (error) {
      logger.error(`Error broadcasting to role ${role}:`, error.message);
    }
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to role");
  }
};

const broadcastToUser = (userId, event, data) => {
  if (ioInstance) {
    try {
      ioInstance.to(`user:${userId}`).emit(event, data);
      ioInstance.to(`user:${userId}:notifications`).emit(event, data);
      logger.debug(`Broadcast to user ${userId}: ${event}`);
    } catch (error) {
      logger.error(`Error broadcasting to user ${userId}:`, error.message);
    }
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to user");
  }
};

const broadcastToAll = (event, data) => {
  if (ioInstance) {
    try {
      ioInstance.emit(event, data);
      logger.debug(`Broadcast to all: ${event}`);
    } catch (error) {
      logger.error(`Error broadcasting to all:`, error.message);
    }
  } else {
    logger.warn("Socket.IO not initialized, cannot broadcast to all");
  }
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

const isUserConnected = (userId) => {
  return connectedUsers.has(userId);
};

const setupSocket = (io) => {
  ioInstance = io;

  logger.info("✅ Socket.IO instance configured for Render deployment");

  // Authentication middleware with better error handling
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth.token;

      if (!token && socket.handshake.auth) {
        token = socket.handshake.auth.token;
      }

      if (!token && socket.handshake.query) {
        token = socket.handshake.query.token;
      }

      if (!token && socket.handshake.headers) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      logger.debug(`Socket.IO authentication attempt - Token present: ${!!token}`);

      if (!token) {
        logger.error("Socket.IO authentication failed: No token provided");
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.debug(`Token decoded successfully for user: ${decoded.id}`);

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
      lastActivity: new Date(),
      transport: socket.conn.transport.name, // Track transport type (polling/websocket)
    });

    logger.info(`✅ User connected: ${userId} (${userRole}) - ${userName}`);
    logger.info(`   Socket ID: ${socket.id}`);
    logger.info(`   Transport: ${socket.conn.transport.name}`);
    logger.info(`   Total connected users: ${connectedUsers.size}`);

    // Join user rooms
    socket.join(`role:${userRole}`);
    socket.join(`user:${userId}`);
    socket.join(`user:${userId}:notifications`);
    socket.join(`user:${userId}:updates`);
    socket.join(`user:${userId}:activities`);

    if (userRole === "staff") {
      socket.join(`staff:${userId}`);
      socket.join(`role:staff`);
    } else if (userRole === "parent") {
      socket.join(`parent:${userId}`);
      socket.join(`role:parent`);
    } else if (userRole === "admin") {
      socket.join("admin");
      socket.join(`role:admin`);
    } else if (userRole === "administration") {
      socket.join("administration");
      socket.join(`role:administration`);
    }

    // Send connection confirmation
    socket.emit("connected", {
      message: "Connected to Socket.IO server",
      userId: userId,
      role: userRole,
      name: userName,
      socketId: socket.id,
      timestamp: new Date(),
      serverTime: new Date().toISOString(),
      transport: socket.conn.transport.name,
    });

    // Broadcast user online to others
    socket.broadcast.emit("user:online", {
      userId,
      role: userRole,
      name: userName,
      timestamp: new Date(),
      totalConnected: connectedUsers.size,
    });

    setupHeartbeat(socket, userId);
    sendPendingNotifications(socket, userId);

    // Handle transport upgrade (polling -> websocket)
    socket.on("upgrade", () => {
      logger.info(`User ${userId} upgraded to ${socket.conn.transport.name}`);
      const userInfo = connectedUsers.get(userId);
      if (userInfo) {
        userInfo.transport = socket.conn.transport.name;
        connectedUsers.set(userId, userInfo);
      }
    });

    // ==================== CLIENT READY ====================
    socket.on("client:ready", (data) => {
      logger.info(`Client ready: ${socket.user.email} - Platform: ${data.platform || "unknown"}`);
      socket.emit("client:ready:ack", {
        status: "ready",
        timestamp: new Date(),
        userId: userId,
      });
    });

    // ==================== CLASS EVENTS ====================
    socket.on("join:class", (classId) => {
      if (!classId) {
        socket.emit("error", { message: "Class ID is required" });
        return;
      }

      logger.debug(`User ${userId} joining class: ${classId}`);
      socket.join(`class:${classId}`);
      socket.join(`class:${classId}:updates`);

      const rooms = userRooms.get(socket.id) || [];
      if (!rooms.includes(`class:${classId}`)) {
        userRooms.set(socket.id, [...rooms, `class:${classId}`]);
      }

      socket.emit("joined:class", {
        classId,
        message: `Successfully joined class ${classId}`,
        timestamp: new Date(),
      });

      socket.to(`class:${classId}`).emit("user:joined:class", {
        userId,
        userName: socket.user.name,
        role: userRole,
        timestamp: new Date(),
      });
    });

    socket.on("leave:class", (classId) => {
      if (!classId) return;

      logger.debug(`User ${userId} leaving class: ${classId}`);
      socket.leave(`class:${classId}`);
      socket.leave(`class:${classId}:updates`);

      const rooms = userRooms.get(socket.id) || [];
      userRooms.set(
        socket.id,
        rooms.filter((r) => r !== `class:${classId}`),
      );

      socket.emit("left:class", {
        classId,
        message: `Successfully left class ${classId}`,
        timestamp: new Date(),
      });

      socket.to(`class:${classId}`).emit("user:left:class", {
        userId,
        userName: socket.user.name,
        timestamp: new Date(),
      });
    });

    // ==================== CLASS CRUD EVENTS ====================
    socket.on("class:created", (data) => {
      const { classId, className, academicYear, subjectCount } = data;
      logger.info(`New class created: ${className}`);
      broadcastToRole("admin", "class:created", {
        classId,
        className,
        academicYear,
        subjectCount,
        createdBy: userId,
        createdByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("class:updated", (data) => {
      const { classId, className, changes } = data;
      logger.info(`Class updated: ${className}`);
      broadcastToClass(classId, "class:updated", {
        classId,
        className,
        changes,
        updatedBy: userId,
        updatedByName: userName,
        timestamp: new Date(),
      });
      broadcastToRole("admin", "class:updated", {
        classId,
        className,
        changes,
        updatedBy: userId,
        timestamp: new Date(),
      });
    });

    socket.on("class:deleted", (data) => {
      const { classId, className, transferredTo } = data;
      logger.info(`Class deleted: ${className}`);
      broadcastToRole("admin", "class:deleted", {
        classId,
        className,
        transferredTo,
        deletedBy: userId,
        deletedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("class:teacher:assigned", (data) => {
      const { classId, className, teacherId, teacherName } = data;
      logger.info(`Class teacher assigned: ${teacherName} to ${className}`);
      broadcastToClass(classId, "class:teacher:assigned", {
        classId,
        className,
        teacherId,
        teacherName,
        assignedBy: userId,
        assignedByName: userName,
        timestamp: new Date(),
      });
      broadcastToUser(teacherId, "class:teacher:assigned", {
        classId,
        className,
        assignedBy: userName,
        timestamp: new Date(),
      });
    });

    socket.on("timetable:updated", (data) => {
      const { classId, className, periodsCount } = data;
      logger.info(`Timetable updated for class: ${className}`);
      broadcastToClass(classId, "timetable:updated", {
        classId,
        className,
        periodsCount,
        updatedBy: userId,
        updatedByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== SUBJECT TEACHER EVENTS ====================
    socket.on("subject:teacher:assigned", (data) => {
      const { classId, className, subjectName, teacherName, periodsPerWeek } = data;
      logger.info(`Subject teacher assigned: ${teacherName} to teach ${subjectName} in ${className}`);
      broadcastToClass(classId, "subject:teacher:assigned", {
        classId,
        className,
        subjectName,
        teacherName,
        periodsPerWeek,
        assignedBy: userId,
        assignedByName: userName,
        timestamp: new Date(),
      });
      broadcastToRole("admin", "subject:teacher:assigned", {
        classId,
        className,
        subjectName,
        teacherName,
        timestamp: new Date(),
      });
    });

    socket.on("subject:teacher:removed", (data) => {
      const { classId, className, subjectName, teacherName } = data;
      logger.info(`Subject teacher removed: ${teacherName} from ${subjectName} in ${className}`);
      broadcastToClass(classId, "subject:teacher:removed", {
        classId,
        className,
        subjectName,
        teacherName,
        removedBy: userId,
        removedByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== EXAM EVENTS ====================
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
        startedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("exam:created", (data) => {
      const { examId, examName, classIds, startDate, endDate, subjectCount } = data;
      logger.info(`New exam created: ${examName}`);
      for (const classId of classIds) {
        io.to(`class:${classId}`).emit("exam:created", {
          examId,
          examName,
          startDate,
          endDate,
          subjectCount,
          timestamp: new Date(),
        });
      }
      broadcastToRole("admin", "exam:created", {
        examId,
        examName,
        classCount: classIds.length,
        subjectCount,
        timestamp: new Date(),
      });
    });

    socket.on("exam:updated", (data) => {
      const { examId, examName, classIds } = data;
      logger.info(`Exam updated: ${examName}`);
      for (const classId of classIds) {
        io.to(`class:${classId}`).emit("exam:updated", {
          examId,
          examName,
          updatedBy: userId,
          updatedByName: userName,
          timestamp: new Date(),
        });
      }
    });

    socket.on("exam:published", (data) => {
      const { examId, examName, resultsPublishedAt } = data;
      logger.info(`Exam published: ${examName}`);
      broadcastToRole("admin", "exam:published", {
        examId,
        examName,
        resultsPublishedAt,
        publishedBy: userId,
        publishedByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== MARKS EVENTS ====================
    socket.on("marks:entered", (data) => {
      const {
        studentId,
        studentName,
        examId,
        examName,
        subjectName,
        marksObtained,
        maxMarks,
        parentIds,
        classId,
      } = data;

      if (!studentId || !parentIds || parentIds.length === 0) return;

      const percentage = (marksObtained / maxMarks) * 100;
      const grade = getGrade(percentage);

      logger.info(`Marks entered for student ${studentName}: ${subjectName} - ${marksObtained}/${maxMarks}`);

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
          timestamp: new Date(),
        });
      });

      if (classId) {
        io.to(`class:${classId}`).emit("marks:entered", {
          studentName,
          examName,
          subjectName,
          timestamp: new Date(),
        });
      }
    });

    socket.on("marks:bulk-entered", (data) => {
      const { classId, examName, count } = data;
      logger.info(`Bulk marks entered for class ${classId}: ${count} records`);
      io.to(`class:${classId}`).emit("marks:bulk-entered", {
        examName,
        count,
        enteredBy: userId,
        enteredByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("marks:finalized", (data) => {
      const { examId, examName, classId, studentCount } = data;
      logger.info(`Marks finalized for exam: ${examName}`);
      io.to(`class:${classId}`).emit("marks:finalized", {
        examId,
        examName,
        studentCount,
        finalizedBy: userId,
        finalizedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("marks:reviewed", (data) => {
      const { examId, examName, classId, reviewedBy } = data;
      logger.info(`Marks reviewed for exam: ${examName}`);
      broadcastToRole("admin", "marks:reviewed", {
        examId,
        examName,
        classId,
        reviewedBy: reviewedBy || userName,
        timestamp: new Date(),
      });
    });

    // ==================== STUDENT EVENTS ====================
    socket.on("student:added", (data) => {
      const { studentId, studentName, classId } = data;
      logger.info(`New student added: ${studentName} to class ${classId}`);
      io.to(`class:${classId}`).emit("student:added", {
        studentId,
        studentName,
        timestamp: new Date(),
      });
      broadcastToRole("admin", "student:added", {
        studentId,
        studentName,
        classId,
        addedBy: userId,
        addedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("student:updated", (data) => {
      const { studentId, studentName, classId, changes } = data;
      logger.info(`Student updated: ${studentName}`);
      io.to(`class:${classId}`).emit("student:updated", {
        studentId,
        studentName,
        changes,
        updatedBy: userId,
        updatedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("student:deleted", (data) => {
      const { studentId, studentName, classId } = data;
      logger.info(`Student deleted: ${studentName}`);
      io.to(`class:${classId}`).emit("student:deleted", {
        studentId,
        studentName,
        deletedBy: userId,
        deletedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("student:promoted", (data) => {
      const { studentId, studentName, fromClass, toClass, status, parentId } = data;
      if (!studentId || !parentId) return;
      logger.info(`Student promoted: ${studentName} from ${fromClass} to ${toClass}`);
      io.to(`user:${parentId}`).emit("student:promoted", {
        studentId,
        studentName,
        fromClass,
        toClass,
        status: status || "passed",
        promotedBy: userId,
        promotedByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== ACADEMIC YEAR EVENTS ====================
    socket.on("academicYear:created", (data) => {
      const { academicYearId, year, name } = data;
      logger.info(`New academic year created: ${year}`);
      broadcastToRole("admin", "academicYear:created", {
        academicYearId,
        year,
        name,
        createdBy: userId,
        createdByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("academicYear:set:current", (data) => {
      const { academicYearId, year, name, previousYear } = data;
      logger.info(`Current academic year set to: ${year}`);
      broadcastToRole("admin", "academicYear:set:current", {
        academicYearId,
        year,
        name,
        previousYear,
        setBy: userId,
        setByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== DUTY EVENTS ====================
    socket.on("duty:assigned", (data) => {
      const { dutyId, staffId, className, dutyDate, dutyType } = data;
      if (!dutyId || !staffId) return;
      logger.info(`Duty assigned to staff: ${staffId} - ${dutyType} for ${className}`);
      io.to(`user:${staffId}`).emit("duty:assigned", {
        dutyId,
        className,
        dutyDate,
        dutyType,
        assignedBy: userId,
        assignedByName: userName,
        timestamp: new Date(),
      });
    });

    socket.on("duties:auto-assigned", (data) => {
      const { dutyType, totalDates, totalAssignments } = data;
      logger.info(`Auto-assigned duties: ${totalAssignments} duties for ${totalDates} dates`);
      broadcastToRole("admin", "duties:auto-assigned", {
        dutyType,
        totalDates,
        totalAssignments,
        assignedBy: userId,
        assignedByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== ATTENDANCE EVENTS ====================
    socket.on("attendance:warning", (data) => {
      const { studentId, studentName, month, year, attendancePercentage, parentId } = data;
      if (!parentId) return;
      logger.info(`Attendance warning for student ${studentName}: ${attendancePercentage}%`);
      io.to(`user:${parentId}`).emit("attendance:warning", {
        studentId,
        studentName,
        month,
        year,
        attendancePercentage,
        timestamp: new Date(),
      });
    });

    socket.on("attendance:bulk-updated", (data) => {
      const { classId, total, warnings } = data;
      logger.info(`Bulk attendance updated for class ${classId}: ${total} records, ${warnings} warnings`);
      io.to(`class:${classId}`).emit("attendance:bulk-updated", {
        total,
        warnings,
        updatedBy: userId,
        updatedByName: userName,
        timestamp: new Date(),
      });
    });

    // ==================== RECENT ACTIVITY EVENTS ====================
    socket.on("activity:created", (data) => {
      const { activityId, title, description, activityType, entityType, severity } = data;
      logger.info(`New activity: ${title}`);
      if (severity === SEVERITY.WARNING || severity === SEVERITY.ERROR) {
        broadcastToRole("admin", "activity:important", {
          activityId,
          title,
          description,
          activityType,
          entityType,
          severity,
          timestamp: new Date(),
        });
      }
      broadcastToUser(userId, "activity:created", {
        activityId,
        title,
        description,
        activityType,
        severity,
        timestamp: new Date(),
      });
    });

    socket.on("get:recent:activities", async (data) => {
      const { limit = 20 } = data || {};
      try {
        const activities = await RecentActivity.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate('performedBy', 'name role');
        socket.emit("recent:activities", {
          activities,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error(`Error fetching recent activities: ${error.message}`);
        socket.emit("error", { message: "Failed to fetch recent activities" });
      }
    });

    // ==================== SUBSCRIPTION EVENTS ====================
    socket.on("subscribe:notifications", () => {
      socket.join(`user:${userId}:notifications`);
      logger.debug(`User ${userId} subscribed to notifications`);
      socket.emit("subscribed:notifications", { status: "subscribed", timestamp: new Date() });
    });

    socket.on("subscribe:updates", () => {
      socket.join(`user:${userId}:updates`);
      logger.debug(`User ${userId} subscribed to real-time updates`);
      socket.emit("subscribed:updates", { status: "subscribed", timestamp: new Date() });
    });

    socket.on("subscribe:dashboard", () => {
      socket.join(`user:${userId}:dashboard`);
      logger.debug(`User ${userId} subscribed to dashboard updates`);
      socket.emit("subscribed:dashboard", { status: "subscribed", timestamp: new Date() });
    });

    socket.on("subscribe:activities", () => {
      socket.join(`user:${userId}:activities`);
      logger.debug(`User ${userId} subscribed to activities`);
      socket.emit("subscribed:activities", { status: "subscribed", timestamp: new Date() });
    });

    socket.on("subscribe:exams", () => {
      socket.join(`user:${userId}:exams`);
      logger.debug(`User ${userId} subscribed to exam updates`);
      socket.emit("subscribed:exams", { status: "subscribed", timestamp: new Date() });
    });

    socket.on("subscribe:marks", () => {
      socket.join(`user:${userId}:marks`);
      logger.debug(`User ${userId} subscribed to marks updates`);
      socket.emit("subscribed:marks", { status: "subscribed", timestamp: new Date() });
    });

    // ==================== NOTIFICATION EVENTS ====================
    socket.on("notification:read", async (data) => {
      const { notificationId } = data;
      if (!notificationId) return;
      try {
        await Notification.findOneAndUpdate(
          { _id: notificationId, userId: userId },
          { isRead: true, readAt: new Date() },
        );
        socket.emit("notification:read:confirmed", {
          notificationId,
          readAt: new Date(),
        });
        logger.debug(`Notification ${notificationId} marked as read by user ${userId}`);
      } catch (error) {
        logger.error(`Error marking notification as read: ${error.message}`);
      }
    });

    socket.on("notification:received", async (data) => {
      const { notificationId } = data;
      if (!notificationId) return;
      try {
        await Notification.findByIdAndUpdate(notificationId, {
          deliveredAt: new Date(),
        });
      } catch (error) {
        logger.error(`Error updating notification delivery: ${error.message}`);
      }
    });

    // ==================== USER MANAGEMENT ====================
    socket.on("get:online:users", () => {
      const onlineUsers = Array.from(connectedUsers.entries()).map(([id, info]) => ({
        userId: id,
        role: info.role,
        name: info.name,
        connectedAt: info.connectedAt,
        lastActivity: info.lastActivity,
        transport: info.transport,
      }));
      socket.emit("online:users", {
        users: onlineUsers,
        total: onlineUsers.length,
        timestamp: new Date(),
      });
    });

    socket.on("get:user:status", ({ userId: targetUserId }) => {
      const isOnline = connectedUsers.has(targetUserId);
      const userInfo = connectedUsers.get(targetUserId);
      socket.emit("user:status", {
        userId: targetUserId,
        online: isOnline,
        lastSeen: userInfo?.lastActivity || null,
        timestamp: new Date(),
      });
    });

    // ==================== CHAT EVENTS ====================
    socket.on("chat:message", async (data) => {
      const { to, message, messageType = "text" } = data;
      if (!to || !message) return;

      const messageData = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: userId,
        fromName: userName,
        fromRole: userRole,
        to: to,
        message: message,
        messageType: messageType,
        timestamp: new Date(),
        read: false,
        delivered: false,
      };

      logger.debug(`Chat message from ${userName} to ${to}`);

      const recipientInfo = connectedUsers.get(to);
      if (recipientInfo) {
        io.to(recipientInfo.socketId).emit("chat:message", messageData);
        messageData.delivered = true;
        messageData.deliveredAt = new Date();
      }

      socket.emit("chat:message:delivered", {
        id: messageData.id,
        to: to,
        delivered: messageData.delivered,
        timestamp: new Date(),
      });

      socket.emit("chat:message", messageData);
    });

    socket.on("chat:typing", (data) => {
      const { to, isTyping } = data;
      if (!to) return;
      const recipientInfo = connectedUsers.get(to);
      if (recipientInfo) {
        io.to(recipientInfo.socketId).emit("chat:typing", {
          from: userId,
          fromName: userName,
          isTyping: isTyping,
          timestamp: new Date(),
        });
      }
    });

    // ==================== DISCONNECT ====================
    socket.on("disconnect", (reason) => {
      logger.info(`Socket disconnected: ${socket.id} - User: ${socket.user.email} - Reason: ${reason}`);

      const userInfo = connectedUsers.get(userId);
      if (userInfo) {
        userInfo.lastActivity = new Date();
        userInfo.disconnectReason = reason;
        connectedUsers.set(userId, userInfo);
      }

      setTimeout(() => {
        const stillConnected = Array.from(io.sockets.sockets.values()).some(
          (s) => s.user && s.user._id.toString() === userId,
        );

        if (!stillConnected) {
          connectedUsers.delete(userId);
          logger.info(`User ${userId} removed from connected users. Total: ${connectedUsers.size}`);

          io.emit("user:offline", {
            userId,
            role: userRole,
            name: userName,
            timestamp: new Date(),
            reason: reason,
            totalConnected: connectedUsers.size,
          });
        }
      }, 5000);

      if (userHeartbeats.has(userId)) {
        clearInterval(userHeartbeats.get(userId));
        userHeartbeats.delete(userId);
      }

      userRooms.delete(socket.id);
      logger.info(`User disconnected: ${userId}`);
    });

    socket.on("error", (error) => {
      logger.error(`Socket error for user ${userId}:`, error);
    });
  });

  // Start cleanup interval
  startCleanupInterval();

  return io;
};

const cleanup = () => {
  logger.info("Cleaning up Socket.IO connections...");
  
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  for (const [userId, interval] of userHeartbeats.entries()) {
    clearInterval(interval);
    logger.info(`Cleared heartbeat for user ${userId}`);
  }

  userHeartbeats.clear();

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
  broadcastToAll,
  cleanup,
};