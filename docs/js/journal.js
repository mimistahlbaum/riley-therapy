// Check-in journal stored locally in the browser (localStorage).
// No data ever leaves the device.

const KEY = 'riley.journal.v1';
const LIMIT = 200;

export class Journal {
  constructor() {
    this.entries = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.entries.slice(-LIMIT)));
    } catch {
      // Storage may be unavailable (private mode); the app still works.
    }
  }

  add(entry) {
    this.entries.push({ ts: Date.now(), ...entry });
    this.save();
  }

  // Update the most recent entry, e.g. with the after-activity feeling.
  amendLast(patch) {
    if (!this.entries.length) return;
    Object.assign(this.entries[this.entries.length - 1], patch);
    this.save();
  }

  recent(n = 30) {
    return this.entries.slice(-n).reverse();
  }

  clear() {
    this.entries = [];
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Ignore storage errors.
    }
  }
}
