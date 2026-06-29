const mongoose = require('mongoose');
const Staff = require('./src/models/Staff');

mongoose.connect('mongodb://localhost:27017/school-management', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const activeStaff = await Staff.find({ isActive: { $ne: false } }).countDocuments();
    const inactiveStaff = await Staff.find({ isActive: false }).countDocuments();
    const allStaff = await Staff.find({}).countDocuments();
    console.log({ activeStaff, inactiveStaff, allStaff });
    mongoose.disconnect();
  });
