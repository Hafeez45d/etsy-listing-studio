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
  const url = `${ETSY_BASE}${path}`;
  const reqLog = {
    url,
    method: options.method || 'GET',
    headers: { ...options.headers, 'x-api-key': '***', 'Authorization': 'Bearer ***' },
    body: typeof options.body === 'string' ? options.body.slice(0, 500) : undefined
  };
  console.log('=== ETSY REQUEST ===', JSON.stringify(reqLog, null, 2));

  let res = await fetch(url, {
    ...options,
    headers: {
      'x-api-key': API_KEY_HEADER,
      'Authorization': `Bearer ${tokenStore.accessToken}`,
      ...options.headers
    }
  });
  const resText = await res.text();
  console.log('=== ETSY RESPONSE ===');
  console.log('HTTP Status:', res.status);
  console.log('Body:', resText.slice(0, 2000));

  if (res.status === 401 && tokenStore.refreshToken) {
    const refreshed = await refreshTokenIfNeeded();
    if (refreshed) {
      console.log('=== ETSY RETRY (after refresh) ===');
      res = await fetch(url, {
        ...options,
        headers: {
          'x-api-key': API_KEY_HEADER,
          'Authorization': `Bearer ${tokenStore.accessToken}`,
          ...options.headers
        }
      });
      const retryText = await res.text();
      console.log('HTTP Status:', res.status);
      console.log('Body:', retryText.slice(0, 2000));
      // Reconstruct response with consumed body
      return new Response(retryText, { status: res.status, headers: res.headers });
    }
  }
  return new Response(resText, { status: res.status, headers: res.headers });
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
      const body = { ...req.body };
      // Sanitize tags: Etsy limits each tag to 20 chars, alphanumeric + spaces + hyphens
      if (Array.isArray(body.tags)) {
        body.tags = body.tags
          .map(t => String(t).replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 20))
          .filter(t => t.length > 0)
          .slice(0, 13);
      }
      console.log('=== CREATE LISTING PAYLOAD ===', JSON.stringify(body, null, 2));
      const response = await etsyFetch(`/application/shops/${tokenStore.shopId}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
    console.log('=== ETSY UPLOAD REQUEST ===');
    console.log('URL:', path);
    console.log('Content-Type:', contentType);
    console.log('Body length:', body ? body.length : 0);

    let res = await fetch(path, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY_HEADER,
        'Authorization': `Bearer ${tokenStore.accessToken}`,
        'Content-Type': contentType
      },
      body
    });
    const resText = await res.text();
    console.log('=== ETSY UPLOAD RESPONSE ===');
    console.log('HTTP Status:', res.status);
    console.log('Body:', resText.slice(0, 2000));

    if (res.status === 401 && tokenStore.refreshToken) {
      const refreshed = await refreshTokenIfNeeded();
      if (refreshed) {
        console.log('=== ETSY UPLOAD RETRY (after refresh) ===');
        res = await fetch(path, {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY_HEADER,
            'Authorization': `Bearer ${tokenStore.accessToken}`,
            'Content-Type': contentType
          },
          body
        });
        const retryText = await res.text();
        console.log('HTTP Status:', res.status);
        console.log('Body:', retryText.slice(0, 2000));
        return new Response(retryText, { status: res.status, headers: res.headers });
      }
    }
    return new Response(resText, { status: res.status, headers: res.headers });
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
