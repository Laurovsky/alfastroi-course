import { Highlight, themes } from 'prism-react-renderer';
import { useState } from 'react';
import { useColorScheme } from '@/shared/lib/color-scheme';
import { Prism } from './prism';

export interface CodeProps {
  code: string;
  lang?: string;
  /** Заголовок над кодом: обычно путь к файлу в репозитории Альфастрой. */
  title?: string;
  /** Номер первой строки (для фрагментов из середины файла). */
  startLine?: number;
  /** Номера строк (в нумерации файла), которые нужно подсветить. */
  highlight?: number[];
  showLineNumbers?: boolean;
}

export function Code({ code, lang = 'ts', title, startLine = 1, highlight = [], showLineNumbers }: CodeProps) {
  const scheme = useColorScheme();
  const [copied, setCopied] = useState(false);
  const numbered = showLineNumbers ?? Boolean(title);
  const marked = new Set(highlight);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard недоступен — молча игнорируем */
    }
  };

  return (
    <figure className="code">
      <figcaption className="code__bar">
        <span className="code__title">{title ?? lang}</span>
        <button type="button" className="code__copy" onClick={copy} aria-label="Скопировать код">
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </figcaption>
      <Highlight prism={Prism} code={code} language={lang} theme={scheme === 'dark' ? themes.vsDark : themes.github}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`code__pre ${className}`} style={style}>
            {tokens.map((line, i) => {
              const n = startLine + i;
              const props = getLineProps({ line });
              return (
                <div key={i} {...props} className={`${props.className} code__line${marked.has(n) ? ' code__line--hl' : ''}`}>
                  {numbered && <span className="code__ln">{n}</span>}
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </figure>
  );
}
