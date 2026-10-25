import { MDXProvider } from '@mdx-js/react';
import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { findLesson, loadLesson, neighbours } from '@/entities/course';
import { useProgressStore } from '@/entities/progress';
import { mdxComponents } from './mdxComponents';

type LoadState = { status: 'loading' } | { status: 'ready'; Content: ComponentType } | { status: 'missing' } | { status: 'error'; message: string };

/** Урок целиком: шапка с целями, MDX-контент, отметка о прохождении и навигация. */
export function LessonView({ lessonId }: { lessonId: string }) {
  const found = findLesson(lessonId);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const done = useProgressStore((s) => s.completedLessons.includes(lessonId));
  const completeLesson = useProgressStore((s) => s.completeLesson);
  const uncompleteLesson = useProgressStore((s) => s.uncompleteLesson);

  useEffect(() => {
    let alive = true; // поздний ответ после смены урока не должен перезаписать новый
    setState({ status: 'loading' });
    loadLesson(lessonId)
      .then((Content) => alive && setState(Content ? { status: 'ready', Content } : { status: 'missing' }))
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    window.scrollTo(0, 0);
    return () => {
      alive = false;
    };
  }, [lessonId]);

  if (!found) return null;
  const { lesson, module, index } = found;
  const { prev, next } = neighbours(lessonId);

  return (
    <article className="lesson">
      <header className="lesson__head">
        <p className="lesson__crumbs">
          {module.title} · урок {index + 1} · ~{lesson.minutes} мин
        </p>
        <h1>{lesson.title}</h1>
        <ul className="lesson__goals" aria-label="После урока вы сможете">
          {lesson.goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </header>

      <div className="prose">
        {state.status === 'loading' && <p className="muted">Загрузка урока…</p>}
        {state.status === 'missing' && <p className="muted">Урок ещё пишется.</p>}
        {state.status === 'error' && (
          <p className="callout callout--danger" role="alert">
            Не удалось загрузить урок: {state.message}
          </p>
        )}
        {state.status === 'ready' && (
          <MDXProvider components={mdxComponents}>
            <state.Content />
          </MDXProvider>
        )}
      </div>

      <footer className="lesson__foot">
        <button
          type="button"
          className={`btn ${done ? '' : 'btn--primary'}`}
          onClick={() => (done ? uncompleteLesson(lessonId) : completeLesson(lessonId))}
        >
          {done ? '✓ Урок пройден (отменить)' : 'Отметить урок пройденным'}
        </button>
        <nav className="lesson__nav" aria-label="Соседние уроки">
          {prev ? (
            <Link className="btn btn--ghost" to={`/lesson/${prev.id}`}>
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link className="btn" to={`/lesson/${next.id}`} onClick={() => completeLesson(lessonId)}>
              {next.title} →
            </Link>
          )}
        </nav>
      </footer>
    </article>
  );
}
