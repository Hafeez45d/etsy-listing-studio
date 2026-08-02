import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { tokenStore } from './utils/tokenStore.js';
import authRoutes from './routes/auth.js';
import listingRoutes from './routes/listings.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hafeez45d.github.io/etsy-listing-studio/';

// In-memory log buffer for diagnostics
const logBuffer = [];
export function pushLog(msg) {
  logBuffer.push({ ts: new Date().toISOString(), msg });
  if (logBuffer.length > 50) logBuffer.shift();
}
export function getLogs() { return [...logBuffer]; }

const app = express();
app.set('trust proxy', true);

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [FRONTEND_URL, 'https://hafeez45d.github.io', 'http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:5500', 'http://127.0.0.1:3000'];
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root
app.get('/', (req, res) => {
  res.json({ status: 'ok', connected: tokenStore.isConnected() });
});

// API health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', shop: tokenStore.shopName || null, shopId: tokenStore.shopId || null, connected: tokenStore.isConnected() });
});

// Routes
authRoutes(app);
listingRoutes(app, upload);

// Debug: view recent callback logs
app.get('/debug/logs', (req, res) => {
  res.json({ logs: getLogs(), etsyConnected: tokenStore.isConnected(), shopId: tokenStore.shopId, shopName: tokenStore.shopName });
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Etsy Listing Studio running on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Etsy connected: ${tokenStore.isConnected()}`);
});
