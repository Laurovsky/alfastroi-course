import type { ReactNode } from 'react';

export interface DokaQuoteProps {
  /** Путь статьи на doka.guide, например `tools/tdd`. */
  path: string;
  title: string;
  authors: string[];
  /** Раздел статьи, из которого взят фрагмент (для якоря и подписи). */
  section?: string;
  children: ReactNode;
}

const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ru';

/**
 * Цитата из Доки с обязательной атрибуцией: статья, авторы, лицензия CC BY-NC-SA 4.0.
 * Текст цитаты — дословный фрагмент статьи (допускаются сокращения, отмеченные «[…]»).
 */
export function DokaQuote({ path, title, authors, section, children }: DokaQuoteProps) {
  const href = `https://doka.guide/${path}/`;
  return (
    <figure className="doka">
      <figcaption className="doka__head">
        <span className="doka__badge">Из Доки</span>
        <a href={href} target="_blank" rel="noreferrer">
          {title}
        </a>
        {section && <span className="doka__section"> · {section}</span>}
      </figcaption>
      <blockquote className="doka__body" cite={href}>
        {children}
      </blockquote>
      <p className="doka__credit">
        {authors.length > 1 ? 'Авторы' : 'Автор'}: {authors.join(', ')} · текст{' '}
        <a href={LICENSE_URL} target="_blank" rel="noreferrer">
          CC BY-NC-SA 4.0
        </a>
      </p>
    </figure>
  );
}
