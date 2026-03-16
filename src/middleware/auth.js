// src/middleware/auth.js
// ─────────────────────────────────────────────
//  Middleware to inject Upstox access token
//  into SDK calls before every API request
// ─────────────────────────────────────────────
const UpstoxClient = require('upstox-js-sdk');

const withAuth = (req, res, next) => {
  // Token can come from:
  // 1. x-access-token header (sent by frontend after OAuth)
  // 2. app.locals (stored server-side after /callback)
  const token = req.headers['x-access-token'] || req.app.locals.accessToken;

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Not authenticated. Please login via /auth/login first.',
      loginUrl: `${req.protocol}://${req.get('host')}/auth/login`,
    });
  }

  // Inject token into Upstox SDK global client
  const defaultClient = UpstoxClient.ApiClient.instance;
  defaultClient.authentications['OAUTH2'].accessToken = token;

  next();
};

module.exports = { withAuth };
