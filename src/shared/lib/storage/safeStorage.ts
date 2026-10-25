import type { StateStorage } from 'zustand/middleware';

/**
 * localStorage, который не падает: в приватном режиме, при заблокированных
 * cookies или переполнении доступ бросает исключение — тогда прогресс живёт
 * только в памяти вкладки, а интерфейс продолжает работать.
 */
const memory = new Map<string, string>();

export const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* остаёмся на памяти */
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
