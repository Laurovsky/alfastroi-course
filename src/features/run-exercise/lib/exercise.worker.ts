/// <reference lib="webworker" />
import { getExercise } from '@/entities/exercise';
import { runSuite } from '@/shared/lib/mini-test';

export interface RunRequest {
  exerciseId: string;
  code: string;
}

// Код ученика исполняется в отдельном потоке: бесконечный цикл не повесит вкладку,
// а основной поток просто завершит worker по таймауту.
self.onmessage = async (event: MessageEvent<RunRequest>) => {
  const exercise = getExercise(event.data.exerciseId);
  if (!exercise) {
    self.postMessage({ compileError: `Упражнение ${event.data.exerciseId} не найдено`, diagnostics: [], results: [], passed: false });
    return;
  }
  const result = await runSuite(event.data.code, exercise.exports, exercise.tests);
  self.postMessage(result);
};
