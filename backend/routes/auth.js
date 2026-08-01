import crypto from 'crypto';
import { tokenStore } from '../utils/tokenStore.js';
import { sessionStore } from '../utils/sessionStore.js';

const ETSY_API_KEY = process.env.ETSY_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL;
const ETSY_BASE = 'https://api.etsy.com/v3';
const ETSY_AUTH_BASE = 'https://www.etsy.com';

function getRedirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `https://${host}/auth/etsy/callback`;
}

export default function authRoutes(app) {

  // Initiate OAuth
  app.get('/auth/etsy', (req, res) => {
    const redirectUri = getRedirectUri(req);
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const sessions = sessionStore.clean();
    sessions[state] = { codeVerifier, redirectUri, createdAt: Date.now() };
    sessionStore.save(sessions);

    const scopes = ['listings_r', 'listings_w', 'listings_d', 'shops_r', 'shops_w'].join('%20');

    const authUrl = `${ETSY_AUTH_BASE}/oauth/connect` +
      `?response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}` +
      `&client_id=${ETSY_API_KEY}` +
      `&state=${state}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256`;

    res.json({ authUrl });
  });

  // OAuth callback
  app.get('/auth/etsy/callback', async (req, res) => {
    const redirectUri = getRedirectUri(req);
    const { code, state, error: etsyError, error_description } = req.query;

    console.log('=== OAUTH CALLBACK ===');
    console.log('Query params:', JSON.stringify(req.query, null, 2));
    console.log('Has ETSY_API_KEY:', !!process.env.ETSY_API_KEY);
    console.log('Has ETSY_SHARED_SECRET:', !!process.env.ETSY_SHARED_SECRET);
    console.log('Has FRONTEND_URL:', !!process.env.FRONTEND_URL);
    console.log('Computed redirectUri:', redirectUri);

    if (!code || !state) {
      if (etsyError) {
        console.error('Etsy returned error:', etsyError, '| description:', error_description);
        return res.redirect(`${FRONTEND_URL}?error=${etsyError}&desc=${encodeURIComponent(error_description || '')}`);
      }
      console.error('Missing code or state');
      return res.redirect(`${FRONTEND_URL}?error=missing_params`);
    }

    const sessions = sessionStore.load();
    const session = sessions[state];
    if (!session) {
      console.error('No session found for state:', state);
      console.error('Available states:', Object.keys(sessions));
      return res.redirect(`${FRONTEND_URL}?error=invalid_state`);
    }

    const storedRedirectUri = session.redirectUri || redirectUri;
    delete sessions[state];
    sessionStore.save(sessions);

    try {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ETSY_API_KEY,
        redirect_uri: storedRedirectUri,
        code,
        code_verifier: session.codeVerifier
      });
      console.log('Token request body (code masked):', tokenBody.toString().replace(code, '[CODE_MASKED]'));

      const tokenRes = await fetch(`${ETSY_BASE}/public/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody
      });

      const tokenText = await tokenRes.text();
      console.log('Token response status:', tokenRes.status);
      console.log('Token response body:', tokenText);

      if (!tokenRes.ok) {
        console.error('Token exchange FAILED');
        return res.redirect(`${FRONTEND_URL}?error=token_exchange_failed&http=${tokenRes.status}`);
      }

      const data = JSON.parse(tokenText);
      let shopId = null;
      let shopName = null;

      // Fetch shop info
      try {
        console.log('=== FETCHING SHOP INFO ===');
        console.log('Access token length:', data.access_token?.length);
        const shopRes = await fetch(`${ETSY_BASE}/application/shops`, {
          headers: { 'x-api-key': ETSY_API_KEY, 'Authorization': `Bearer ${data.access_token}` }
        });
        console.log('Shop lookup HTTP status:', shopRes.status);
        const shopText = await shopRes.text();
        console.log('Shop lookup response body:', shopText);
        if (shopRes.ok) {
          const shopData = JSON.parse(shopText);
          const shop = shopData.results?.[0] || shopData;
          if (shop && shop.shop_id) {
            shopId = String(shop.shop_id);
            shopName = shop.shop_name || null;
            console.log('Shop found:', shopId, shopName);
          } else {
            console.error('Shop response parsed but no shop_id found. Data:', JSON.stringify(shopData).slice(0, 500));
          }
        } else {
          console.error('Shop lookup returned non-OK status:', shopRes.status);
        }
      } catch (e) {
        console.error('Failed to fetch shop:', e.message, e.stack);
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
