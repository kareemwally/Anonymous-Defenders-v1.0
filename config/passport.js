const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

const configurePassport = () => {
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.OAUTH_CALLBACK_BASE + '/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        const email = profile.emails[0].value;
        user = await User.findOne({ $or: [{ email }, { username: email }] });
        if (user) {
          user.googleId = profile.id;
          await user.save();
          return done(null, user);
        }
        user = await User.create({
          name: profile.displayName,
          email: email,
          username: email,
          googleId: profile.id,
          role: 'other'
        });
      }
      return done(null, user);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.username) {
        const email = profile.emails[0].value;
        const user = await User.findOne({ $or: [{ email }, { username: email }] });
        if (user) return done(null, user);
      }
      return done(err, null);
    }
  }));

  // GitHub OAuth Strategy
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.OAUTH_CALLBACK_BASE + '/auth/github/callback',
    scope: ['user:email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let email = (profile.emails && profile.emails[0] && profile.emails[0].value) || `${profile.username}@github.com`;
      let user = await User.findOne({ githubId: profile.id });
      if (!user) {
        user = await User.findOne({ $or: [{ email }, { username: email }] });
        if (user) {
          user.githubId = profile.id;
          await user.save();
          return done(null, user);
        }
        user = await User.create({
          name: profile.displayName || profile.username,
          email: email,
          username: email,
          githubId: profile.id,
          role: 'other'
        });
      }
      return done(null, user);
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.username) {
        let email = (profile.emails && profile.emails[0] && profile.emails[0].value) || `${profile.username}@github.com`;
        const user = await User.findOne({ $or: [{ email }, { username: email }] });
        if (user) return done(null, user);
      }
      return done(err, null);
    }
  }));
};

module.exports = configurePassport;
