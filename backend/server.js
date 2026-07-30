import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { tokenStore } from './utils/tokenStore.js';
import authRoutes from './routes/auth.js';
import listingRoutes from './routes/listings.js';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

const app = express();

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [FRONTEND_URL, 'https://hafeez45d.github.io', 'http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:5500', 'http://127.0.0.1:3000'];
    // Allow requests with no origin (curl, server-to-server, file://)
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multipart body parsing for file/image upload routes
app.use('/api/listings/:listingId/images', express.raw({ type: 'multipart/form-data', limit: '20mb' }));
app.use('/api/listings/:listingId/files', express.raw({ type: 'multipart/form-data', limit: '20mb' }));

// Health
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    shop: tokenStore.shopName || null,
    shopId: tokenStore.shopId || null,
    connected: tokenStore.isConnected()
  });
});

// Routes
authRoutes(app);
listingRoutes(app);

// Start
app.listen(PORT, () => {
  console.log(`Etsy Listing Studio backend running on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Etsy connected: ${tokenStore.isConnected()}`);
});
