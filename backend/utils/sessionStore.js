import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const sessionStore = {
  load() {
    try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch { return {}; }
  },

  save(sessions) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  },

  clean(maxAgeMs = 600000) {
    const sessions = this.load();
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(sessions)) {
      if (now - v.createdAt > maxAgeMs) {
        delete sessions[k];
        changed = true;
      }
    }
    if (changed) this.save(sessions);
    return sessions;
  }
};
