const bcrypt = require('bcryptjs');

const generateUsers = async () => {
  const users = [];
  
  // Admin User
  users.push({
    email: 'admin@ksmschool.edu',
    password: await bcrypt.hash('Admin@123', 10),
    name: 'System Administrator',
    role: 'admin',
    phone: '9876543210',
    isActive: true
  });
  
  // Staff Users (corresponding to staff members)
  const staffNames = [
    'Dr. K. Suresh Kumar',
    'Smt. M. Sarada Devi',
    'Shri. P. Rajendran',
    'Smt. K. Leelavathy',
    'Shri. M. Gopinathan',
    'Smt. Mary Joseph',
    'Shri. Thomas Mathew',
    'Smt. Sheeba George',
    'Smt. Pushpa Rani',
    'Shri. Ramesh Chandra',
    'Shri. V. Sreekumar',
    'Smt. Bindu V. Nair',
    'Shri. Anil Kumar',
    'Smt. Geetha Kumari',
    'Shri. K. P. Mohanan',
    'Smt. Rema Devi',
    'Shri. Suresh Babu',
    'Shri. A. K. Vijayan',
    'Smt. Lathika Menon',
    'Shri. Biju Thomas',
    'Shri. K. R. Rajeev',
    'Smt. Valsala Kumari'
  ];
  
  staffNames.forEach((name, index) => {
    // Create email from name
    let emailPrefix = name
      .toLowerCase()
      .replace(/dr\.|smt\.|shri\./g, '')
      .trim()
      .split(' ')
      .filter(part => part.length > 1)
      .join('.')
      .replace(/[^a-z.]/g, '');
    
    // Handle special cases
    if (index === 0) emailPrefix = 'principal';
    else if (index === 1) emailPrefix = 'viceprincipal';
    else if (index === 2) emailPrefix = 'admin';
    
    const email = `${emailPrefix}@ksmschool.edu`;
    
    users.push({
      email,
      password: bcrypt.hashSync('Staff@123', 10), // Use hashSync since we're not in async context
      name: name.replace(/Dr\. |Smt\. |Shri\. /g, ''),
      role: 'staff',
      phone: `9${Math.floor(8000000000 + Math.random() * 1999999999)}`,
      isActive: true
    });
  });
  
  return users;
};

module.exports = generateUsers;