import type { SuiteResult } from '@/shared/lib/mini-test';

const HARD_TIMEOUT_MS = 6000;

/**
 * Запускает тесты упражнения в одноразовом Web Worker.
 * Каждый запуск — новый worker: глобальные переменные прошлой попытки не протекают.
 * Через HARD_TIMEOUT_MS worker убивается (бесконечный цикл, while(true)).
 */
export function runInWorker(exerciseId: string, code: string): Promise<SuiteResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./exercise.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({
        diagnostics: [],
        compileError: `Код выполнялся дольше ${HARD_TIMEOUT_MS / 1000} с и был остановлен. Возможно, бесконечный цикл?`,
        results: [],
        passed: false,
      });
    }, HARD_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<SuiteResult>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ compileError: event.message || 'Ошибка выполнения', diagnostics: [], results: [], passed: false });
    };
    worker.postMessage({ exerciseId, code });
  });
}
