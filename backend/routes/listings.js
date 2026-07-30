import { tokenStore } from '../utils/tokenStore.js';

const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_BASE = 'https://api.etsy.com/v3';

function etsyFetch(path, options = {}) {
  return fetch(`${ETSY_BASE}${path}`, {
    ...options,
    headers: {
      'x-api-key': ETSY_API_KEY,
      'Authorization': `Bearer ${tokenStore.accessToken}`,
      ...options.headers
    }
  });
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

  // Image upload
  app.post('/api/listings/:listingId/images', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const ct = req.headers['content-type'];
      const response = await fetch(
        `${ETSY_BASE}/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}/images`,
        {
          method: 'POST',
          headers: {
            'x-api-key': ETSY_API_KEY,
            'Authorization': `Bearer ${tokenStore.accessToken}`,
            'Content-Type': ct
          },
          body: req.body
        }
      );
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // File upload
  app.post('/api/listings/:listingId/files', async (req, res) => {
    if (!tokenStore.isConnected()) return res.status(401).json({ error: 'Not connected' });
    try {
      const ct = req.headers['content-type'];
      const response = await fetch(
        `${ETSY_BASE}/application/shops/${tokenStore.shopId}/listings/${req.params.listingId}/files`,
        {
          method: 'POST',
          headers: {
            'x-api-key': ETSY_API_KEY,
            'Authorization': `Bearer ${tokenStore.accessToken}`,
            'Content-Type': ct
          },
          body: req.body
        }
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
