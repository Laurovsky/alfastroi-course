export interface LessonMeta {
  /** Совпадает с именем файла src/content/lessons/<id>.mdx */
  id: string;
  title: string;
  minutes: number;
  /** Что ученик будет уметь после урока — показывается в шапке. */
  goals: string[];
}

export interface CourseModule {
  id: string;
  title: string;
  summary: string;
  lessons: LessonMeta[];
}

/**
 * Учебный план: от простого к сложному. Каждый модуль опирается на предыдущие.
 * Порядок здесь — единственный источник порядка в сайдбаре и навигации «дальше/назад».
 */
export const curriculum: CourseModule[] = [
  {
    id: 'm0',
    title: 'Старт: что мы строим',
    summary: 'Домен строительного документооборота, роли и карта репозитория.',
    lessons: [
      {
        id: 'domain',
        title: 'Что делает Альфастрой',
        minutes: 10,
        goals: ['Пересказать путь документа от справочника до КС-2', 'Назвать пять ролей и их права'],
      },
      {
        id: 'repo-map',
        title: 'Карта репозитория',
        minutes: 12,
        goals: ['Ориентироваться в монорепо: client, server, packages/types, sql', 'Понять, зачем нужен общий пакет типов'],
      },
      {
        id: 'how-to-learn',
        title: 'Как проходить курс и запускать проект',
        minutes: 6,
        goals: ['Запустить клиент, сервер и тесты локально', 'Пользоваться упражнениями курса'],
      },
    ],
  },
  {
    id: 'm1',
    title: 'Фундамент: TypeScript и чистые функции',
    summary: 'Самый простой и самый важный код проекта — функции без побочных эффектов.',
    lessons: [
      {
        id: 'pure-functions',
        title: 'Чистые функции: formatDisplayName',
        minutes: 15,
        goals: ['Отличать чистую функцию от функции с эффектами', 'Написать formatDisplayName по тестам'],
      },
      {
        id: 'tree',
        title: 'Дерево работ: parent_id, sort_order и «6.10 < 6.2»',
        minutes: 20,
        goals: ['Объяснить, почему код работы нельзя использовать как структуру', 'Построить дерево из плоского списка'],
      },
      {
        id: 'union-types',
        title: 'Типы-объединения и классификация строк ТКП',
        minutes: 15,
        goals: ['Использовать union и discriminated union', 'Реализовать deriveRowType'],
      },
    ],
  },
  {
    id: 'm2',
    title: 'TDD: сначала тест',
    summary: 'Red → Green → Refactor на реальных функциях проекта.',
    lessons: [
      {
        id: 'tdd-basics',
        title: 'Цикл Red → Green → Refactor',
        minutes: 15,
        goals: ['Пройти полный цикл TDD', 'Понять пирамиду тестов проекта: unit, db, e2e'],
      },
      {
        id: 'tdd-kata',
        title: 'Ката: калькулятор в ячейке таблицы',
        minutes: 30,
        goals: ['Вырастить парсер выражений тест за тестом', 'Отказываться от небезопасного eval'],
      },
      {
        id: 'regression-tests',
        title: 'Тест на баг и multiset-матчинг ТКП',
        minutes: 25,
        goals: ['Закрепить баг тестом до исправления', 'Сопоставлять дубли с «потреблением»'],
      },
    ],
  },
  {
    id: 'm3',
    title: 'Backend: Express по слоям',
    summary: 'Как запрос проходит через middleware, валидацию, сервис и базу.',
    lessons: [
      {
        id: 'request-journey',
        title: 'Путь одного запроса: переименование анализа',
        minutes: 25,
        goals: ['Проследить запрос от роутера до SQL', 'Назвать ответственность каждого слоя'],
      },
      {
        id: 'auth-roles',
        title: 'Аутентификация, роли и defense in depth',
        minutes: 15,
        goals: ['Объяснить authMiddleware и requireRole', 'Перечислить три рубежа защиты'],
      },
      {
        id: 'idempotency',
        title: 'Идемпотентность: защита от двойного POST',
        minutes: 25,
        goals: ['Понять Idempotency-Key и состояния резервации', 'Реализовать хранилище ключей'],
      },
      {
        id: 'fail-fast',
        title: 'Fail-fast сеть: таймауты и безопасные ретраи',
        minutes: 20,
        goals: ['Написать withTimeout', 'Решать, какой запрос можно повторить'],
      },
    ],
  },
  {
    id: 'm4',
    title: 'База данных как источник правды',
    summary: 'Оптимистичные блокировки, транзакции через RPC, аудит и права в Postgres.',
    lessons: [
      {
        id: 'optimistic-locking',
        title: 'Optimistic locking через version',
        minutes: 20,
        goals: ['Воспроизвести гонку двух пользователей', 'Реализовать conditionalUpdate'],
      },
      {
        id: 'rpc-audit',
        title: 'Транзакции через RPC и audit log',
        minutes: 20,
        goals: ['Читать PL/pgSQL-функцию проекта', 'Понять правило audit-first'],
      },
      {
        id: 'db-security',
        title: 'RLS, REVOKE и инциденты',
        minutes: 15,
        goals: ['Объяснить, почему REVOKE FROM PUBLIC мало', 'Учиться на постмортемах'],
      },
    ],
  },
  {
    id: 'm5',
    title: 'ООП там, где оно уместно',
    summary: 'Абстрактный парсер и машина состояний согласования.',
    lessons: [
      {
        id: 'abstract-parser',
        title: 'TKPParser и принцип Open/Closed',
        minutes: 20,
        goals: ['Отличать абстрактный класс от интерфейса', 'Реализовать findCommonPrefix'],
      },
      {
        id: 'state-machine',
        title: 'ApprovalWorkflow: машина состояний',
        minutes: 25,
        goals: ['Описать статусы и переходы анализа', 'Понять, почему backend — единственный authority'],
      },
    ],
  },
  {
    id: 'm6',
    title: 'Frontend: React и состояние',
    summary: 'Где живут серверные данные, где — UI-state, и как клиент говорит с API.',
    lessons: [
      {
        id: 'state-zustand',
        title: 'Zustand, SWR и стабильные селекторы',
        minutes: 20,
        goals: ['Разделять server state и UI state', 'Не создавать новые ссылки в селекторах'],
      },
      {
        id: 'api-client',
        title: 'apiFetch: клиент, который не зависает',
        minutes: 15,
        goals: ['Разобрать таймаут, refresh токена и авто-ключ идемпотентности'],
      },
    ],
  },
  {
    id: 'm7',
    title: 'Feature-Sliced Design',
    summary: 'Архитектура клиента: слои, слайсы, сегменты и правила импорта.',
    lessons: [
      {
        id: 'fsd-layers',
        title: 'Слои, слайсы и сегменты',
        minutes: 20,
        goals: ['Назвать шесть слоёв и их ответственность', 'Разложить фичу по слоям'],
      },
      {
        id: 'fsd-rules',
        title: 'Правила импорта, public API и @x',
        minutes: 25,
        goals: ['Проверять импорт на нарушения', 'Реализовать линтер границ'],
      },
      {
        id: 'fsd-reference',
        title: 'Разбор эталона: widgets/analysis-editor',
        minutes: 15,
        goals: ['Читать композиционный виджет', 'Мигрировать legacy постепенно'],
      },
    ],
  },
  {
    id: 'm8',
    title: 'Доставка и финальный проект',
    summary: 'CI, миграции, деплой, мониторинг — и своя фича от схемы до UI.',
    lessons: [
      {
        id: 'ci-deploy',
        title: 'CI, миграции и деплой',
        minutes: 15,
        goals: ['Понять, что проверяет CI', 'Знать путь коммита до production'],
      },
      {
        id: 'capstone',
        title: 'Финальный проект: фича end-to-end',
        minutes: 60,
        goals: ['Спроектировать фичу через все слои', 'Пройти чек-лист правил проекта'],
      },
    ],
  },
];

export const allLessons: LessonMeta[] = curriculum.flatMap((m) => m.lessons);

export function findLesson(id: string): { lesson: LessonMeta; module: CourseModule; index: number } | null {
  for (const module of curriculum) {
    const lesson = module.lessons.find((l) => l.id === id);
    if (lesson) return { lesson, module, index: allLessons.indexOf(lesson) };
  }
  return null;
}

export function neighbours(id: string): { prev: LessonMeta | null; next: LessonMeta | null } {
  const i = allLessons.findIndex((l) => l.id === id);
  if (i === -1) return { prev: null, next: null };
  return { prev: allLessons[i - 1] ?? null, next: allLessons[i + 1] ?? null };
}
