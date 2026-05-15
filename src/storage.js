// localStorage wrapper that mimics Claude's window.storage API.
// All data stays on the device (per browser/iPad).

const PREFIX = 'cahier:';

const storage = {
  async get(key) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      if (v === null) return null;
      return { key, value: v, shared: false };
    } catch (e) {
      console.error('storage.get error', e);
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    } catch (e) {
      console.error('storage.set error', e);
      return null;
    }
  },

  async delete(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true, shared: false };
    } catch (e) {
      console.error('storage.delete error', e);
      return null;
    }
  },

  async list(prefix) {
    try {
      const keys = [];
      const fullPrefix = PREFIX + (prefix || '');
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          keys.push(k.substring(PREFIX.length));
        }
      }
      return { keys, prefix: prefix || '', shared: false };
    } catch (e) {
      console.error('storage.list error', e);
      return null;
    }
  },
};

if (typeof window !== 'undefined') {
  window.storage = storage;
}

export default storage;
