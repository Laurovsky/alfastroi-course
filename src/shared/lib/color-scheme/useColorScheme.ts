import { useSyncExternalStore } from 'react';

const query = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia(query).matches ? 'dark' : 'light';
}

/** Системная тема пользователя; обновляется при её смене. */
export function useColorScheme(): 'dark' | 'light' {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light');
}
