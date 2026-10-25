import type { ReactNode } from 'react';

export interface DiagramNode {
  title: string;
  note?: string;
  tone?: 'accent' | 'muted' | 'ok' | 'warn';
}

/**
 * Простая схема «блоки со стрелками»: горизонтальная цепочка или вертикальный стек слоёв.
 * Подходит для пайплайнов (route → service → rpc) и слоёв FSD.
 */
export function Diagram({
  nodes,
  direction = 'row',
  caption,
}: {
  nodes: DiagramNode[];
  direction?: 'row' | 'column';
  caption?: ReactNode;
}) {
  return (
    <figure className="diagram">
      <ol className={`diagram__list diagram__list--${direction}`}>
        {nodes.map((node, i) => (
          <li key={node.title + i} className={`diagram__node diagram__node--${node.tone ?? 'accent'}`}>
            <span className="diagram__title">{node.title}</span>
            {node.note && <span className="diagram__note">{node.note}</span>}
          </li>
        ))}
      </ol>
      {caption && <figcaption className="diagram__caption">{caption}</figcaption>}
    </figure>
  );
}
