import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from './encryption.js';

const DATA_DIR = path.join(process.cwd(), '.data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const tokenStore = {
  accessToken: null,
  refreshToken: null,
  shopId: null,
  shopName: null,

  _loaded: false,

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      if (raw.etsyToken) {
        this.accessToken = decrypt(raw.etsyToken);
        this.refreshToken = raw.etsyRefreshToken ? decrypt(raw.etsyRefreshToken) : null;
        this.shopId = raw.etsyShopId || null;
        this.shopName = raw.etsyShopName || null;
      }
      this._loaded = true;
    } catch {
      this._loaded = true;
    }
  },

  persist() {
    const data = {
      etsyToken: this.accessToken ? encrypt(this.accessToken) : null,
      etsyRefreshToken: this.refreshToken ? encrypt(this.refreshToken) : null,
      etsyShopId: this.shopId,
      etsyShopName: this.shopName
    };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
  },

  save(accessToken, refreshToken, shopId, shopName) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || null;
    this.shopId = shopId;
    this.shopName = shopName;
    this.persist();
  },

  clear() {
    this.accessToken = null;
    this.refreshToken = null;
    this.shopId = null;
    this.shopName = null;
    try { fs.unlinkSync(TOKENS_FILE); } catch {}
  },

  isConnected() {
    return !!(this.accessToken && this.shopId);
  }
};

tokenStore._load();
