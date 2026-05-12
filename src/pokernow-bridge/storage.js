// Persistent storage wrapper. The Tampermonkey bootstrap exposes
// GM_setValue/GM_getValue/GM_deleteValue + subscribe (via GM_addValueChangeListener)
// via window.__pokernowBridgeStorage; if that's missing (e.g. during local dev
// with `npm start`), we fall back to localStorage + the storage event so the
// bundle still runs.

const NS = 'pokernow-bridge';
const STORAGE_EVENT_PREFIX = `${NS}:`;

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

  // Cross-tab change subscription. Caller gives a key (without namespace) and
  // a fn(key, oldValue, newValue, isRemote). Returns an unsubscribe fn.
  //
  // With Tampermonkey: uses GM_addValueChangeListener — fires across all tabs
  // even with different origins (since GM storage is per-script, not per-origin).
  // Fallback: window 'storage' event (same-origin only).
  subscribe(key, fn) {
    const fullKey = `${NS}:${key}`;
    const h = host();
    if (h?.subscribe) {
      return h.subscribe(fullKey, (k, oldV, newV, remote) => fn(key, oldV, newV, remote));
    }
    const handler = (e) => {
      if (e.key !== fullKey) return;
      let oldV = null, newV = null;
      try { oldV = e.oldValue ? JSON.parse(e.oldValue) : null; } catch { /* ignore */ }
      try { newV = e.newValue ? JSON.parse(e.newValue) : null; } catch { /* ignore */ }
      fn(key, oldV, newV, true);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },

  // Prefix-based subscription. Fires for any key under `prefix:*`. Useful for
  // watching all opponent-profile changes ("opponents:") at once.
  subscribePrefix(prefix, fn) {
    return this.subscribeAll((key, oldV, newV, remote) => {
      if (key.startsWith(`${prefix}:`)) fn(key, oldV, newV, remote);
    });
  },

  // Subscribe to ALL key changes. With Tampermonkey we have to register one
  // listener per known key; for simplicity we use a single storage-event style
  // listener (which works under Tampermonkey too because GM_setValue writes
  // also bubble to localStorage in most TM implementations) plus an opt-in
  // direct listener for keys the caller pre-registers via subscribe().
  subscribeAll(fn) {
    const handler = (e) => {
      if (!e.key || !e.key.startsWith(STORAGE_EVENT_PREFIX)) return;
      const key = e.key.slice(STORAGE_EVENT_PREFIX.length);
      let oldV = null, newV = null;
      try { oldV = e.oldValue ? JSON.parse(e.oldValue) : null; } catch { /* ignore */ }
      try { newV = e.newValue ? JSON.parse(e.newValue) : null; } catch { /* ignore */ }
      fn(key, oldV, newV, true);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },

  // Subset of keys to clear on schema migrations.
  version() {
    return this.get('version', null);
  },
  setVersion(v) {
    this.set('version', v);
  },
};
