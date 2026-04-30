// controllers/academicYearController.js
const AcademicYear = require('../models/AcademicYear');
const { RecentActivity, ACTIVITY_TYPES, ENTITY_TYPES, SEVERITY } = require('../models/RecentActivity');
const { broadcastToRole } = require('../config/socket');

// Helper function to create recent activity
async function createRecentActivity({
  title,
  description,
  activityType,
  entityType,
  entityId = null,
  entityModel = null,
  performedBy,
  performedByName,
  performedByRole,
  details = {},
  changes = {},
  ipAddress = null,
  userAgent = null,
  severity = SEVERITY.INFO,
  batchId = null
}) {
  try {
    const activity = await RecentActivity.create({
      title,
      description,
      activityType,
      entityType,
      entityId,
      entityModel,
      performedBy,
      performedByName,
      performedByRole,
      details,
      changes,
      ipAddress,
      userAgent,
      severity,
      batchId
    });
    
    // Broadcast to admin
    broadcastToRole('admin', 'recent_activity:created', { activity });
    
    return activity;
  } catch (error) {
    console.error('Error creating recent activity:', error);
    return null;
  }
}

exports.getAcademicYears = async (req, res) => {
  try {
    const { isActive, isCurrent, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isCurrent !== undefined) query.isCurrent = isCurrent === 'true';

    const academicYears = await AcademicYear.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ year: -1 });

    const total = await AcademicYear.countDocuments(query);

    res.json({
      success: true,
      data: academicYears,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAcademicYear = async (req, res) => {
  try {
    const academicYear = await AcademicYear.findById(req.params.id);
    
    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    res.json(academicYear);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCurrentAcademicYear = async (req, res) => {
  try {
    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    
    if (!academicYear) {
      return res.status(404).json({ message: 'No current academic year set' });
    }

    res.json(academicYear);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAcademicYear = async (req, res) => {
  try {
    const { year, name, startDate, endDate } = req.body;
    
    const existingYear = await AcademicYear.findOne({ year });
    if (existingYear) {
      return res.status(400).json({ message: 'Academic year already exists' });
    }

    const academicYear = await AcademicYear.create({
      ...req.body,
      createdBy: req.user._id
    });

    // Create recent activity
    await createRecentActivity({
      title: `Academic Year Created: ${year}`,
      description: `New academic year ${name || year} was created`,
      activityType: ACTIVITY_TYPES.ACADEMIC_YEAR_CREATED,
      entityType: ENTITY_TYPES.ACADEMIC_YEAR,
      entityId: academicYear._id,
      entityModel: 'AcademicYear',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        year: academicYear.year,
        name: academicYear.name,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate
      },
      severity: SEVERITY.SUCCESS
    });

    broadcastToRole('admin', 'academicYear:created', {
      academicYearId: academicYear._id,
      year: academicYear.year,
      name: academicYear.name,
      timestamp: new Date()
    });

    res.status(201).json(academicYear);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAcademicYear = async (req, res) => {
  try {
    const beforeUpdate = await AcademicYear.findById(req.params.id);
    
    const academicYear = await AcademicYear.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    // Track changes
    const changes = {};
    if (beforeUpdate.name !== academicYear.name) changes.name = { from: beforeUpdate.name, to: academicYear.name };
    if (beforeUpdate.year !== academicYear.year) changes.year = { from: beforeUpdate.year, to: academicYear.year };
    if (beforeUpdate.isActive !== academicYear.isActive) changes.isActive = { from: beforeUpdate.isActive, to: academicYear.isActive };
    if (beforeUpdate.startDate?.toString() !== academicYear.startDate?.toString()) changes.startDate = { from: beforeUpdate.startDate, to: academicYear.startDate };
    if (beforeUpdate.endDate?.toString() !== academicYear.endDate?.toString()) changes.endDate = { from: beforeUpdate.endDate, to: academicYear.endDate };

    // Create recent activity if there are changes
    if (Object.keys(changes).length > 0) {
      await createRecentActivity({
        title: `Academic Year Updated: ${academicYear.year}`,
        description: `Academic year ${academicYear.name || academicYear.year} was updated`,
        activityType: ACTIVITY_TYPES.ACADEMIC_YEAR_UPDATED,
        entityType: ENTITY_TYPES.ACADEMIC_YEAR,
        entityId: academicYear._id,
        entityModel: 'AcademicYear',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          year: academicYear.year,
          name: academicYear.name
        },
        changes: changes,
        severity: SEVERITY.INFO
      });
    }

    broadcastToRole('admin', 'academicYear:updated', {
      academicYearId: academicYear._id,
      year: academicYear.year,
      timestamp: new Date()
    });

    res.json(academicYear);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.setCurrentAcademicYear = async (req, res) => {
  try {
    const academicYear = await AcademicYear.findById(req.params.id);
    
    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    const previousCurrent = await AcademicYear.findOne({ isCurrent: true });
    
    await AcademicYear.updateMany({}, { isCurrent: false });
    academicYear.isCurrent = true;
    academicYear.isActive = true;
    await academicYear.save();

    // Create recent activity
    await createRecentActivity({
      title: `Current Academic Year Set: ${academicYear.year}`,
      description: `${academicYear.name || academicYear.year} was set as the current academic year${previousCurrent ? ` (previously: ${previousCurrent.year})` : ''}`,
      activityType: ACTIVITY_TYPES.ACADEMIC_YEAR_SET_CURRENT,
      entityType: ENTITY_TYPES.ACADEMIC_YEAR,
      entityId: academicYear._id,
      entityModel: 'AcademicYear',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        year: academicYear.year,
        name: academicYear.name,
        previousYear: previousCurrent ? previousCurrent.year : null,
        previousYearId: previousCurrent ? previousCurrent._id : null
      },
      severity: SEVERITY.SUCCESS
    });

    broadcastToRole('admin', 'academicYear:current', {
      academicYearId: academicYear._id,
      year: academicYear.year,
      timestamp: new Date()
    });

    res.json({ message: 'Current academic year set successfully', academicYear });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAcademicYear = async (req, res) => {
  try {
    const academicYear = await AcademicYear.findById(req.params.id);
    
    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    if (academicYear.isCurrent) {
      return res.status(400).json({ message: 'Cannot delete current academic year' });
    }

    // Create recent activity before deletion
    await createRecentActivity({
      title: `Academic Year Deleted: ${academicYear.year}`,
      description: `Academic year ${academicYear.name || academicYear.year} was deleted`,
      activityType: ACTIVITY_TYPES.ACADEMIC_YEAR_DELETED,
      entityType: ENTITY_TYPES.ACADEMIC_YEAR,
      entityId: academicYear._id,
      entityModel: 'AcademicYear',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        year: academicYear.year,
        name: academicYear.name,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate
      },
      severity: SEVERITY.WARNING
    });

    await academicYear.deleteOne();

    broadcastToRole('admin', 'academicYear:deleted', {
      academicYearId: req.params.id,
      year: academicYear.year,
      timestamp: new Date()
    });

    res.json({ message: 'Academic year deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};