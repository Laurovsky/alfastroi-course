import { Link } from 'react-router-dom';
import { allLessons, roadmap, stageStatus, type StageState } from '@/entities/course';
import { useProgressStore } from '@/entities/progress';

const stateLabel: Record<StageState, string> = { done: 'Пройдено', progress: 'В процессе', todo: 'Впереди' };
const lessonTitle = new Map(allLessons.map((l) => [l.id, l.title]));
const lessonMinutes = new Map(allLessons.map((l) => [l.id, l.minutes]));

/**
 * Дорожная карта: ступени от ориентации в проекте до задач из бэклога.
 * Прогресс берётся из тех же отметок, что и в уроках, плюс прочитанные статьи Доки.
 * Открыта по умолчанию первая непройденная ступень — «вы здесь».
 */
export function Roadmap() {
  const completed = useProgressStore((s) => s.completedLessons);
  const readArticles = useProgressStore((s) => s.readArticles);
  const toggleArticle = useProgressStore((s) => s.toggleArticle);

  const statuses = roadmap.map((stage) => stageStatus(stage, completed, readArticles));
  const current = statuses.findIndex((s) => s.state !== 'done');
  const totalDone = statuses.reduce((sum, s) => sum + s.done, 0);
  const total = statuses.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="roadmap-page">
      <header className="roadmap-page__head">
        <h1>Дорожная карта</h1>
        <p>
          Путь от «что это за проект» до самостоятельных задач в нём. Каждая ступень опирается на предыдущие: уроки курса,
          статьи Доки, которые стоит прочитать рядом, и практическая проверка — если вы с ней справляетесь, можно идти дальше.
        </p>
        <div className="progress progress--wide" aria-label={`Пройдено ${totalDone} из ${total}`}>
          <div className="progress__bar" style={{ width: `${total ? Math.round((totalDone / total) * 100) : 0}%` }} />
        </div>
        <p className="muted">
          Пройдено {totalDone} из {total}: уроки отмечаются в конце урока, статьи — галочкой здесь.
        </p>
      </header>

      <nav className="stage-strip" aria-label="Ступени">
        {roadmap.map((stage, i) => (
          <a
            key={stage.id}
            href={`#/roadmap`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(`stage-${stage.id}`);
              if (el instanceof HTMLDetailsElement) el.open = true;
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className={`stage-strip__item stage-strip__item--${statuses[i].state}${i === current ? ' stage-strip__item--current' : ''}`}
            title={stage.title}
          >
            <span className="stage-strip__num">{statuses[i].state === 'done' ? '✓' : i + 1}</span>
            <span className="stage-strip__level">{stage.level}</span>
          </a>
        ))}
      </nav>

      <ol className="stages">
        {roadmap.map((stage, i) => {
          const status = statuses[i];
          const minutes = stage.lessons.reduce((sum, id) => sum + (lessonMinutes.get(id) ?? 0), 0);
          return (
            <li key={stage.id} className={`stage stage--${status.state}${i === current ? ' stage--current' : ''}`}>
              <span className="stage__dot" aria-hidden>
                {status.state === 'done' ? '✓' : i + 1}
              </span>
              <details id={`stage-${stage.id}`} className="stage__card" open={i === current}>
                <summary className="stage__summary">
                  <span className="stage__meta">
                    <span className="chip-level">{stage.level}</span>
                    {i === current && <span className="chip-here">Вы здесь</span>}
                    <span className="muted">
                      {stateLabel[status.state]}
                      {status.total > 0 && ` · ${status.done}/${status.total}`}
                      {minutes > 0 && ` · уроки ~${minutes} мин`}
                    </span>
                  </span>
                  <span className="stage__title">{stage.title}</span>
                </summary>

                <p className="stage__why">{stage.why}</p>

                <h3>Что вы будете уметь</h3>
                <ul className="stage__skills">
                  {stage.skills.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>

                {stage.lessons.length > 0 && (
                  <>
                    <h3>Уроки курса</h3>
                    <ol className="stage__lessons">
                      {stage.lessons.map((id) => (
                        <li key={id} className={completed.includes(id) ? 'is-done' : undefined}>
                          <Link to={`/lesson/${id}`}>{lessonTitle.get(id)}</Link>
                          {completed.includes(id) && <span className="ok"> ✓</span>}
                        </li>
                      ))}
                    </ol>
                  </>
                )}

                {stage.reading.length > 0 && (
                  <>
                    <h3>Почитать в Доке</h3>
                    <ul className="stage__reading">
                      {stage.reading.map((r) => (
                        <li key={r.path}>
                          <label className="check">
                            <input type="checkbox" checked={readArticles.includes(r.path)} onChange={() => toggleArticle(r.path)} />
                            <span className="visually-hidden">Прочитано: </span>
                          </label>
                          <a href={`https://doka.guide/${r.path}/`} target="_blank" rel="noreferrer">
                            {r.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {stage.tasks.length > 0 && (
                  <>
                    <h3>Задачи</h3>
                    <ol className="stage__tasks">
                      {stage.tasks.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                  </>
                )}

                <div className="stage__checkpoint">
                  <strong>Контрольная точка</strong>
                  <p>{stage.checkpoint}</p>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
