import crypto from 'crypto';
import { tokenStore } from '../utils/tokenStore.js';
import { sessionStore } from '../utils/sessionStore.js';

const ETSY_API_KEY = process.env.ETSY_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL;
const ETSY_BASE = 'https://api.etsy.com/v3';
const ETSY_AUTH_BASE = 'https://www.etsy.com';
const REDIRECT_URI = process.env.REDIRECT_URI || `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/auth/etsy/callback`;

export default function authRoutes(app) {

  // Initiate OAuth
  app.get('/auth/etsy', (req, res) => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const sessions = sessionStore.clean();
    sessions[state] = { codeVerifier, createdAt: Date.now() };
    sessionStore.save(sessions);

    const scopes = ['listings_r', 'listings_w', 'listings_d', 'shops_r', 'shops_w'].join('%20');

    const authUrl = `${ETSY_AUTH_BASE}/oauth/connect` +
      `?response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${scopes}` +
      `&client_id=${ETSY_API_KEY}` +
      `&state=${state}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256`;

    res.json({ authUrl });
  });

  // OAuth callback
  app.get('/auth/etsy/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) return res.redirect(`${FRONTEND_URL}?error=missing_params`);

    const sessions = sessionStore.load();
    const session = sessions[state];
    if (!session) return res.redirect(`${FRONTEND_URL}?error=invalid_state`);

    delete sessions[state];
    sessionStore.save(sessions);

    try {
      const tokenRes = await fetch(`${ETSY_BASE}/public/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: ETSY_API_KEY,
          redirect_uri: REDIRECT_URI,
          code,
          code_verifier: session.codeVerifier
        })
      });

      if (!tokenRes.ok) {
        console.error('Token exchange failed:', await tokenRes.text());
        return res.redirect(`${FRONTEND_URL}?error=token_exchange_failed`);
      }

      const data = await tokenRes.json();
      let shopId = null;
      let shopName = null;

      // Fetch shop info
      try {
        const shopRes = await fetch(`${ETSY_BASE}/application/shops`, {
          headers: { 'x-api-key': ETSY_API_KEY, 'Authorization': `Bearer ${data.access_token}` }
        });
        if (shopRes.ok) {
          const shop = await shopRes.json();
          shopId = String(shop.shop_id);
          shopName = shop.shop_name || null;
        }
      } catch (e) {
        console.error('Failed to fetch shop:', e);
      }

      tokenStore.save(data.access_token, data.refresh_token, shopId, shopName);
      res.redirect(`${FRONTEND_URL}?etsy_connected=true`);
    } catch (e) {
      console.error('OAuth callback error:', e);
      res.redirect(`${FRONTEND_URL}?error=callback_error`);
    }
  });

  // Refresh token
  app.post('/auth/refresh', async (req, res) => {
    if (!tokenStore.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available' });
    }
    try {
      const tokenRes = await fetch(`${ETSY_BASE}/public/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: ETSY_API_KEY,
          refresh_token: tokenStore.refreshToken
        })
      });
      if (!tokenRes.ok) {
        return res.status(401).json({ error: 'Refresh failed' });
      }
      const data = await tokenRes.json();
      tokenStore.accessToken = data.access_token;
      tokenStore.refreshToken = data.refresh_token || tokenStore.refreshToken;
      tokenStore.persist();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Connection status
  app.get('/auth/status', (req, res) => {
    res.json({
      connected: tokenStore.isConnected(),
      shopId: tokenStore.shopId || null,
      shopName: tokenStore.shopName || null
    });
  });

  // Disconnect
  app.post('/auth/disconnect', (req, res) => {
    tokenStore.clear();
    res.json({ success: true });
  });

  // Test connection
  app.get('/api/test-connection', async (req, res) => {
    if (!tokenStore.isConnected()) {
      return res.status(400).json({ error: 'Not connected to Etsy' });
    }
    try {
      const shopRes = await fetch(`${ETSY_BASE}/application/shops/${tokenStore.shopId}`, {
        headers: { 'x-api-key': ETSY_API_KEY, 'Authorization': `Bearer ${tokenStore.accessToken}` }
      });
      if (shopRes.ok) {
        const shop = await shopRes.json();
        res.json({ ok: true, shop_id: shop.shop_id, shop_name: shop.shop_name });
      } else {
        res.status(shopRes.status).json({ ok: false, error: await shopRes.text() });
      }
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}
