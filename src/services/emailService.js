const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendEmail = async ({ email, subject, message, template, data }) => {
  try {
    let html = message;
    
    if (template) {
      html = getTemplate(template, data);
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject,
      html
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email error:', error);
    return false;
  }
};

const getTemplate = (template, data) => {
  const templates = {
    staff_welcome: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .credentials { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to School Management System</h1>
          </div>
          <div class="content">
            <p>Dear ${data.name},</p>
            <p>Your staff account has been created successfully.</p>
            <div class="credentials">
              <p><strong>Login Credentials:</strong></p>
              <p>Email: ${data.email}</p>
              <p>Password: ${data.password}</p>
            </div>
            <p>Please change your password after first login.</p>
            <p>Regards,<br>School Administration</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} School Management System. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    parent_welcome: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .credentials { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to School Management System</h1>
          </div>
          <div class="content">
            <p>Dear ${data.name},</p>
            <p>Your parent account has been created successfully.</p>
            <div class="credentials">
              <p><strong>Login Credentials:</strong></p>
              <p>Email: ${data.email}</p>
              <p>Password: ${data.password}</p>
            </div>
            <p>You can now track your child's performance.</p>
            <p>Regards,<br>School Administration</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} School Management System. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    password_reset: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .button { display: inline-block; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested a password reset. Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${data.resetUrl}" class="button">Reset Password</a>
            </p>
            <p>This link expires in 10 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <p>Regards,<br>School Administration</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} School Management System. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    marks_entered: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .marks-card { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Marks Entered</h1>
          </div>
          <div class="content">
            <p>Dear Parent,</p>
            <p>Marks for ${data.studentName} have been entered for ${data.examName}.</p>
            <div class="marks-card">
              <p><strong>Subject:</strong> ${data.subjectName}</p>
              <p><strong>Marks:</strong> ${data.marksObtained}/${data.maxMarks} (${data.percentage}%)</p>
              <p><strong>Grade:</strong> ${data.grade}</p>
            </div>
            <p>Login to view detailed results.</p>
            <p>Regards,<br>School Administration</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} School Management System. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  return templates[template] || `<p>${data?.message || ''}</p>`;
};

module.exports = { sendEmail };