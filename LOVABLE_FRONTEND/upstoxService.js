// ════════════════════════════════════════════════════════════
//  LOVABLE FRONTEND INTEGRATION FILE
//  Add this file to: src/services/upstoxService.js
//  in your Lovable / BharatQuant project
// ════════════════════════════════════════════════════════════

// ── Backend URL — set in Lovable Environment Variables ──────
// Local dev:   http://localhost:3001
// Production:  https://YOUR-APP.up.railway.app
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ── Token management ────────────────────────────────────────
export const saveToken = (token) => localStorage.setItem('upstox_token', token);
export const getToken  = ()      => localStorage.getItem('upstox_token');
export const clearToken = ()     => localStorage.removeItem('upstox_token');

const authHeaders = () => ({
  'Content-Type': 'application/json',
  'x-access-token': getToken() || '',
});

// ── On app load: check if Upstox just redirected with token ─
export const handleAuthRedirect = () => {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('upstox_token');
  const status = params.get('auth');

  if (token && status === 'success') {
    saveToken(token);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }
  return false;
};

// ── Trigger Upstox OAuth login (opens in same tab) ──────────
export const loginWithUpstox = () => {
  window.location.href = `${BACKEND}/auth/login`;
};

// ── Check if token exists ───────────────────────────────────
export const isAuthenticated = () => !!getToken();

// ── Market Status (no auth needed) ──────────────────────────
export const fetchMarketStatus = async () => {
  const res = await fetch(`${BACKEND}/api/market/status`);
  return res.json();
};

// ── All Major Indices (Nifty 50, Bank, Sensex, etc.) ────────
export const fetchIndices = async () => {
  const res = await fetch(`${BACKEND}/api/market/indices`, {
    headers: authHeaders(),
  });
  return res.json();
};

// ── LTP — Last Traded Price ──────────────────────────────────
// instruments: comma-separated, e.g. "NSE_INDEX|Nifty 50,NSE_EQ|INE002A01018"
export const fetchLTP = async (instruments) => {
  const params = new URLSearchParams({ instruments });
  const res = await fetch(`${BACKEND}/api/market/ltp?${params}`, {
    headers: authHeaders(),
  });
  return res.json();
};

// ── Full Quote with OHLC + Depth ─────────────────────────────
export const fetchQuote = async (instruments) => {
  const params = new URLSearchParams({ instruments });
  const res = await fetch(`${BACKEND}/api/market/quote?${params}`, {
    headers: authHeaders(),
  });
  return res.json();
};

// ── Historical Candles for Charts ───────────────────────────
// interval: "1minute" | "30minute" | "day" | "week" | "month"
// from/to:  "YYYY-MM-DD"
export const fetchCandles = async (instrument, interval = 'day', from, to) => {
  const params = new URLSearchParams({ instrument, interval });
  if (from) params.set('from', from);
  if (to)   params.set('to', to);

  const res = await fetch(`${BACKEND}/api/market/candles?${params}`, {
    headers: authHeaders(),
  });
  return res.json();
};

// ── Intraday Candles (today only) ────────────────────────────
export const fetchIntradayCandles = async (instrument, interval = '30minute') => {
  const params = new URLSearchParams({ instrument, interval });
  const res = await fetch(`${BACKEND}/api/market/intraday-candles?${params}`, {
    headers: authHeaders(),
  });
  return res.json();
};

// ── Search Instrument by Symbol/Name ────────────────────────
export const searchInstrument = async (query) => {
  const res = await fetch(`${BACKEND}/api/market/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
  });
  return res.json();
};

// ── Get instrument key map (RELIANCE → NSE_EQ|INE...) ───────
export const fetchInstruments = async () => {
  const res = await fetch(`${BACKEND}/api/market/instruments`);
  return res.json();
};
