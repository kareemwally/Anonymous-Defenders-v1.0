const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');

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

// Connect to Database
connectDB();

// Passport Configuration
configurePassport();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://anonymous-defenders.vercel.app',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/plots', express.static('plots'));

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
app.use('/upload', require('./routes/upload'));
app.use('/complaints', require('./routes/complaints'));
app.use('/api/guest', require('./routes/guest'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/keys', require('./routes/apiKeys'));
app.use('/api/v1', require('./routes/apiUpload'));
app.use('/health', require('./routes/health'));

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
