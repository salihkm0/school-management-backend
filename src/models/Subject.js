const mongoose = require("mongoose");

const SubjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Subject name is required"],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Subject code is required"],
      unique: true, 
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    type: {
      type: String,
      enum: ["core", "elective", "optional"],
      default: "core",
    },
    creditHours: {
      type: Number,
      default: 1,
      min: 0,
      max: 6,
    },
    department: {
      type: String,
      trim: true,
    },
    gradeLevel: {
      type: String,
      enum: ["primary", "middle", "high", "all"],
      default: "all",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
SubjectSchema.index({ name: "text", code: "text" });
// SubjectSchema.index({ code: 1 });

module.exports = mongoose.model("Subject", SubjectSchema);
