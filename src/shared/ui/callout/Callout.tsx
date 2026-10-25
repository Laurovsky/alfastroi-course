import type { ReactNode } from 'react';

type Kind = 'info' | 'tip' | 'warning' | 'danger' | 'rule' | 'key';

const labels: Record<Kind, string> = {
  key: 'Главное',
  info: 'Заметка',
  tip: 'Подсказка',
  warning: 'Осторожно',
  danger: 'Грабли',
  rule: 'Правило проекта',
};

/** Выделенный блок в тексте урока. `rule` — ссылка на правило из CLAUDE.md (§N). */
export function Callout({ kind = 'info', title, children }: { kind?: Kind; title?: string; children: ReactNode }) {
  return (
    <aside className={`callout callout--${kind}`}>
      <strong className="callout__title">{title ?? labels[kind]}</strong>
      <div className="callout__body">{children}</div>
    </aside>
  );
}
