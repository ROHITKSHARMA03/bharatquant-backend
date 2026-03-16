// ════════════════════════════════════════════════════════════
//  LOVABLE FRONTEND INTEGRATION FILE
//  Add this file to: src/hooks/useLiveMarket.js
//  in your Lovable / BharatQuant project
// ════════════════════════════════════════════════════════════
import { useEffect, useState, useRef, useCallback } from 'react';
import { getToken } from '../services/upstoxService';

const BACKEND_WS = import.meta.env.VITE_BACKEND_WS || 'ws://localhost:3001/ws/market';

/**
 * useLiveMarket — React hook for real-time Upstox market data
 *
 * Usage:
 *   const { prices, status, subscribe } = useLiveMarket([
 *     'NSE_INDEX|Nifty 50',
 *     'NSE_EQ|INE002A01018'
 *   ]);
 *
 * prices['NSE_INDEX|Nifty 50'] → { ltp, close, change, changePercent, lastTradeTime }
 */
export const useLiveMarket = (initialInstruments = []) => {
  const [prices, setPrices]   = useState({});
  const [status, setStatus]   = useState('disconnected'); // connected | disconnected | error
  const wsRef                 = useRef(null);

  const processTickData = useCallback((feeds) => {
    if (!feeds) return;
    setPrices((prev) => {
      const updated = { ...prev };
      Object.entries(feeds).forEach(([key, value]) => {
        const ltpc = value?.ltpc || value?.LTPC;
        if (ltpc) {
          const ltp   = ltpc.ltp   || ltpc.LTP   || 0;
          const close = ltpc.cp    || ltpc.CP     || ltpc.close || ltp;
          const change       = ltp - close;
          const changePct    = close > 0 ? ((change / close) * 100).toFixed(2) : '0.00';
          const ltt          = ltpc.ltt || ltpc.LTT;

          updated[key] = {
            ltp,
            close,
            change: parseFloat(change.toFixed(2)),
            changePercent: parseFloat(changePct),
            isPositive: change >= 0,
            lastTradeTime: ltt
              ? new Date(parseInt(ltt)).toLocaleTimeString('en-IN', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit'
                })
              : '--',
          };
        }
      });
      return updated;
    });
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('error');
      console.warn('⚠️ No Upstox token — call loginWithUpstox() first');
      return;
    }

    const wsUrl = `${BACKEND_WS}?token=${token}`;
    const ws    = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Subscribe to initial instruments
      if (initialInstruments.length > 0) {
        ws.send(JSON.stringify({
          action: 'subscribe',
          instruments: initialInstruments,
          mode: 'ltpc',
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'tick' && msg.data?.feeds) {
          processTickData(msg.data.feeds);
        } else if (msg.type === 'status') {
          setStatus(msg.connected ? 'connected' : 'disconnected');
        } else if (msg.type === 'error') {
          console.error('Stream error:', msg.message);
        }
      } catch (_) {
        // Binary protobuf data — skip client-side parsing
      }
    };

    ws.onclose = () => setStatus('disconnected');
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('error');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamically subscribe to more instruments
  const subscribe = useCallback((instruments, mode = 'ltpc') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', instruments, mode }));
    }
  }, []);

  // Unsubscribe from instruments
  const unsubscribe = useCallback((instruments) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'unsubscribe', instruments }));
    }
  }, []);

  return { prices, status, subscribe, unsubscribe };
};
