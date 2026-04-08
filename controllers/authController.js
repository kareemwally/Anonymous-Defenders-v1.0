const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const File = require('../models/File');
const AnalysisReport = require('../models/AnalysisReport');

exports.signup = async (req, res) => {
  try {
    const { name, email, phone, jobTitle, yearsOfExperience, password, company } = req.body;

    if (!name || !email || !phone || !jobTitle || !yearsOfExperience || !password || !company) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username: email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = new User({
      name, email, phone, jobTitle, yearsOfExperience, company,
      username: email,
      password: hashedPassword
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        jobTitle: user.jobTitle,
        yearsOfExperience: user.yearsOfExperience,
        company: user.company,
        role: user.role,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        jobTitle: user.jobTitle,
        yearsOfExperience: user.yearsOfExperience,
        company: user.company,
        role: user.role,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    const files = await File.find({ userId: user._id }).sort({ uploadDate: -1 }).lean();
    const fileIds = files.map(f => f._id);
    const reports = await AnalysisReport.find({ fileId: { $in: fileIds } }).lean();
    const reportMap = {};
    for (const r of reports) {
      reportMap[r.fileId.toString()] = r;
    }

    const history = files.map(f => {
      const report = reportMap[f._id.toString()];
      return {
        name: f.name,
        status: f.status,
        uploadDate: f.uploadDate,
        family: report?.predictions_family || [],
        accuracy: report?.probability_family || [],
        report: report || null
      };
    });

    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        jobTitle: user.jobTitle,
        yearsOfExperience: user.yearsOfExperience,
        company: user.company,
        role: user.role,
        createdAt: user.createdAt
      },
      history
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.oauthSuccess = (req, res) => {
  const token = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.redirect(`${process.env.FRONTEND_URL || 'https://anonymous-defenders.vercel.app'}?token=${token}`);
};
