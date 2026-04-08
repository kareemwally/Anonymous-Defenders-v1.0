const jwt = require('jsonwebtoken');
const Complaint = require('../models/Complaint');
const nodemailer = require('nodemailer');

// Nodemailer transporter setup (should ideally be in a service or config)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.submitComplaint = async (req, res) => {
  try {
    let userId = null;
    let email = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (err) {
        // Invalid token, treat as guest
      }
    }
    
    if (req.body.email) {
      email = req.body.email;
    }
    
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }
    
    if (message.length < 1 || message.length > 1000) {
      return res.status(400).json({ error: 'Message must be between 1 and 1000 characters' });
    }
    
    const suspiciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(message)) {
        return res.status(400).json({ error: 'Message contains forbidden content' });
      }
    }
    
    const sanitizedMessage = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    if (!userId && !email) {
      return res.status(400).json({ error: 'Message and (user or email) are required.' });
    }
    
    const complaint = new Complaint({
      user: userId || undefined,
      email: email || undefined,
      message: sanitizedMessage
    });
    
    await complaint.save();

    const supportEmail = process.env.SUPPORT_EMAIL;
    let subject = 'New Complaint Submitted';
    let fromEmail = email || process.env.EMAIL_USER;
    let text = `A new complaint has been submitted.\n\n` +
      `From: ${email ? email : 'Authenticated User: ' + userId}\n` +
      `Message: ${sanitizedMessage}\n` +
      `Timestamp: ${complaint.createdAt}`;
    
    try {
      await transporter.sendMail({
        from: fromEmail,
        to: supportEmail,
        subject,
        text
      });
    } catch (mailErr) {
      console.error('Nodemailer error:', mailErr);
    }

    res.status(201).json({ message: 'Complaint submitted successfully.' });
  } catch (error) {
    console.error('Complaint error:', error);
    res.status(500).json({ error: 'Server error while submitting complaint.' });
  }
};
