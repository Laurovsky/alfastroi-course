import type { MDXComponents } from 'mdx/types';
import type { ReactElement, ReactNode } from 'react';
import { Exercise } from '@/features/run-exercise';
import { Quiz } from '@/features/take-quiz';
import { FsdChecker } from '@/features/check-fsd-import';
import { WorkflowExplorer } from '@/features/explore-workflow';
import { VersionRace } from '@/features/simulate-version-race';
import { RequestTrace } from '@/features/trace-request';
import { Callout } from '@/shared/ui/callout';
import { Code, Source } from '@/shared/ui/code';
import { Diagram } from '@/shared/ui/diagram';

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

/**
 * Компоненты, доступные внутри любого .mdx-урока без импорта.
 * Виджет — место композиции: здесь features встречаются друг с другом,
 * поэтому сами features не импортируют соседей (правило FSD).
 */
export const mdxComponents: MDXComponents = {
  pre: ({ children }) => {
    const code = children as ReactElement<{ className?: string; children?: ReactNode }>;
    const lang = code?.props?.className?.replace('language-', '') ?? 'text';
    return <Code code={textOf(code?.props?.children).replace(/\n$/, '')} lang={lang} />;
  },
  table: (props) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
  Callout,
  Code,
  Source,
  Diagram,
  Quiz,
  Exercise,
  FsdChecker,
  WorkflowExplorer,
  VersionRace,
  RequestTrace,
};
