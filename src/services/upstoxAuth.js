// src/services/upstoxAuth.js
// ─────────────────────────────────────────────
//  Handles Upstox OAuth2 login & token exchange
// ─────────────────────────────────────────────
const axios = require('axios');

/**
 * Build the Upstox OAuth2 authorization URL
 * Redirect the user to this URL to start login
 */
const getAuthUrl = (apiKey, redirectUri) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: apiKey,
    redirect_uri: redirectUri,
  });
  return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
};

/**
 * Exchange the authorization code for an access token
 * Called once Upstox redirects back to /callback?code=xxx
 */
const getAccessToken = async (code, apiKey, apiSecret, redirectUri) => {
  try {
    const response = await axios.post(
      'https://api.upstox.com/v2/login/authorization/token',
      new URLSearchParams({
        code,
        client_id: apiKey,
        client_secret: apiSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      }
    );
    return response.data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('❌ Token exchange failed:', detail);
    throw new Error(JSON.stringify(detail));
  }
};

module.exports = { getAuthUrl, getAccessToken };
