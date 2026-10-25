import { Prism } from 'prism-react-renderer';

// prism-react-renderer не включает SQL и bash — добавляем компактные грамматики.
const languages = Prism.languages as Record<string, unknown>;

if (!languages.sql) {
  languages.sql = {
    comment: { pattern: /--.*|\/\*[\s\S]*?\*\//, greedy: true },
    string: { pattern: /'(?:''|[^'])*'/, greedy: true },
    variable: /\$\$|\bp_\w+|\bv_\w+/,
    keyword:
      /\b(?:SELECT|FROM|WHERE|AND|OR|NOT|NULL|IS|IN|EXISTS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|RETURNING|RETURNS|CREATE|OR|REPLACE|FUNCTION|LANGUAGE|SECURITY|DEFINER|DECLARE|BEGIN|END|IF|THEN|ELSE|ELSIF|RAISE|EXCEPTION|USING|ERRCODE|PERFORM|FOR|FOUND|WITH|AS|ON|REVOKE|GRANT|EXECUTE|TO|TABLE|ALTER|ADD|COLUMN|REFERENCES|PRIMARY|KEY|UNIQUE|CHECK|DEFAULT|INDEX|JOIN|LEFT|ORDER|BY|LIMIT|RETURN|CASE|WHEN|DISTINCT|PUBLIC|plpgsql)\b/i,
    function: /\b\w+(?=\()/,
    number: /\b\d+\b/,
    operator: /[-+*/=<>!|]+/,
    punctuation: /[(),;.]/,
  };
}

if (!languages.bash) {
  languages.bash = {
    comment: { pattern: /(^|\s)#.*/, lookbehind: true },
    string: { pattern: /"(?:\\.|[^"\\])*"|'[^']*'/, greedy: true },
    variable: /\$\w+|\$\{[^}]+\}/,
    function: /\b(?:npm|npx|node|git|cd|ls|cat|curl|psql|docker)\b/,
    operator: /&&|\|\||[|;>]/,
  };
}
if (!languages.sh) languages.sh = languages.bash;

export { Prism };
