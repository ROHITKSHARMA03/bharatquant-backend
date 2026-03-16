// src/services/wsProxy.js
// ─────────────────────────────────────────────────────────
//  WebSocket Proxy — Bridges Upstox V3 MarketDataStreamer
//  to your Lovable frontend in real-time
// ─────────────────────────────────────────────────────────
const WebSocket = require('ws');
const UpstoxClient = require('upstox-js-sdk');

// Default instruments streamed on connect
const DEFAULT_STREAM = [
  'NSE_INDEX|Nifty 50',
  'NSE_INDEX|Nifty Bank',
  'BSE_INDEX|SENSEX',
];

const setupWebSocketProxy = (server) => {
  const wss = new WebSocket.Server({ path: '/ws/market', server });

  console.log('📡 WebSocket server ready at /ws/market');

  wss.on('connection', (clientWs, req) => {
    console.log(`🔌 Frontend connected from ${req.socket.remoteAddress}`);

    // Get token from query param: ws://host/ws/market?token=xxx
    const url    = new URL(req.url, `http://${req.headers.host}`);
    const token  = url.searchParams.get('token') || server._app?.locals?.accessToken;

    if (!token) {
      clientWs.send(JSON.stringify({
        type: 'error',
        message: 'No access token. Connect with ?token=YOUR_TOKEN',
      }));
      clientWs.close();
      return;
    }

    // ── Setup Upstox SDK auth ───────────────────────────
    const defaultClient = UpstoxClient.ApiClient.instance;
    defaultClient.authentications['OAUTH2'].accessToken = token;

    // ── Create Upstox V3 Market Data Streamer ───────────
    let streamer = null;
    let isStreamerAlive = false;

    const connectStreamer = (instruments, mode) => {
      try {
        streamer = new UpstoxClient.MarketDataStreamerV3(
          instruments || DEFAULT_STREAM,
          mode || 'ltpc'
        );

        streamer.connect();

        streamer.on('open', () => {
          isStreamerAlive = true;
          console.log('✅ Upstox V3 stream connected');
          clientWs.send(JSON.stringify({
            type: 'status',
            connected: true,
            message: 'Live market stream connected',
            instruments: instruments || DEFAULT_STREAM,
          }));
        });

        streamer.on('message', (rawData) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;
          try {
            // Try to forward as parsed JSON
            const parsed = JSON.parse(rawData.toString('utf-8'));
            clientWs.send(JSON.stringify({ type: 'tick', data: parsed }));
          } catch (_) {
            // Binary (protobuf) — forward raw bytes
            clientWs.send(rawData);
          }
        });

        streamer.on('error', (err) => {
          console.error('⚠️  Upstox stream error:', err.message);
          isStreamerAlive = false;
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'error',
              message: 'Stream error: ' + err.message,
            }));
          }
        });

        streamer.on('close', () => {
          isStreamerAlive = false;
          console.log('🔴 Upstox stream closed');
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'status',
              connected: false,
              message: 'Stream disconnected',
            }));
          }
        });

      } catch (err) {
        console.error('Failed to create streamer:', err.message);
        clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    };

    // Connect with defaults immediately
    connectStreamer(DEFAULT_STREAM, 'ltpc');

    // ── Handle messages from frontend ──────────────────
    clientWs.on('message', (msg) => {
      try {
        const { action, instruments, mode } = JSON.parse(msg.toString());

        if (action === 'subscribe' && instruments?.length > 0) {
          if (isStreamerAlive && streamer) {
            streamer.subscribe(instruments, mode || 'ltpc');
            console.log(`📈 Subscribed: ${instruments.join(', ')}`);
          }
        } else if (action === 'unsubscribe' && instruments?.length > 0) {
          if (isStreamerAlive && streamer) {
            streamer.unsubscribe(instruments);
            console.log(`📉 Unsubscribed: ${instruments.join(', ')}`);
          }
        } else if (action === 'reconnect') {
          if (streamer) streamer.disconnect();
          connectStreamer(instruments || DEFAULT_STREAM, mode || 'ltpc');
        }
      } catch (e) {
        console.error('Invalid WS message from frontend:', e.message);
      }
    });

    // ── Cleanup on frontend disconnect ─────────────────
    clientWs.on('close', () => {
      console.log('🔌 Frontend disconnected — closing Upstox stream');
      if (streamer && isStreamerAlive) {
        try { streamer.disconnect(); } catch (_) {}
      }
    });
  });

  return wss;
};

module.exports = { setupWebSocketProxy };
