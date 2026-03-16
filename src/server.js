// src/server.js
// ─────────────────────────────────────────────────────────
//  BharatQuant Backend — Main Express Server
//  Powers live Indian market data for bharat-trading.lovable.app
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { getAuthUrl, getAccessToken } = require('./services/upstoxAuth');
const marketRoutes = require('./routes/market');
const sentimentRoutes = require('./routes/sentiment');
const { setupWebSocketProxy }        = require('./services/wsProxy');

const app    = express();
const server = http.createServer(app);

// ── Store reference to app in server for WS token access ──
server._app = app;

// ─────────────────────────────────────────────────────────
//  CORS — Allow your Lovable frontend
// ─────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'https://bharat-trading.lovable.app',
    'http://localhost:5173',   // Vite dev server
    'http://localhost:3000',   // CRA dev server
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-access-token', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

// ─────────────────────────────────────────────────────────
//  IN-MEMORY TOKEN STORE
//  In production — use Redis or a database
// ─────────────────────────────────────────────────────────
app.locals.accessToken = null;

// ─────────────────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BharatQuant Backend',
    authenticated: !!app.locals.accessToken,
    timestamp: new Date().toISOString(),
    upstox_api_key: process.env.UPSTOX_API_KEY ? '✅ Set' : '❌ Missing',
  });
});

// ─────────────────────────────────────────────────────────
//  AUTH ROUTES — Upstox OAuth2
// ─────────────────────────────────────────────────────────

// Step 1: User visits this URL to log in via Upstox
// Open in browser: http://localhost:3001/auth/login
app.get('/auth/login', (req, res) => {
  if (!process.env.UPSTOX_API_KEY || !process.env.REDIRECT_URI) {
    return res.status(500).json({
      error: 'UPSTOX_API_KEY or REDIRECT_URI not set in .env'
    });
  }
  const url = getAuthUrl(process.env.UPSTOX_API_KEY, process.env.REDIRECT_URI);
  console.log('🔐 Redirecting to Upstox login...');
  res.redirect(url);
});

// Step 2: Upstox calls back here with ?code=xxx after user logs in
app.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send(`
      <h2>❌ No auth code received from Upstox</h2>
      <p>Please try logging in again: <a href="/auth/login">/auth/login</a></p>
    `);
  }

  try {
    console.log('🔄 Exchanging auth code for access token...');
    const tokenData = await getAccessToken(
      code,
      process.env.UPSTOX_API_KEY,
      process.env.UPSTOX_API_SECRET,
      process.env.REDIRECT_URI
    );

    // Store token server-side
    app.locals.accessToken = tokenData.access_token;
    console.log('✅ Access token obtained and stored!');

    // Redirect frontend with token in URL param
    // Frontend reads this once and stores in localStorage
    const frontendUrl = process.env.FRONTEND_URL || 'https://bharat-trading.lovable.app';
    res.redirect(`${frontendUrl}?upstox_token=${tokenData.access_token}&auth=success`);

  } catch (err) {
    console.error('❌ OAuth callback error:', err.message);
    res.status(500).send(`
      <h2>❌ Authentication Failed</h2>
      <pre>${err.message}</pre>
      <p><a href="/auth/login">Try again</a></p>
    `);
  }
});

// Check authentication status
app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: !!app.locals.accessToken,
    message: app.locals.accessToken
      ? '✅ Authenticated — live market data available'
      : '❌ Not authenticated — visit /auth/login to connect Upstox',
    loginUrl: `${req.protocol}://${req.get('host')}/auth/login`,
  });
});

// Manual token injection (for testing or token refresh)
app.post('/auth/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required in body' });
  app.locals.accessToken = token;
  console.log('🔑 Token manually set');
  res.json({ success: true, message: 'Token set successfully' });
});

// ─────────────────────────────────────────────────────────
//  MARKET DATA ROUTES
// ─────────────────────────────────────────────────────────
app.use('/api/market', marketRoutes);
app.use('/api/sentiment', sentimentRoutes);

// ─────────────────────────────────────────────────────────
//  ROOT — API Guide
// ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({
    service: '🇮🇳 BharatQuant Backend API',
    version: '1.0.0',
    status: app.locals.accessToken ? '🟢 Live' : '🔴 Not Authenticated',
    endpoints: {
      auth: {
        login:      `${base}/auth/login`,
        status:     `${base}/auth/status`,
        callback:   `${base}/callback`,
      },
      market: {
        status:           `${base}/api/market/status`,
        indices:          `${base}/api/market/indices    [auth]`,
        ltp:              `${base}/api/market/ltp?instruments=NSE_INDEX|Nifty 50    [auth]`,
        quote:            `${base}/api/market/quote?instruments=NSE_INDEX|Nifty 50  [auth]`,
        candles:          `${base}/api/market/candles?instrument=NSE_EQ|INE002A01018&interval=day  [auth]`,
        intradayCandles:  `${base}/api/market/intraday-candles?instrument=NSE_EQ|INE002A01018  [auth]`,
        search:           `${base}/api/market/search?q=RELIANCE  [auth]`,
        instruments:      `${base}/api/market/instruments`,
      },
      websocket: {
        liveStream: `ws://${req.get('host')}/ws/market?token=YOUR_TOKEN`,
      }
    },
    docs: 'https://upstox.com/developer/api-documentation/'
  });
});

// ─────────────────────────────────────────────────────────
//  404 HANDLER
// ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─────────────────────────────────────────────────────────
//  WEBSOCKET PROXY — Live Market Stream
// ─────────────────────────────────────────────────────────
setupWebSocketProxy(server);

// ─────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║    🇮🇳  BharatQuant Backend Running           ║
╠═══════════════════════════════════════════════╣
║  URL:     http://localhost:${PORT}               ║
║  Health:  http://localhost:${PORT}/health        ║
║  Login:   http://localhost:${PORT}/auth/login    ║
║  WS:      ws://localhost:${PORT}/ws/market       ║
╚═══════════════════════════════════════════════╝
  `);
});

module.exports = { app, server };
