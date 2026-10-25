import { NavLink } from 'react-router-dom';
import { allLessons, curriculum } from '@/entities/course';
import { useProgressStore } from '@/entities/progress';

/** Оглавление курса с отметками прогресса. */
export function CourseSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const completed = useProgressStore((s) => s.completedLessons);
  const done = new Set(completed);
  const percent = Math.round((allLessons.filter((l) => done.has(l.id)).length / allLessons.length) * 100);

  return (
    <nav className="sidebar" aria-label="Оглавление курса">
      <NavLink to="/" className="sidebar__brand" onClick={onNavigate}>
        Альфастрой<span>курс по коду</span>
      </NavLink>
      <div className="progress" aria-label={`Пройдено ${percent}%`}>
        <div className="progress__bar" style={{ width: `${percent}%` }} />
      </div>
      <p className="sidebar__percent">Пройдено {percent}%</p>
      {curriculum.map((module, mi) => (
        <section key={module.id} className="sidebar__module">
          <h2 className="sidebar__module-title">
            <span>{mi}</span> {module.title}
          </h2>
          <ul>
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <NavLink
                  to={`/lesson/${lesson.id}`}
                  onClick={onNavigate}
                  className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}${done.has(lesson.id) ? ' sidebar__link--done' : ''}`}
                >
                  <span className="sidebar__mark" aria-hidden>
                    {done.has(lesson.id) ? '✓' : '○'}
                  </span>
                  {lesson.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
