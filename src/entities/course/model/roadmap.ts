/** Статья Доки для самостоятельного чтения (ссылка, не цитата). */
export interface Reading {
  path: string;
  title: string;
}

export type Level = 'Старт' | 'Основы' | 'Junior' | 'Junior+' | 'Middle' | 'Дальше';

export interface RoadmapStage {
  id: string;
  level: Level;
  title: string;
  /** Зачем эта ступень и почему она стоит именно здесь. */
  why: string;
  /** Что ученик умеет после ступени. */
  skills: string[];
  /** id уроков курса по порядку. */
  lessons: string[];
  /** Статьи Доки, которые стоит прочитать на этой ступени. */
  reading: Reading[];
  /** Задачи вне курса — для последней ступени. */
  tasks: string[];
  /** Практическая проверка: если вы это можете — ступень пройдена. */
  checkpoint: string;
}

/**
 * Дорожная карта: от «что это за проект» до самостоятельных задач в нём.
 * Каждая ступень опирается на предыдущие. Уроки курса распределены по ступеням
 * в порядке учебного плана (это проверяет тест), а статьи Доки закрывают то,
 * что курс предполагает известным.
 */
export const roadmap: RoadmapStage[] = [
  {
    id: 'orientation',
    level: 'Старт',
    title: 'Ориентация: что за проект и как он устроен',
    why: 'Прежде чем читать код, нужно знать, какую задачу он решает и где что лежит. Иначе любой файл выглядит набором непонятных слов.',
    skills: [
      'Пересказать путь документа: справочник → расценки → анализ → выполнение → согласование → КС-2',
      'Найти в репозитории клиент, сервер, общие типы и миграции',
      'Запустить проект и тесты командами npm',
    ],
    lessons: ['domain', 'repo-map', 'how-to-learn'],
    reading: [
      { path: 'tools/web-app-works', title: 'Как работают веб-приложения' },
      { path: 'tools/cli', title: 'Интерфейс командной строки' },
      { path: 'tools/version-control', title: 'Системы управления версиями' },
      { path: 'tools/package-managers', title: 'Пакетные менеджеры' },
    ],
    tasks: [],
    checkpoint: 'Откройте репозиторий Альфастрой и за 5 минут найдите файл, в котором объявлен маршрут POST /api/analyses, и SQL-миграцию функции rename_analysis.',
  },
  {
    id: 'js-basics',
    level: 'Основы',
    title: 'Основы JavaScript',
    why: 'Курс разбирает настоящий код и предполагает, что переменные, функции, массивы и объекты вам уже знакомы. Если нет — начните здесь: без этого остальные ступени будут непонятны.',
    skills: [
      'Объявлять переменные и функции, в том числе стрелочные',
      'Работать с массивами и объектами: map, filter, деструктуризация',
      'Читать шаблонные строки и условия',
      'Понимать, что такое модуль, import и export',
    ],
    lessons: [],
    reading: [
      { path: 'js/var-let', title: 'Переменные const, let и var' },
      { path: 'js/typecasting', title: 'Преобразование типов' },
      { path: 'js/if-else', title: 'if...else' },
      { path: 'js/function', title: 'Функция' },
      { path: 'js/arrow-function', title: 'Стрелочные функции' },
      { path: 'js/arrays', title: 'Массив' },
      { path: 'js/array-map', title: '.map()' },
      { path: 'js/array-filter', title: '.filter()' },
      { path: 'js/object', title: 'Объект' },
      { path: 'js/destructuring-assignment', title: 'Деструктуризация' },
      { path: 'js/template-strings', title: 'Шаблонные строки' },
      { path: 'js/modules', title: 'Модули, import/export' },
    ],
    tasks: [],
    checkpoint: 'Напишите функцию, которая принимает массив работ { code, name, qty } и возвращает только работы с qty > 0, отсортированные по имени, — не изменяя исходный массив.',
  },
  {
    id: 'pure-data',
    level: 'Основы',
    title: 'Чистые функции и данные',
    why: 'Самый простой и самый важный код проекта — функции без побочных эффектов. Их легко понять, легко проверить, и на них держится вся бизнес-логика.',
    skills: [
      'Отличать чистую функцию от функции с эффектами',
      'Строить дерево из плоского списка через Map и рекурсию',
      'Описывать данные типами-объединениями TypeScript',
    ],
    lessons: ['pure-functions', 'tree', 'union-types'],
    reading: [
      { path: 'tools/fp', title: 'Функциональное программирование' },
      { path: 'js/map', title: 'Map' },
      { path: 'js/set', title: 'Set' },
      { path: 'js/recursion', title: 'Рекурсия' },
      { path: 'tools/static-types', title: 'TypeScript и статическая типизация' },
    ],
    tasks: [],
    checkpoint: 'Не подглядывая, напишите compareCodes, при которой «6.10» идёт после «6.2», и объясните, почему code нельзя использовать как структуру дерева.',
  },
  {
    id: 'tdd',
    level: 'Основы',
    title: 'Тесты и TDD',
    why: 'Как только вы умеете писать чистые функции, их нужно уметь проверять. TDD — привычка, которая окупается на каждой следующей ступени.',
    skills: [
      'Проходить цикл Red → Green → Refactor маленькими шагами',
      'Писать тест в форме Подготовка → Выполнение → Проверка',
      'Закреплять найденный баг регрессионным тестом',
    ],
    lessons: ['tdd-basics', 'tdd-kata', 'regression-tests'],
    reading: [
      { path: 'tools/how-to-test-and-why', title: 'Как и зачем писать тесты' },
      { path: 'tools/tdd', title: 'Разработка через тестирование (TDD)' },
      { path: 'tools/testing-with-jest', title: 'Пишем первые тесты' },
    ],
    tasks: [],
    checkpoint: 'Пройдите ката parseNumericExpression с нуля, запуская тесты после каждого шага, и ни разу не пишите код без красного теста.',
  },
  {
    id: 'server',
    level: 'Junior',
    title: 'Сервер: HTTP, слои, асинхронность',
    why: 'Теперь вы готовы увидеть, как чистые функции встраиваются в настоящий сервер: запрос, проверка прав, валидация, сервис. Здесь же появляется асинхронность — без неё сети не бывает.',
    skills: [
      'Проследить запрос от роутера до SQL и назвать ответственность каждого слоя',
      'Объяснить разницу 401 и 403 и устройство middleware',
      'Защищать POST от повторов ключом идемпотентности',
      'Ставить таймауты и решать, какой запрос можно повторить',
    ],
    lessons: ['request-journey', 'auth-roles', 'idempotency', 'fail-fast'],
    reading: [
      { path: 'tools/http-protocol', title: 'Протокол HTTP' },
      { path: 'tools/api', title: 'Что такое API' },
      { path: 'js/async-in-js', title: 'Асинхронность в JavaScript' },
      { path: 'js/promise', title: 'Promise' },
      { path: 'js/async-await', title: 'async/await' },
      { path: 'js/closures', title: 'Области видимости и замыкания' },
    ],
    tasks: [],
    checkpoint: 'Нарисуйте на бумаге путь PATCH /api/analyses/:id/name через все слои и для каждого из ответов 400, 401, 403, 409 укажите, какой слой его вернул.',
  },
  {
    id: 'database',
    level: 'Junior',
    title: 'База данных как источник правды',
    why: 'Сервер передаёт данные базе, и здесь цена ошибки выше всего: потерянная правка, половина операции, утечка данных. Эта ступень про то, как база защищает себя сама.',
    skills: [
      'Защищать запись от гонок через version',
      'Читать PL/pgSQL-функцию: права, блокировка, UPDATE, аудит в одной транзакции',
      'Закрывать функции от браузера: REVOKE для трёх ролей',
    ],
    lessons: ['optimistic-locking', 'rpc-audit', 'db-security'],
    reading: [
      { path: 'js/errors', title: 'Error и стандартные ошибки' },
      { path: 'tools/json', title: 'JSON' },
      { path: 'tools/web-security', title: 'Безопасность веб-приложений' },
    ],
    tasks: [],
    checkpoint: 'Объясните, почему «сначала SELECT версии, потом UPDATE» — гонка, а «UPDATE … WHERE version = ?» — нет, и что увидит второй пользователь.',
  },
  {
    id: 'design',
    level: 'Junior+',
    title: 'Проектирование: ООП и машина состояний',
    why: 'Когда вы знаете все слои, можно говорить о проектировании: где нужен класс, как расширять систему без правки старого кода и где держать правила переходов статусов.',
    skills: [
      'Объяснить абстрактный класс, полиморфизм и принцип Open/Closed',
      'Узнавать паттерны «Стратегия» и «Цепочка ответственности» в коде',
      'Описывать статусы и переходы как машину состояний',
    ],
    lessons: ['abstract-parser', 'state-machine'],
    reading: [
      { path: 'tools/programming-paradigms', title: 'Парадигмы программирования' },
      { path: 'tools/oop', title: 'Объектно-ориентированное программирование' },
      { path: 'tools/design-patterns-behaviorial', title: 'Поведенческие паттерны проектирования' },
    ],
    tasks: [],
    checkpoint: 'Предложите, как добавить в Альфастрой парсер смет в CSV, не меняя ни одной строки в существующих парсерах.',
  },
  {
    id: 'client',
    level: 'Junior+',
    title: 'Клиент: состояние и сеть',
    why: 'Переходим в браузер. Главная сложность фронтенда — не вёрстка, а данные: откуда они берутся, где хранятся, когда устаревают и что делать, если сеть подвела.',
    skills: [
      'Разделять server state и UI state',
      'Писать Zustand-стор с загрузкой, ошибкой и стабильными селекторами',
      'Объяснить, что делает apiFetch: таймаут, токен, ретраи, классы ошибок',
    ],
    lessons: ['state-zustand', 'api-client'],
    reading: [
      { path: 'tools/architecture-data-flow', title: 'Организация потоков данных' },
      { path: 'tools/reactivity', title: 'Реактивность в программировании' },
      { path: 'js/fetch', title: 'fetch()' },
      { path: 'tools/browsers-storages', title: 'Хранение данных в браузере' },
    ],
    tasks: [],
    checkpoint: 'Найдите в Альфастрой стор любой сущности и объясните, почему в нём есть loading и error, а данные об открытой модалке там хранить не нужно.',
  },
  {
    id: 'fsd',
    level: 'Middle',
    title: 'Архитектура клиента: Feature-Sliced Design',
    why: 'Когда понятно, что делает каждый кусок клиента, встаёт вопрос, как их разложить, чтобы 500 файлов не превратились в клубок. Это уже архитектура — ступень уровня Middle.',
    skills: [
      'Раскладывать код по слоям, слайсам и сегментам',
      'Проверять импорты: слои вниз, соседние слайсы изолированы, вход через index.ts',
      'Мигрировать legacy постепенно, не ломая поведение',
    ],
    lessons: ['fsd-layers', 'fsd-rules', 'fsd-reference'],
    reading: [
      { path: 'tools/architecture-and-design-patterns', title: 'Архитектура и паттерны проектирования' },
      { path: 'tools/clean-architecture', title: 'Трёхслойная архитектура' },
      { path: 'tools/static-analysis', title: 'Статический анализ кода' },
      { path: 'tools/technical-debt', title: 'Что такое технический долг' },
    ],
    tasks: [],
    checkpoint: 'Разложите по слоям FSD фичу «комментарий к позиции анализа»: какие файлы, в каких слайсах и сегментах, что экспортирует каждый index.ts.',
  },
  {
    id: 'delivery',
    level: 'Middle',
    title: 'Доставка и своя фича',
    why: 'Код ценен, только когда он у пользователя. Последняя ступень курса собирает всё вместе: CI, деплой, ревью — и вашу собственную фичу через все слои.',
    skills: [
      'Читать GitHub Actions workflow и понимать, что проверяет CI',
      'Знать путь коммита до production',
      'Спроектировать фичу end-to-end и пройти чек-лист правил проекта',
    ],
    lessons: ['ci-deploy', 'capstone'],
    reading: [
      { path: 'tools/ci-cd', title: 'Что такое CI/CD' },
      { path: 'tools/github-actions', title: 'GitHub Actions' },
      { path: 'tools/code-review', title: 'Что такое код-ревью' },
    ],
    tasks: [],
    checkpoint: 'Реализуйте финальный проект в отдельной ветке Альфастрой и откройте pull request с зелёным CI.',
  },
  {
    id: 'beyond',
    level: 'Дальше',
    title: 'Самостоятельно: задачи из бэклога Альфастрой',
    why: 'Курс закончен, но обучение — нет. Лучшая следующая ступень — настоящие задачи проекта. Они взяты из раздела «Backlog» в CLAUDE.md и замечаний, найденных при создании курса.',
    skills: [
      'Самостоятельно брать задачу, проектировать решение и доводить до production',
      'Работать с техническим долгом осознанно',
    ],
    lessons: [],
    reading: [
      { path: 'tools/pwa', title: 'Прогрессивные веб-приложения' },
      { path: 'tools/how-to-simplify-tests', title: 'Как упростить тестирование' },
    ],
    tasks: [
      'Включить "strict": true в client/tsconfig.app.json и исправить ошибки компилятора — начать с useRatesImport.ts',
      'Добавить PWA-манифест, чтобы прораб мог установить приложение на главный экран телефона',
      'Добавить выгрузку бакета attachments в ночной бэкап db-backup.yml — сейчас сканы служебных записок не бэкапятся',
      'Настроить внешний uptime-мониторинг /health с уведомлением о падении',
      'Реализовать M29Exporter — отчёт М-29 по материалам (Phase 10)',
      'Обновить CLAUDE.md: убрать упоминания client/src/store, отметить, что fsd-migration-edges.json пуст',
    ],
    checkpoint: 'Возьмите одну задачу из списка, обсудите план, сделайте её в ветке и доведите pull request до слияния.',
  },
];

export type StageState = 'done' | 'progress' | 'todo';

/** Прогресс ступени: пройденные уроки + прочитанные статьи. Задачи «Дальше» не считаются. */
export function stageStatus(
  stage: RoadmapStage,
  completedLessons: string[],
  readArticles: string[],
): { state: StageState; done: number; total: number } {
  const total = stage.lessons.length + stage.reading.length;
  const done =
    stage.lessons.filter((id) => completedLessons.includes(id)).length +
    stage.reading.filter((r) => readArticles.includes(r.path)).length;
  const state: StageState = total > 0 && done === total ? 'done' : done > 0 ? 'progress' : 'todo';
  return { state, done, total };
}
