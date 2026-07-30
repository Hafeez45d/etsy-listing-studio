# Etsy Listing Studio — Backend

Node.js/Express backend providing secure Etsy OAuth 2.0 with PKCE and a proxy API for all Etsy listing operations.

## Architecture

```
backend/
├── server.js              Entry point
├── routes/
│   ├── auth.js            OAuth PKCE, token mgmt, connection status
│   └── listings.js        Etsy API proxy (CRUD, images, files, shipping, readiness)
├── utils/
│   ├── encryption.js      AES-256-GCM encrypt/decrypt
│   ├── tokenStore.js      Persistent encrypted token storage
│   └── sessionStore.js    OAuth state session management
├── package.json
├── render.yaml            Render deployment config
└── .env.example           Environment variables template
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ETSY_API_KEY` | Yes | Etsy app API keystring |
| `ETSY_SHARED_SECRET` | Yes | Etsy app shared secret |
| `FRONTEND_URL` | Yes | CORS origin (GitHub Pages URL) |
| `ENCRYPTION_SECRET` | Yes | Secret for AES-256-GCM token encryption |
| `REDIRECT_URI` | No | Auto-computed from `RENDER_EXTERNAL_URL` |
| `PORT` | No | Defaults to 3000 |

## Deployment (Render)

1. Push to GitHub
2. Create a new **Web Service** on Render pointing to this repo
3. Set **Root Directory** to `backend`
4. Add the `ETSY_API_KEY` and `ETSY_SHARED_SECRET` environment variables
5. Deploy — Render automatically generates `ENCRYPTION_SECRET` and `REDIRECT_URI`

Or use the Blueprint deploy with `render.yaml`.

## Etsy OAuth Redirect URI

Set this in your Etsy app settings:
```
https://<your-service>.onrender.com/auth/etsy/callback
```

## Security

- Etsy shared secret NEVER leaves the backend
- Access/refresh tokens encrypted at rest (AES-256-GCM)
- PKCE required for all OAuth flows
- CORS locked to the specific frontend origin

## Local Development

```bash
cd backend
cp .env.example .env
# Edit .env with your Etsy API key and secret
npm install
npm run dev
```
