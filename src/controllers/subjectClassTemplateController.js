// controllers/subjectClassTemplateController.js
const SubjectClassTemplate = require('../models/SubjectClassTemplate');
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const { broadcastToRole } = require('../config/socket');

// Get all templates
exports.getTemplates = async (req, res) => {
  try {
    const { isActive, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const templates = await SubjectClassTemplate.find(query)
      .populate('subjects', 'name code type')
      .populate('createdBy', 'name email')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ className: 1 });

    const total = await SubjectClassTemplate.countDocuments(query);

    res.json({
      success: true,
      data: templates,
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

// Get single template
exports.getTemplate = async (req, res) => {
  try {
    const template = await SubjectClassTemplate.findById(req.params.id)
      .populate('subjects', 'name code description type creditHours')
      .populate('createdBy', 'name email');

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Populate section subjects if they exist
    if (template.sectionSpecific && template.sectionSubjects) {
      const populatedSections = {};
      for (const [section, subjectIds] of template.sectionSubjects) {
        populatedSections[section] = await Subject.find({ 
          _id: { $in: subjectIds } 
        }).select('name code type');
      }
      template._doc.populatedSectionSubjects = populatedSections;
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get template by class name
exports.getTemplateByClassName = async (req, res) => {
  try {
    const template = await SubjectClassTemplate.findOne({ 
      className: req.params.className,
      isActive: true 
    }).populate('subjects', 'name code description type creditHours');

    if (!template) {
      return res.status(404).json({ message: 'Template not found for this class' });
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create template
exports.createTemplate = async (req, res) => {
  try {
    const { className, subjects, sectionSpecific, sectionSubjects } = req.body;

    const existingTemplate = await SubjectClassTemplate.findOne({ className });
    if (existingTemplate) {
      return res.status(400).json({ 
        message: 'Template already exists for this class. Use update instead.' 
      });
    }

    const template = await SubjectClassTemplate.create({
      className,
      subjects,
      sectionSpecific,
      sectionSubjects,
      createdBy: req.user._id
    });

    const populatedTemplate = await SubjectClassTemplate.findById(template._id)
      .populate('subjects', 'name code');

    broadcastToRole('admin', 'template:created', {
      templateId: template._id,
      className: template.className,
      subjectCount: subjects.length,
      timestamp: new Date()
    });

    res.status(201).json(populatedTemplate);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update template
exports.updateTemplate = async (req, res) => {
  try {
    const { subjects, sectionSpecific, sectionSubjects, isActive } = req.body;

    const template = await SubjectClassTemplate.findByIdAndUpdate(
      req.params.id,
      { subjects, sectionSpecific, sectionSubjects, isActive },
      { new: true, runValidators: true }
    ).populate('subjects', 'name code');

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    broadcastToRole('admin', 'template:updated', {
      templateId: template._id,
      className: template.className,
      subjectCount: template.subjects.length,
      timestamp: new Date()
    });

    res.json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update template by class name (upsert)
exports.upsertTemplateByClassName = async (req, res) => {
  try {
    const { className } = req.params;
    const { subjects, sectionSpecific, sectionSubjects } = req.body;

    const template = await SubjectClassTemplate.findOneAndUpdate(
      { className },
      { 
        className,
        subjects,
        sectionSpecific,
        sectionSubjects,
        createdBy: req.user._id
      },
      { upsert: true, new: true, runValidators: true }
    ).populate('subjects', 'name code');

    broadcastToRole('admin', template.isNew ? 'template:created' : 'template:updated', {
      templateId: template._id,
      className: template.className,
      subjectCount: template.subjects.length,
      timestamp: new Date()
    });

    res.json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete template
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await SubjectClassTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    await template.deleteOne();

    broadcastToRole('admin', 'template:deleted', {
      templateId: req.params.id,
      className: template.className,
      timestamp: new Date()
    });

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Apply template to existing classes
exports.applyTemplateToClasses = async (req, res) => {
  try {
    const { academicYearId } = req.body;
    const templateId = req.params.id;

    const template = await SubjectClassTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const query = { 
      name: template.className,
      isActive: true 
    };
    if (academicYearId) {
      query.academicYearId = academicYearId;
    }

    const classes = await Class.find(query);
    
    const results = {
      updated: [],
      skipped: []
    };

    for (const classItem of classes) {
      try {
        let subjectIds = template.subjects;
        
        // Check for section-specific subjects
        if (template.sectionSpecific && template.sectionSubjects && classItem.section) {
          const sectionSubjects = template.sectionSubjects.get(classItem.section);
          if (sectionSubjects && sectionSubjects.length > 0) {
            subjectIds = sectionSubjects;
          }
        }

        await Class.findByIdAndUpdate(
          classItem._id,
          { $addToSet: { subjects: { $each: subjectIds } } }
        );
        
        results.updated.push({
          classId: classItem._id,
          displayName: classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name
        });
      } catch (error) {
        results.skipped.push({
          classId: classItem._id,
          error: error.message
        });
      }
    }

    broadcastToRole('admin', 'template:applied', {
      templateId: template._id,
      className: template.className,
      classesUpdated: results.updated.length,
      timestamp: new Date()
    });

    res.json({
      message: `Applied template to ${results.updated.length} classes`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all class names (for dropdown)
exports.getClassNames = async (req, res) => {
  try {
    // Get unique class names from existing classes
    const classNames = await Class.distinct('name');
    
    // Get templates that already exist
    const existingTemplates = await SubjectClassTemplate.find({ 
      className: { $in: classNames } 
    }).select('className subjects');
    
    const templateMap = {};
    existingTemplates.forEach(t => {
      templateMap[t.className] = t.subjects.length;
    });

    const result = classNames.map(name => ({
      className: name,
      hasTemplate: !!templateMap[name],
      subjectCount: templateMap[name] || 0
    })).sort((a, b) => {
      // Sort numerically if possible
      const numA = parseInt(a.className);
      const numB = parseInt(b.className);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.className.localeCompare(b.className);
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};