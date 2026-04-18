const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

// Load environment variables

try {
  dotenv.config({path: 'config.env'});
  console.log('Loaded config.env');
} catch (err) {
  dotenv.config();
}

const connectDB = require('./config/db');
const configurePassport = require('./config/passport');

const app = express();
const port = process.env.PORT || 3000;
const multer = require('multer');

// Trust Proxy (Essential for correct Rate Limiting & Guest IP tracking behind Load Balancers)

app.set('trust proxy', 1);

// Rate Limiting (Protection against DDoS)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, 
  legacyHeaders: false, 
  skip: (req) => req.path === '/api/subscriptions/webhook', // Skip Paymob Webhooks to avoid blocking payments
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use(globalLimiter);


// Connect to Database
connectDB();

// Passport Configuration
configurePassport();

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://anonymous-defenders.vercel.app',
  'https://anonymousdefenders.com'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup

app.use(session({
  secret: process.env.JWT_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/upload'));
app.use('/complaints', require('./routes/complaints'));

app.use('/api/guest', require('./routes/guest'));
app.use('/api/subscriptions', require('./routes/subscription'));
app.use('/api/keys', require('./routes/apiKeys'));
app.use('/api/teams', require('./routes/team'));
app.use('/api/v1', require('./routes/apiUpload'));
app.use('/health', require('./routes/health'));

// Global Error Handler (Must be after routes)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File too large. Maximum limit is 50MB.' });
    }
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({ 
    success: false, 
    error: err.message || 'Internal Server Error' 
  });
});

// Backward compatibility for OAuth success

app.get('/oauth-success', (req, res) => {
  const token = req.query.token;
  const frontendUrl = process.env.FRONTEND_URL || 'https://anonymous-defenders.vercel.app';
  if (token) {
    res.redirect(`${frontendUrl}?token=${token}`);
  } else {
    res.redirect(`${frontendUrl}/`);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Node.js server listening at http://0.0.0.0:${port}`);
});
