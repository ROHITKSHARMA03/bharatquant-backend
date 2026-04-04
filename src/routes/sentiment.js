// src/routes/sentiment.js
// ─────────────────────────────────────────────────────────
//  AI Market Sentiment powered by Google Gemini AI
//  Fetches real Indian market news + asks Gemini to score it
// ─────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Cache sentiment for 1 hour (avoid repeated API calls) ─
let sentimentCache = null;
let cacheTime      = null;
const CACHE_TTL    = 60 * 60 * 1000; // 1 hour

// ── Indian market news sources (free, no API key needed) ──
const NEWS_SOURCES = [
  {
    name: 'Economic Times Markets',
    url:  'https://economictimes.indiatimes.com/markets/rss.cms',
  },
  {
    name: 'MoneyControl',
    url:  'https://www.moneycontrol.com/rss/MCtopnews.xml',
  },
];

// ── Fetch RSS headlines ───────────────────────────────────
const fetchHeadlines = async () => {
  const headlines = [];

  for (const source of NEWS_SOURCES) {
    try {
      const res  = await axios.get(source.url, {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      // Simple XML title extraction — no parser needed
      const matches = res.data.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g) || [];
      const titles  = matches
        .slice(1, 8) // skip feed title, take first 7 headlines
        .map(t => t.replace(/<\/?title>|<!\[CDATA\[|\]\]>/g, '').trim())
        .filter(t => t.length > 10);

      headlines.push(...titles.map(t => `[${source.name}] ${t}`));
    } catch (e) {
      console.log(`News fetch failed for ${source.name}:`, e.message);
    }
  }

  return headlines;
};

// ── Ask Gemini to analyze sentiment ──────────────────────
const analyzeSentimentWithGemini = async (headlines, marketData) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Using gemini-2.5-flash as it is fast and ideal for text/data analysis
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: "application/json", // Enforces strict JSON output
    }
  });

  const headlineText = headlines.length > 0
    ? headlines.join('\n')
    : 'No live headlines available — analyze based on current Indian market conditions.';

  const marketContext = marketData
    ? `Current market data: NIFTY 50 at ${marketData.nifty}, SENSEX at ${marketData.sensex}`
    : '';

  const prompt = `You are an expert Indian stock market analyst. Analyze the following news headlines and market data to provide a market sentiment score.

${marketContext}

TODAY'S INDIAN MARKET HEADLINES:
${headlineText}

Based on these headlines, provide a JSON response with EXACTLY this structure:
{
  "score": <number 0-100, where 0=extreme fear, 50=neutral, 100=extreme greed>,
  "overall": "<Bearish|Slightly Bearish|Neutral|Slightly Bullish|Bullish|Very Bullish>",
  "newsScore": <number 0-100>,
  "socialScore": <number 0-100>,
  "marketScore": <number 0-100>,
  "topBullish": ["<signal 1>", "<signal 2>", "<signal 3>"],
  "topBearish": ["<signal 1>", "<signal 2>"],
  "summary": "<2 sentence market summary>",
  "analyzedAt": "${new Date().toISOString()}"
}

Rules:
- newsScore: sentiment from the headlines above
- socialScore: estimated retail investor sentiment based on news tone
- marketScore: technical market sentiment based on index levels
- topBullish: specific positive factors from headlines (max 3)
- topBearish: specific negative factors from headlines (max 2)
- Be realistic and data-driven, not overly optimistic`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Because we used responseMimeType: "application/json", text is guaranteed to be JSON
  return JSON.parse(text);
};

// ─────────────────────────────────────────────────────────
//  GET /api/sentiment
//  Returns AI-powered market sentiment using Gemini
// ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  // Return cached result if fresh
  if (sentimentCache && cacheTime && (Date.now() - cacheTime < CACHE_TTL)) {
    return res.json({
      status:  'success',
      data:    sentimentCache,
      cached:  true,
      cacheAge: Math.round((Date.now() - cacheTime) / 60000) + ' minutes',
    });
  }

  // Check Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      status:  'error',
      message: 'GEMINI_API_KEY not set in environment variables',
    });
  }

  try {
    console.log('🤖 Fetching fresh sentiment from Gemini AI...');

    // Step 1: Fetch live news headlines
    const headlines = await fetchHeadlines();
    console.log(`📰 Got ${headlines.length} headlines`);

    // Step 2: Get current Nifty/Sensex for context (optional)
    let marketData = null;
    try {
      const UpstoxClient = require('upstox-js-sdk');
      const token = req.headers['x-access-token'] || req.app.locals.accessToken;
      if (token) {
        const defaultClient = UpstoxClient.ApiClient.instance;
        defaultClient.authentications['OAUTH2'].accessToken = token;
      }
    } catch (_) {}

    // Step 3: Ask Gemini to analyze
    const sentiment = await analyzeSentimentWithGemini(headlines, marketData);
    sentiment.headlines = headlines.slice(0, 5); // include top 5 headlines in response

    // Cache the result
    sentimentCache = sentiment;
    cacheTime      = Date.now();

    console.log(`✅ Sentiment: ${sentiment.score} (${sentiment.overall})`);

    res.json({ status: 'success', data: sentiment, cached: false });

  } catch (err) {
    console.error('Sentiment error:', err.message);

    // Return fallback if Gemini fails
    res.status(500).json({
      status:  'error',
      message: err.message,
      fallback: {
        score:       50,
        overall:     'Neutral',
        newsScore:   50,
        socialScore: 50,
        marketScore: 50,
        topBullish:  ['Market analysis unavailable'],
        topBearish:  ['Please check API key or quota'],
        summary:     'Live sentiment temporarily unavailable.',
      },
    });
  }
});

// Force refresh (bypass cache)
router.post('/refresh', async (req, res) => {
  sentimentCache = null;
  cacheTime      = null;
  res.json({ status: 'success', message: 'Cache cleared — next request will fetch fresh sentiment' });
});

module.exports = router;