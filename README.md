# 🇮🇳 BharatQuant Backend — Upstox Live Market API

> Powers live NSE/BSE market data for [bharat-trading.lovable.app](https://bharat-trading.lovable.app)

---

## ⚡ Quick Start (Local Development)

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
cp .env.example .env
```

Edit `.env` — fill in your credentials:
```env
UPSTOX_API_KEY=7af0cee5-0e42-47e0-904b-91f8da045b5f
UPSTOX_API_SECRET=YOUR_NEW_SECRET        ← regenerate this!
REDIRECT_URI=http://localhost:3001/callback
FRONTEND_URL=https://bharat-trading.lovable.app
```

### 3. Run server
```bash
npm run dev
```

### 4. Login with Upstox
Open in browser:
```
http://localhost:3001/auth/login
```
→ Login with your Upstox account
→ You'll be redirected back to the frontend with a live token ✅

### 5. Test your APIs
```bash
# Health check
curl http://localhost:3001/health

# Market status (no auth)
curl http://localhost:3001/api/market/status

# Nifty 50 LTP (needs token in header)
curl -H "x-access-token: YOUR_TOKEN" \
  "http://localhost:3001/api/market/ltp?instruments=NSE_INDEX|Nifty 50"

# All indices
curl -H "x-access-token: YOUR_TOKEN" \
  http://localhost:3001/api/market/indices

# Reliance candles
curl -H "x-access-token: YOUR_TOKEN" \
  "http://localhost:3001/api/market/candles?instrument=NSE_EQ|INE002A01018&interval=day"
```

---

## 🚀 Deploy to Railway (Production)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "BharatQuant Upstox backend v1.0"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/bharatquant-backend
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to **https://railway.app** → Sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select **bharatquant-backend**
4. Railway auto-detects Node.js and deploys ✅

### Step 3 — Add Environment Variables on Railway
In Railway dashboard → Your project → **Variables** tab, add:

| Key | Value |
|-----|-------|
| `UPSTOX_API_KEY` | `7af0cee5-0e42-47e0-904b-91f8da045b5f` |
| `UPSTOX_API_SECRET` | `your_new_regenerated_secret` |
| `REDIRECT_URI` | `https://YOUR-APP.up.railway.app/callback` |
| `FRONTEND_URL` | `https://bharat-trading.lovable.app` |
| `SESSION_SECRET` | `any_random_string_here` |

### Step 4 — Update Upstox App Redirect URI
1. Go to **https://account.upstox.com/apps**
2. Click ✏️ Edit on **BharatQuant**
3. Change Redirect URI to: `https://YOUR-APP.up.railway.app/callback`
4. Save ✅

### Step 5 — Update Lovable Frontend
In your Lovable project settings, add environment variables:
```
VITE_BACKEND_URL=https://YOUR-APP.up.railway.app
VITE_BACKEND_WS=wss://YOUR-APP.up.railway.app/ws/market
```

---

## 📁 Lovable Frontend Integration

Copy files from `LOVABLE_FRONTEND/` into your Lovable project:

| File | Destination in Lovable |
|------|------------------------|
| `upstoxService.js` | `src/services/upstoxService.js` |
| `useLiveMarket.js` | `src/hooks/useLiveMarket.js` |

### In your main App.jsx, add this once:
```jsx
import { handleAuthRedirect, isAuthenticated, loginWithUpstox } from './services/upstoxService';

function App() {
  useEffect(() => {
    handleAuthRedirect(); // reads ?upstox_token= from URL after login
  }, []);

  if (!isAuthenticated()) {
    return (
      <div>
        <button onClick={loginWithUpstox}>
          Connect Upstox for Live Data
        </button>
      </div>
    );
  }

  return <YourMainApp />;
}
```

### Live prices in any component:
```jsx
import { useLiveMarket } from '../hooks/useLiveMarket';

const MarketWidget = () => {
  const { prices, status } = useLiveMarket([
    'NSE_INDEX|Nifty 50',
    'NSE_INDEX|Nifty Bank',
    'NSE_EQ|INE002A01018',  // Reliance
  ]);

  return (
    <div>
      <span>● {status === 'connected' ? 'LIVE' : 'OFFLINE'}</span>
      {Object.entries(prices).map(([key, d]) => (
        <div key={key}>
          <b>{key.split('|')[1]}</b>
          <span>₹{d.ltp?.toFixed(2)}</span>
          <span style={{ color: d.isPositive ? '#00C176' : '#FF3B30' }}>
            {d.isPositive ? '+' : ''}{d.changePercent}%
          </span>
        </div>
      ))}
    </div>
  );
};
```

---

## 🔑 Common Instrument Keys

| Stock / Index | Instrument Key |
|---------------|---------------|
| NIFTY 50 | `NSE_INDEX\|Nifty 50` |
| NIFTY BANK | `NSE_INDEX\|Nifty Bank` |
| NIFTY IT | `NSE_INDEX\|Nifty IT` |
| SENSEX | `BSE_INDEX\|SENSEX` |
| Reliance | `NSE_EQ\|INE002A01018` |
| TCS | `NSE_EQ\|INE467B01029` |
| Infosys | `NSE_EQ\|INE009A01021` |
| HDFC Bank | `NSE_EQ\|INE040A01034` |
| ICICI Bank | `NSE_EQ\|INE090A01021` |
| Wipro | `NSE_EQ\|INE075A01022` |
| Tata Motors | `NSE_EQ\|INE155A01022` |
| SBI | `NSE_EQ\|INE062A01020` |

Use `/api/market/search?q=SYMBOL` to find any other stock's instrument key.

---

## 📡 API Reference

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /` | ❌ | API guide |
| `GET /health` | ❌ | Health check |
| `GET /auth/login` | ❌ | Start Upstox OAuth |
| `GET /auth/status` | ❌ | Check login status |
| `GET /api/market/status` | ❌ | NSE open/closed |
| `GET /api/market/instruments` | ❌ | Instrument key map |
| `GET /api/market/indices` | ✅ | All major indices LTP |
| `GET /api/market/ltp` | ✅ | Live LTP for any instruments |
| `GET /api/market/quote` | ✅ | Full OHLC + depth |
| `GET /api/market/candles` | ✅ | Historical candle data |
| `GET /api/market/intraday-candles` | ✅ | Today's intraday candles |
| `GET /api/market/search` | ✅ | Search instruments |
| `WS /ws/market` | ✅ | Live tick stream |

---

## ⚠️ Security Reminders
- Never commit `.env` to GitHub (it's in `.gitignore` ✅)
- Regenerate your API Secret on Upstox dashboard
- Tokens expire daily — users need to re-login each trading day
- For production, store tokens in Redis, not `app.locals`
