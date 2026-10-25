import { useEffect, useRef } from 'react';

/**
 * Вызывает `refetch` когда вкладка возвращается в фокус — но не чаще
 * чем раз в `minIntervalMs` миллисекунд. Защищает от тихого устаревания
 * данных при долгой неактивности (JWT истёк, БД sleep, и т.д.).
 *
 * Слушает оба источника: window.focus и document.visibilitychange.
 * Это перекрывает разные сценарии:
 *   - Alt+Tab между приложениями → window.focus
 *   - Переключение вкладок в браузере → visibilitychange
 *   - Мобильный sleep/wake → visibilitychange
 *
 * minIntervalMs по умолчанию 10 секунд — короче чем кажется правильно
 * чтобы пользователь, переключивший вкладку и сразу вернувшийся, всё-таки
 * увидел refresh. Можно передать 0 чтобы выключить throttle.
 *
 * Cleanup снимает обе подписки; изменение callback не сбрасывает throttle.
 * Hook не ожидает Promise и не перехватывает ошибки callback: caller владеет
 * HTTP-дедупликацией, отменой, scope/dirty guards и обработкой ошибок.
 *
 * Использование:
 *   useRefetchOnFocus(() => loadRateSets())
 *   useRefetchOnFocus(loadAll, 30_000)  // если нужен более редкий refetch
 */
export function useRefetchOnFocus(refetch: () => void, minIntervalMs = 10_000): void {
  // Стабильная ссылка на актуальный refetch — без re-subscribe на каждый рендер
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    let lastRefetchAt = Date.now();

    function handler() {
      const sinceLast = Date.now() - lastRefetchAt;
      if (document.visibilityState !== 'visible') return;
      if (sinceLast < minIntervalMs) return;
      lastRefetchAt = Date.now();
      refetchRef.current();
    }

    document.addEventListener('visibilitychange', handler);
    window.addEventListener('focus', handler);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('focus', handler);
    };
  }, [minIntervalMs]);
}
