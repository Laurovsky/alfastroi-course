import type { TestCase } from '@/shared/lib/mini-test';

/**
 * Упражнение: ученик пишет JavaScript-код, тесты запускаются в браузере.
 * `solution` нужен не ученику, а тестам курса: они проверяют, что эталон
 * проходит все тесты, а заготовка — нет (иначе упражнение бессмысленно).
 */
export interface Exercise {
  id: string;
  title: string;
  /** Условие задачи (простой текст, абзацы через пустую строку). */
  task: string;
  /** Имена функций/классов, которые тесты достают из кода ученика. */
  exports: string[];
  starter: string;
  solution: string;
  hints: string[];
  tests: TestCase[];
}
