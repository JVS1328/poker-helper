// Persistent storage wrapper. The Tampermonkey bootstrap exposes
// GM_setValue/GM_getValue/GM_deleteValue via window.__pokernowBridgeStorage;
// if that's missing (e.g. during local dev with `npm start`), we fall back
// to localStorage so the bundle still runs.

const NS = 'pokernow-bridge';

const host = () => (typeof window !== 'undefined' ? window.__pokernowBridgeStorage : null);

const fallbackGet = (key) => {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
};

const fallbackSet = (key, value) => {
  try {
    localStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
  } catch { /* quota / disabled */ }
};

const fallbackDelete = (key) => {
  try { localStorage.removeItem(`${NS}:${key}`); } catch { /* ignore */ }
};

export const storage = {
  get(key, defaultValue = null) {
    const h = host();
    if (h?.get) {
      const v = h.get(`${NS}:${key}`);
      return v === undefined || v === null ? defaultValue : v;
    }
    const v = fallbackGet(key);
    return v === null ? defaultValue : v;
  },

  set(key, value) {
    const h = host();
    if (h?.set) h.set(`${NS}:${key}`, value);
    else fallbackSet(key, value);
  },

  delete(key) {
    const h = host();
    if (h?.delete) h.delete(`${NS}:${key}`);
    else fallbackDelete(key);
  },

  // Subset of keys to clear on schema migrations (Phase 1: just the version key).
  version() {
    return this.get('version', null);
  },
  setVersion(v) {
    this.set('version', v);
  },
};
