import { Highlight, themes } from 'prism-react-renderer';
import Editor from 'react-simple-code-editor';
import { useColorScheme } from '@/shared/lib/color-scheme';
import { Prism } from './prism';

/** Лёгкий редактор кода с подсветкой (textarea под капотом: работает и на телефоне). */
export function CodeEditor({
  value,
  onChange,
  lang = 'javascript',
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  lang?: string;
  label: string;
}) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? themes.vsDark : themes.github;
  return (
    <div className="editor" style={{ background: theme.plain.backgroundColor, color: theme.plain.color }}>
      <Editor
        value={value}
        onValueChange={onChange}
        tabSize={2}
        insertSpaces
        padding={14}
        aria-label={label}
        className="editor__inner"
        highlight={(code) => (
          <Highlight prism={Prism} code={code} language={lang} theme={theme}>
            {({ tokens, getLineProps, getTokenProps }) => (
              <>
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </>
            )}
          </Highlight>
        )}
      />
    </div>
  );
}
