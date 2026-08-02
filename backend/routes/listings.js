import { tokenStore } from '../utils/tokenStore.js';

const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET;
const API_KEY_HEADER = `${ETSY_API_KEY}:${ETSY_SHARED_SECRET}`;
const ETSY_BASE = 'https://api.etsy.com/v3';

async function refreshTokenIfNeeded() {
  if (!tokenStore.refreshToken) return false;
  try {
    const tokenRes = await fetch(`${ETSY_BASE}/public/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-api-key': API_KEY_HEADER
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ETSY_API_KEY,
        refresh_token: tokenStore.refreshToken
      })
    });
    if (!tokenRes.ok) return false;
    const data = await tokenRes.json();
    tokenStore.save(
      data.access_token,
      data.refresh_token || tokenStore.refreshToken,
      tokenStore.shopId,
      tokenStore.shopName
    );
    return true;
  } catch {
    return false;
  }
}

async function etsyFetch(path, options = {}) {
  let res = await fetch(`${ETSY_BASE}${path}`, {
    ...options,
    headers: {
      'x-api-key': API_KEY_HEADER,
      'Authorization': `Bearer ${tokenStore.accessToken}`,
      ...options.headers
    }
  });
  if (res.status === 401 && tokenStore.refreshToken) {
    const refreshed = await refreshTokenIfNeeded();
    if (refreshed) {
      res = await fetch(`${ETSY_BASE}${path}`, {
        ...options,
        headers: {
          'x-api-key': API_KEY_HEADER,
          'Authorization': `Bearer ${tokenStore.accessToken}`,
          ...options.headers
        }
      });
    }
  }
  return res;
}

export default function listingRoutes(app) {

  app.get('/api/listings', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const params = new URLSearchParams(req.query);
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/listings?${params}`);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/listings/:listingId', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}`);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/listings', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/listings/:listingId', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const body = new URLSearchParams(req.body).toString();
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/listings/:listingId', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}`, {
        method: 'DELETE'
      });
      if (response.status === 204) return res.json({ ok: true });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  async function uploadWithRefresh(path, body, contentType) {
    let res = await fetch(path, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY_HEADER,
        'Authorization': `Bearer ${tokenStore.accessToken}`,
        'Content-Type': contentType
      },
      body
    });
    if (res.status === 401 && tokenStore.refreshToken) {
      const refreshed = await refreshTokenIfNeeded();
      if (refreshed) {
        res = await fetch(path, {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY_HEADER,
            'Authorization': `Bearer ${tokenStore.accessToken}`,
            'Content-Type': contentType
          },
          body
        });
      }
    }
    return res;
  }

  // Image upload
  app.post('/api/listings/:listingId/images', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await uploadWithRefresh(
        `${ETSY_BASE}/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}/images`,
        req.body,
        req.headers['content-type']
      );
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // File upload
  app.post('/api/listings/:listingId/files', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await uploadWithRefresh(
        `${ETSY_BASE}/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}/files`,
        req.body,
        req.headers['content-type']
      );
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Shipping profiles
  app.get('/api/shipping-profiles', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/shipping-profiles`);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/shipping-profiles', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const body = new URLSearchParams(req.body).toString();
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/shipping-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Readiness states
  app.get('/api/readiness-states', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/readiness-state-definitions`);
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/readiness-states', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const body = new URLSearchParams(req.body).toString();
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/readiness-state-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
