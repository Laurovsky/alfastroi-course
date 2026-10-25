import { Link } from 'react-router-dom';
import { allLessons, curriculum } from '@/entities/course';
import { listExercises } from '@/entities/exercise';
import { useProgressStore } from '@/entities/progress';

export function HomePage() {
  const completed = useProgressStore((s) => s.completedLessons);
  const passed = useProgressStore((s) => s.passedExercises);
  const reset = useProgressStore((s) => s.reset);
  const firstOpen = allLessons.find((l) => !completed.includes(l.id)) ?? allLessons[0];
  const minutes = allLessons.reduce((sum, l) => sum + l.minutes, 0);

  return (
    <div className="home">
      <section className="hero">
        <h1>Учимся программировать на реальном проекте</h1>
        <p>
          Разбираем код Альфастрой — системы строительного документооборота на React, Express и PostgreSQL — от чистой функции
          до архитектуры клиента. Каждая тема опирается на настоящие файлы проекта, а навыки закрепляются упражнениями, которые
          проверяются тестами прямо в браузере.
        </p>
        <div className="hero__stats">
          <span>
            <strong>{curriculum.length}</strong> модулей
          </span>
          <span>
            <strong>{allLessons.length}</strong> уроков
          </span>
          <span>
            <strong>{listExercises().length}</strong> упражнений с тестами
          </span>
          <span>
            <strong>~{Math.round(minutes / 60)}</strong> часов
          </span>
        </div>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" to={`/lesson/${firstOpen.id}`}>
            {completed.length ? 'Продолжить' : 'Начать'}: {firstOpen.title} →
          </Link>
          <Link className="btn btn--lg" to="/roadmap">
            🗺 Дорожная карта
          </Link>
        </div>
        {(completed.length > 0 || passed.length > 0) && (
          <p className="muted">
            Пройдено уроков: {completed.length}/{allLessons.length}, решено упражнений: {passed.length}/{listExercises().length}.{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => window.confirm('Сбросить весь прогресс и черновики?') && reset()}
            >
              Сбросить прогресс
            </button>
          </p>
        )}
      </section>

      <section className="roadmap" aria-label="Программа курса">
        {curriculum.map((module, i) => {
          const doneCount = module.lessons.filter((l) => completed.includes(l.id)).length;
          return (
            <article key={module.id} className="roadmap__card">
              <header>
                <span className="roadmap__num">{i}</span>
                <h2>{module.title}</h2>
                <span className="roadmap__count">
                  {doneCount}/{module.lessons.length}
                </span>
              </header>
              <p>{module.summary}</p>
              <ol>
                {module.lessons.map((l) => (
                  <li key={l.id}>
                    <Link to={`/lesson/${l.id}`}>{l.title}</Link>
                    {completed.includes(l.id) && <span className="ok"> ✓</span>}
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>
    </div>
  );
}
