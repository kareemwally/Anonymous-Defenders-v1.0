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
      const rawEmail = req.body.email;
      // Reject emails containing SMTP control characters (header injection prevention)
      if (/[\r\n]/.test(rawEmail)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      // Basic format validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return res.status(400).json({ error: 'Invalid email address format' });
      }
      email = rawEmail;
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

    if (!userId && !email) {
      return res.status(400).json({ error: 'Message and (user or email) are required.' });
    }

    // Store raw message — escape only at render/send time, not in the DB
    const complaint = new Complaint({
      user: userId || undefined,
      email: email || undefined,
      message
    });

    await complaint.save();

    // Escape message only for the email body (plain-text is safe; escaping is extra defence)
    const escapedMessage = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const supportEmail = process.env.SUPPORT_EMAIL;
    const text = `A new complaint has been submitted.\n\n` +
      `From: ${email ? email : 'Authenticated User: ' + userId}\n` +
      `Message: ${escapedMessage}\n` +
      `Timestamp: ${complaint.createdAt}`;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,          // always our own address — never user-supplied
        replyTo: email || undefined,            // user email goes here, safe from header injection
        to: supportEmail,
        subject: 'New Complaint Submitted',
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
