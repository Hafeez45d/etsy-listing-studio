require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ──────────────────────────────────
const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hafeez45d.github.io';
const ETSY_BASE = 'https://api.etsy.com/v3';
const ETSY_OAUTH_BASE = 'https://www.etsy.com/oauth';
const REDIRECT_URI = `${FRONTEND_URL}/etsy-listing-studio/`;

// Validate required env vars
if (!ETSY_API_KEY || !ETSY_SHARED_SECRET) {
  console.error('ERROR: ETSY_API_KEY and ETSY_SHARED_SECRET must be set in .env');
  console.error('Copy .env.example to .env and fill in your Etsy app credentials.');
  process.exit(1);
}

// ─── MIDDLEWARE ──────────────────────────────
app.use(cors({
  origin: [
    FRONTEND_URL,
    'https://hafeez45d.github.io',
    'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

// ─── PKCE UTILS ──────────────────────────────
function generateCodeVerifier() {
  return crypto.randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9\-._~]/g, '')
    .slice(0, 128);
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

// ─── SCOPES ──────────────────────────────────
const ETSY_SCOPES = [
  'listings_r',
  'listings_w',
  'listings_d',
  'shops_r',
  'shops_w',
  'transactions_r',
  'profile_r',
  'profile_w',
];

// In-memory store for PKCE verifiers (keyed by a short state token)
// In production, use a database or Redis. This is fine for single-server Render deployment.
const pendingAuths = new Map();

// Clean up expired pending auths every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingAuths) {
    if (now - data.createdAt > 10 * 60 * 1000) pendingAuths.delete(state);
  }
}, 10 * 60 * 1000);

// ─── ROUTES ──────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /auth/url — Generate PKCE and return the Etsy OAuth authorization URL
app.post('/auth/url', (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  // Store verifier for later token exchange
  pendingAuths.set(state, {
    codeVerifier,
    codeChallenge,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ETSY_API_KEY,
    redirect_uri: REDIRECT_URI,
    scope: ETSY_SCOPES.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${ETSY_OAUTH_BASE}/connect?${params.toString()}`;

  console.log(`[OAuth] Generated auth URL with state=${state.slice(0, 8)}...`);
  res.json({ url: authUrl, state });
});

// POST /auth/token — Exchange authorization code for access/refresh tokens
app.post('/auth/token', async (req, res) => {
  const { code, state } = req.body;

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  const pending = pendingAuths.get(state);
  if (!pending) {
    return res.status(400).json({ error: 'Invalid or expired state. Please restart the connection flow.' });
  }

  console.log(`[OAuth] Exchanging code for tokens (state=${state.slice(0, 8)}...)`);

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ETSY_API_KEY,
      redirect_uri: REDIRECT_URI,
      code: code,
      code_verifier: pending.codeVerifier,
    });

    // Etsy uses client_secret_post for token exchange
    const tokenRes = await fetch(`${ETSY_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    // Etsy OAuth token response body contains the token data
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[OAuth] Token exchange failed: ${tokenRes.status} - ${errText}`);
      let errData;
      try { errData = JSON.parse(errText); } catch (e) { errData = { error: errText }; }
      return res.status(tokenRes.status).json({
        error: errData.error_description || errData.error || 'Token exchange failed',
        details: errData,
      });
    }

    const tokenData = await tokenRes.json();
    console.log(`[OAuth] Token exchange successful`);

    // Clean up the pending auth
    pendingAuths.delete(state);

    // Now fetch shop info using the new access token
    const accessToken = tokenData.access_token;

    let shopInfo = null;
    try {
      const shopsRes = await fetch(
        `${ETSY_BASE}/application/shops?shop_name=`,
        {
          headers: {
            'x-api-key': ETSY_API_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (shopsRes.ok) {
        const shopsData = await shopsRes.json();
        if (shopsData.results && shopsData.results.length > 0) {
          const shop = shopsData.results[0];
          shopInfo = {
            shop_id: shop.shop_id,
            shop_name: shop.shop_name,
            title: shop.title,
            currency_code: shop.currency_code,
            is_vacation: shop.is_vacation,
          };
          console.log(`[OAuth] Found shop: ${shop.shop_name} (ID: ${shop.shop_id})`);
        }
      } else {
        // Try the getMeShops endpoint
        const meShopsRes = await fetch(
          `${ETSY_BASE}/application/users/me/shops`,
          {
            headers: {
              'x-api-key': ETSY_API_KEY,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        if (meShopsRes.ok) {
          const meShopsData = await meShopsRes.json();
          if (meShopsData.results && meShopsData.results.length > 0) {
            const shop = meShopsData.results[0];
            shopInfo = {
              shop_id: shop.shop_id,
              shop_name: shop.shop_name,
              title: shop.title,
              currency_code: shop.currency_code,
              is_vacation: shop.is_vacation,
            };
            console.log(`[OAuth] Found shop via /me/shops: ${shop.shop_name} (ID: ${shop.shop_id})`);
          }
        }
      }
    } catch (shopErr) {
      console.warn(`[OAuth] Could not fetch shop info:`, shopErr.message);
    }

    res.json({
      access_token: accessToken,
      refresh_token: tokenData.refresh_token || null,
      expires_in: tokenData.expires_in || 3600,
      token_type: tokenData.token_type || 'Bearer',
      api_key: ETSY_API_KEY,
      shop: shopInfo,
    });
  } catch (err) {
    console.error(`[OAuth] Unexpected error:`, err.message);
    res.status(500).json({ error: 'Internal server error during token exchange' });
  }
});

// POST /auth/refresh — Refresh an expired access token
app.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Missing refresh_token' });
  }

  try {
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ETSY_API_KEY,
      refresh_token: refresh_token,
    });

    const tokenRes = await fetch(`${ETSY_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: refreshParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[OAuth] Token refresh failed: ${tokenRes.status}`);
      let errData;
      try { errData = JSON.parse(errText); } catch (e) { errData = { error: errText }; }
      return res.status(tokenRes.status).json({
        error: errData.error_description || errData.error || 'Token refresh failed',
      });
    }

    const tokenData = await tokenRes.json();
    console.log(`[OAuth] Token refresh successful`);

    res.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refresh_token,
      expires_in: tokenData.expires_in || 3600,
      token_type: tokenData.token_type || 'Bearer',
      api_key: ETSY_API_KEY,
    });
  } catch (err) {
    console.error(`[OAuth] Refresh error:`, err.message);
    res.status(500).json({ error: 'Internal server error during token refresh' });
  }
});

// POST /shop/verify — Verify a token and return shop info (used by Test Connection)
app.post('/shop/verify', async (req, res) => {
  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'Missing access_token' });
  }

  try {
    // Try to get shop via /application/shops (with empty shop_name gets all shops for the user)
    const shopsRes = await fetch(
      `${ETSY_BASE}/application/shops?shop_name=`,
      {
        headers: {
          'x-api-key': ETSY_API_KEY,
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (shopsRes.ok) {
      const shopsData = await shopsRes.json();
      if (shopsData.results && shopsData.results.length > 0) {
        const shop = shopsData.results[0];
        return res.json({
          valid: true,
          shop: {
            shop_id: shop.shop_id,
            shop_name: shop.shop_name,
            title: shop.title,
            currency_code: shop.currency_code,
            is_vacation: shop.is_vacation,
          },
        });
      }
    }

    // Try /users/me/shops as fallback
    const meShopsRes = await fetch(
      `${ETSY_BASE}/application/users/me/shops`,
      {
        headers: {
          'x-api-key': ETSY_API_KEY,
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (meShopsRes.ok) {
      const meShopsData = await meShopsRes.json();
      if (meShopsData.results && meShopsData.results.length > 0) {
        const shop = meShopsData.results[0];
        return res.json({
          valid: true,
          shop: {
            shop_id: shop.shop_id,
            shop_name: shop.shop_name,
            title: shop.title,
            currency_code: shop.currency_code,
            is_vacation: shop.is_vacation,
          },
        });
      }
    }

    // If we got here, token is valid but no shops found
    return res.json({
      valid: true,
      shop: null,
      message: 'Token is valid but no shop was found. You may need to create a shop on Etsy first.',
    });
  } catch (err) {
    console.error(`[Shop Verify] Error:`, err.message);
    res.status(500).json({ error: 'Internal server error during shop verification' });
  }
});

// ─── START SERVER ────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Etsy Listing Studio Backend`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Server running on port ${PORT}`);
  console.log(`   Etsy API Key: ${ETSY_API_KEY.slice(0, 8)}...`);
  console.log(`   Frontend URL:  ${FRONTEND_URL}`);
  console.log(`   Redirect URI:  ${REDIRECT_URI}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
