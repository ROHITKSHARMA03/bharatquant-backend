// src/routes/market.js
// ─────────────────────────────────────────────────────────
//  All live market data endpoints powered by Upstox API v2
// ─────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const UpstoxClient = require('upstox-js-sdk');
const { withAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────
//  INSTRUMENT KEY REFERENCE (for frontend use)
//  Format:  EXCHANGE_TYPE|ISIN  or  EXCHANGE_INDEX|Name
// ─────────────────────────────────────────────────────────
const DEFAULT_INSTRUMENTS = {
  'NIFTY_50':    'NSE_INDEX|Nifty 50',
  'NIFTY_BANK':  'NSE_INDEX|Nifty Bank',
  'NIFTY_IT':    'NSE_INDEX|Nifty IT',
  'SENSEX':      'BSE_INDEX|SENSEX',
  'RELIANCE':    'NSE_EQ|INE002A01018',
  'TCS':         'NSE_EQ|INE467B01029',
  'INFOSYS':     'NSE_EQ|INE009A01021',
  'HDFCBANK':    'NSE_EQ|INE040A01034',
  'ICICIBANK':   'NSE_EQ|INE090A01021',
  'WIPRO':       'NSE_EQ|INE075A01022',
  'TATAMOTORS':  'NSE_EQ|INE155A01022',
  'SBIN':        'NSE_EQ|INE062A01020',
  'BHARTIARTL':  'NSE_EQ|INE397D01024',
  'ADANIENT':    'NSE_EQ|INE423A01024',
  'BAJFINANCE':  'NSE_EQ|INE296A01024',
};

// ─────────────────────────────────────────────────────────
//  GET /api/market/instruments
//  Returns the built-in instrument key reference map
// ─────────────────────────────────────────────────────────
router.get('/instruments', (req, res) => {
  res.json({ status: 'success', data: DEFAULT_INSTRUMENTS });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/status
//  Returns NSE market open/closed status with IST time
// ─────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);

  const hours   = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const total   = hours * 60 + minutes;
  const day     = ist.getUTCDay(); // 0=Sun, 6=Sat

  const isWeekday   = day >= 1 && day <= 5;
  const isPreOpen   = total >= 555  && total < 570;  // 9:15–9:30
  const isOpen      = total >= 570  && total <= 930; // 9:30–15:30
  const isPostClose = total > 930   && total <= 960; // 15:30–16:00

  let marketStatus = 'Closed';
  let color = 'red';
  if (!isWeekday)       { marketStatus = 'Closed (Weekend)'; color = 'gray'; }
  else if (isPreOpen)   { marketStatus = 'Pre-Open Session'; color = 'yellow'; }
  else if (isOpen)      { marketStatus = 'Open';             color = 'green'; }
  else if (isPostClose) { marketStatus = 'Post-Close';       color = 'orange'; }

  res.json({
    status: 'success',
    data: {
      marketStatus,
      isOpen: isWeekday && isOpen,
      color,
      currentIST: `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')} IST`,
      day: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day],
    }
  });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/ltp?instruments=NSE_INDEX|Nifty 50,NSE_EQ|INE002A01018
//  Lightweight — Last Traded Price only
// ─────────────────────────────────────────────────────────
router.get('/ltp', withAuth, (req, res) => {
  const { instruments } = req.query;

  if (!instruments) {
    return res.status(400).json({
      status: 'error',
      message: 'instruments query param required. Example: ?instruments=NSE_INDEX|Nifty 50'
    });
  }

  const apiInstance = new UpstoxClient.MarketQuoteApi();

  apiInstance.ltp(instruments, '2.0', (error, data) => {
    if (error) {
      console.error('LTP error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
    res.json({ status: 'success', data: data?.data || data });
  });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/quote?instruments=NSE_INDEX|Nifty 50
//  Full OHLC quote with depth
// ─────────────────────────────────────────────────────────
router.get('/quote', withAuth, (req, res) => {
  const { instruments } = req.query;

  if (!instruments) {
    return res.status(400).json({
      status: 'error',
      message: 'instruments query param required.'
    });
  }

  const apiInstance = new UpstoxClient.MarketQuoteApi();

  apiInstance.getFullMarketQuote(instruments, '2.0', (error, data) => {
    if (error) {
      console.error('Quote error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
    res.json({ status: 'success', data: data?.data || data });
  });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/ohlc?instruments=NSE_INDEX|Nifty 50&interval=1d
//  OHLC data — intervals: 1d, 1w, 1month, I1, I30
// ─────────────────────────────────────────────────────────
router.get('/ohlc', withAuth, (req, res) => {
  const { instruments, interval = 'I1' } = req.query;

  if (!instruments) {
    return res.status(400).json({
      status: 'error',
      message: 'instruments query param required.'
    });
  }

  const apiInstance = new UpstoxClient.MarketQuoteApi();

  apiInstance.getMarketQuoteOhlc(instruments, interval, '2.0', (error, data) => {
    if (error) {
      console.error('OHLC error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
    res.json({ status: 'success', data: data?.data || data });
  });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/candles/:instrumentKey
//  Historical OHLC candles for charts
//  Query params:
//    interval: 1minute | 30minute | day | week | month
//    from:     YYYY-MM-DD  (default: 30 days ago)
//    to:       YYYY-MM-DD  (default: today)
// ─────────────────────────────────────────────────────────
router.get('/candles', withAuth, (req, res) => {
  const { instrument, interval = 'day', from, to } = req.query;

  if (!instrument) {
    return res.status(400).json({
      status: 'error',
      message: 'instrument query param required. Example: ?instrument=NSE_EQ|INE002A01018'
    });
  }

  // Default date range: last 30 days
  const today   = new Date();
  const toDate  = to   || today.toISOString().split('T')[0];
  const fromDate = from || new Date(today - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const apiInstance = new UpstoxClient.HistoryApi();

  apiInstance.getHistoricalCandleData1(
    instrument,
    interval,
    toDate,
    fromDate,
    '2.0',
    (error, data) => {
      if (error) {
        console.error('Candles error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }
      res.json({ status: 'success', data: data?.data || data });
    }
  );
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/intraday-candles
//  Today's intraday candle data
//  Query params:
//    instrument: NSE_EQ|INE002A01018
//    interval:   1minute | 30minute
// ─────────────────────────────────────────────────────────
router.get('/intraday-candles', withAuth, (req, res) => {
  const { instrument, interval = '30minute' } = req.query;

  if (!instrument) {
    return res.status(400).json({
      status: 'error',
      message: 'instrument query param required.'
    });
  }

  const apiInstance = new UpstoxClient.HistoryApi();

  apiInstance.getIntraDayCandleData(instrument, interval, '2.0', (error, data) => {
    if (error) {
      console.error('Intraday candles error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
    res.json({ status: 'success', data: data?.data || data });
  });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/search?q=RELIANCE
//  Search instruments by name/symbol
// ─────────────────────────────────────────────────────────
router.get('/search', withAuth, (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      status: 'error',
      message: 'q query param required. Example: ?q=RELIANCE'
    });
  }

  const apiInstance = new UpstoxClient.SearchApi();

  apiInstance.searchInstrument(q, '2.0', (error, data) => {
    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
    res.json({ status: 'success', data: data?.data || data });
  });
});

// ─────────────────────────────────────────────────────────
//  GET /api/market/indices
//  All major Indian indices — normalized for frontend
// ─────────────────────────────────────────────────────────
router.get('/indices', withAuth, (req, res) => {
  const apiInstance = new UpstoxClient.MarketQuoteApi();

  const instrumentKeys = [
    'NSE_INDEX|Nifty 50',
    'NSE_INDEX|Nifty Bank',
    'NSE_INDEX|Nifty IT',
    'NSE_INDEX|Nifty Midcap 50',
    'BSE_INDEX|SENSEX',
  ];

  const labelMap = {
    'NSE_INDEX|Nifty 50':        'NIFTY 50',
    'NSE_INDEX|Nifty Bank':      'NIFTY BANK',
    'NSE_INDEX|Nifty IT':        'NIFTY IT',
    'NSE_INDEX|Nifty Midcap 50': 'NIFTY MIDCAP',
    'BSE_INDEX|SENSEX':          'SENSEX',
  };

  apiInstance.ltp(instrumentKeys.join(','), '2.0', (error, data) => {
    if (error) {
      console.error('Indices error:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }

    try {
      // Upstox ltp response — key format varies: "NSE_INDEX|Nifty 50" or "NSE_INDEX:Nifty 50"
      const raw = data?.data || data || {};

      // Build a lookup that works for both | and : separator formats
      const findEntry = (key) => {
        if (raw[key]) return raw[key];
        // Try colon format: "NSE_INDEX|Nifty 50" → "NSE_INDEX:Nifty 50"
        const colonKey = key.replace('|', ':');
        if (raw[colonKey]) return raw[colonKey];
        // Try matching by partial name
        const name = key.split('|')[1];
        const found = Object.keys(raw).find(k => k.includes(name));
        return found ? raw[found] : {};
      };

      // Normalize into array for easy frontend consumption
      const normalized = instrumentKeys.map((key) => {
        const entry     = findEntry(key);
        // Upstox SDK returns lastPrice (camelCase) not last_price
        const ltp       = entry.lastPrice || entry.last_price || 0;
        const close     = entry.ohlc?.close || entry.close_price || ltp;
        const change    = parseFloat((ltp - close).toFixed(2));
        const changePct = close > 0
          ? parseFloat(((change / close) * 100).toFixed(2))
          : 0;

        return {
          key,
          name:          labelMap[key] || key.split('|')[1],
          ltp,
          close,
          change,
          changePercent: changePct,
          isPositive:    change >= 0,
        };
      }).filter(d => d.ltp > 0);

      res.json({ status: 'success', data: normalized, raw });
    } catch (e) {
      console.error('Indices normalize error:', e);
      res.status(500).json({ status: 'error', message: e.message });
    }
  });
});

module.exports = router;
