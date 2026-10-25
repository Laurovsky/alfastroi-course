import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const sliceLayers = new Set(['widgets', 'features', 'entities']);
const strictLayers = new Set(['widgets', 'features', 'entities', 'shared']);
const isSource = (p) =>
  /\.[jt]sx?$/.test(p) && !p.endsWith('.d.ts') && !/\.(?:test|spec)\.[jt]sx?$/.test(p);
function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? collect(path.join(dir, e.name))
        : isSource(e.name)
          ? [path.join(dir, e.name)]
          : []
    );
}
function imports(sf) {
  const edges = [];
  const visit = (n) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      let typeOnly = Boolean(n.isTypeOnly || n.importClause?.isTypeOnly);
      if (
        ts.isImportDeclaration(n) &&
        n.importClause?.namedBindings &&
        ts.isNamedImports(n.importClause.namedBindings) &&
        !n.importClause.name
      ) {
        const es = n.importClause.namedBindings.elements;
        typeOnly = typeOnly || (es.length > 0 && es.every((e) => e.isTypeOnly));
      }
      if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
        const es = n.exportClause.elements;
        typeOnly = typeOnly || (es.length > 0 && es.every((e) => e.isTypeOnly));
      }
      edges.push({ spec: n.moduleSpecifier.text, typeOnly });
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    )
      edges.push({ spec: n.arguments[0].text, typeOnly: false });
    else if (
      ts.isImportTypeNode(n) &&
      ts.isLiteralTypeNode(n.argument) &&
      ts.isStringLiteral(n.argument.literal)
    )
      edges.push({ spec: n.argument.literal.text, typeOnly: true });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return edges;
}
export function scanFrontend(root, options = {}) {
  const src = path.join(root, 'src');
  const files = collect(src);
  const allowed = new Set(files);
  const defaults = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    baseUrl: root,
    paths: { '@/*': ['src/*'] }
  };
  const compiler = { ...defaults, ...options };
  const relative = (p) => path.relative(root, p).split(path.sep).join('/');
  const meta = (file) => {
    const parts = relative(file).split('/');
    const layer = parts[1];
    if (!layers.includes(layer)) return null;
    return { layer, slice: sliceLayers.has(layer) ? parts[2] : null };
  };
  const resolve = (spec, file) => {
    const result = ts.resolveModuleName(spec, file, compiler, ts.sys).resolvedModule
      ?.resolvedFileName;
    // TypeScript returns forward slashes on Windows; collect() uses native paths.
    const normalized = result ? path.normalize(result) : null;
    return normalized && allowed.has(normalized) ? normalized : null;
  };
  const violations = [],
    graph = new Map(),
    sourceFiles = new Map(),
    declared = new Map(),
    used = new Set();
  // Retired paths remain forbidden even if a page/app recreates a compatibility facade.
  const retiredFile = path.join(root, 'frontend-retired-paths.json');
  const normalizeRetired = (file) => file.replace(/\.[jt]sx?$/, '').replace(/\/index$/, '');
  const retired = new Set(
    (fs.existsSync(retiredFile) ? JSON.parse(fs.readFileSync(retiredFile, 'utf8')) : []).map(
      normalizeRetired
    )
  );
  const configFile = path.join(root, 'fsd-migration-edges.json');
  if (fs.existsSync(configFile)) {
    let entries;
    try {
      entries = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch {
      violations.push({ rule: 'invalid-migration-config' });
      entries = [];
    }
    if (!Array.isArray(entries)) {
      violations.push({ rule: 'invalid-migration-config' });
      entries = [];
    }
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry.source !== 'string' ||
        typeof entry.target !== 'string' ||
        typeof entry.reason !== 'string' ||
        !entry.reason.trim() ||
        !entry.source.startsWith('src/') ||
        !entry.target.startsWith('src/') ||
        /[*?]/.test(entry.source + entry.target)
      ) {
        violations.push({ rule: 'invalid-migration-edge', entry });
        continue;
      }
      const key = entry.source + '\0' + entry.target;
      if (declared.has(key)) violations.push({ rule: 'duplicate-migration-edge', entry });
      declared.set(key, entry);
    }
  }
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    sourceFiles.set(
      file,
      ts.createSourceFile(
        file,
        original,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      )
    );
    const emitted = ts.transpileModule(original, { compilerOptions: compiler }).outputText;
    const sf = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edges = [];
    for (const st of sf.statements)
      if (
        (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
        st.moduleSpecifier &&
        ts.isStringLiteral(st.moduleSpecifier)
      ) {
        const target = resolve(st.moduleSpecifier.text, file);
        if (target) edges.push(target);
      }
    graph.set(file, edges);
  }
  const bridgeTargets = (file, seen = new Set()) => {
    if (seen.has(file)) return [];
    seen.add(file);
    const sf = sourceFiles.get(file);
    if (
      !sf ||
      !sf.statements.length ||
      !sf.statements.every(
        (st) =>
          ts.isExportDeclaration(st) ||
          ts.isImportDeclaration(st) ||
          (ts.isExportAssignment(st) && ts.isIdentifier(st.expression))
      )
    )
      return [];
    return sf.statements.flatMap((st) => {
      if (!st.moduleSpecifier || !ts.isStringLiteral(st.moduleSpecifier)) return [];
      const target = resolve(st.moduleSpecifier.text, file);
      if (!target) return [];
      return meta(target) ? [target] : bridgeTargets(target, seen);
    });
  };
  const checkFsd = (file, target, typeOnly) => {
    const from = meta(file),
      to = meta(target);
    if (!to) return;
    const fileName = relative(file),
      targetName = relative(target);
    if (from && layers.indexOf(to.layer) < layers.indexOf(from.layer))
      violations.push({ rule: 'fsd-layer', file: fileName, target: targetName });
    const sameSlice = from?.layer === to.layer && from.slice === to.slice;
    const crossEntity =
      from?.layer === 'entities' &&
      to.layer === 'entities' &&
      typeOnly &&
      targetName.replace(/\.[jt]sx?$/, '') === `src/entities/${to.slice}/@x/${from.slice}`;
    if (from?.layer === to.layer && sliceLayers.has(from.layer) && !sameSlice && !crossEntity)
      violations.push({ rule: 'fsd-slice', file: fileName, target: targetName });
    if (
      sliceLayers.has(to.layer) &&
      !sameSlice &&
      !crossEntity &&
      targetName.replace(/\.[jt]sx?$/, '') !== `src/${to.layer}/${to.slice}/index`
    )
      violations.push({ rule: 'fsd-public-api', file: fileName, target: targetName });
  };
  for (const file of files)
    for (const edge of imports(sourceFiles.get(file))) {
      const candidate = edge.spec.startsWith('@/')
        ? 'src/' + edge.spec.slice(2)
        : edge.spec.startsWith('.')
          ? relative(path.resolve(path.dirname(file), edge.spec))
          : null;
      if (candidate && retired.has(normalizeRetired(candidate)))
        violations.push({
          rule: 'retired-compatibility-path',
          file: relative(file),
          target: candidate
        });
      const target = resolve(edge.spec, file);
      if (!target) continue;
      const from = meta(file),
        to = meta(target);
      const fileName = relative(file),
        targetName = relative(target),
        key = fileName + '\0' + targetName;
      if (declared.has(key)) used.add(key);
      if (
        fileName.startsWith('src/components/') &&
        targetName.startsWith('src/pages/') &&
        !edge.typeOnly
      )
        violations.push({ rule: 'component-page', file: fileName, target: targetName });
      checkFsd(file, target, edge.typeOnly);
      if (from && !to) {
        const admits = ['widgets', 'features'].includes(from.layer) && declared.has(key);
        if (strictLayers.has(from.layer) && !admits)
          violations.push({ rule: 'fsd-legacy', file: fileName, target: targetName });
        for (const final of bridgeTargets(target)) checkFsd(file, final, edge.typeOnly);
      }
    }
  for (const [key, entry] of declared)
    if (!used.has(key)) violations.push({ rule: 'unused-migration-edge', ...entry });
  // Strongly connected components avoid losing cycles when a legacy node was
  // visited before a migrated module in the same component.
  const indices = new Map(),
    low = new Map(),
    stack = [],
    active = new Set();
  let nextIndex = 0;
  const visit = (file) => {
    indices.set(file, nextIndex);
    low.set(file, nextIndex++);
    stack.push(file);
    active.add(file);
    for (const target of graph.get(file) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        low.set(file, Math.min(low.get(file), low.get(target)));
      } else if (active.has(target)) low.set(file, Math.min(low.get(file), indices.get(target)));
    }
    if (low.get(file) !== indices.get(file)) return;
    const component = new Set();
    let node;
    do {
      node = stack.pop();
      active.delete(node);
      component.add(node);
    } while (node !== file);
    if (component.size === 1 && !(graph.get(file) ?? []).includes(file)) return;
    const start =
      [...component].find((p) => meta(p)) ??
      [...component].find((p) => relative(p).startsWith('src/components/'));
    if (!start) return;
    const findPath = (node, seen) => {
      for (const target of graph.get(node) ?? []) {
        if (!component.has(target)) continue;
        if (target === start) return [node, start];
        if (!seen.has(target)) {
          const branch = findPath(target, new Set([...seen, target]));
          if (branch) return [node, ...branch];
        }
      }
      return null;
    };
    const cycle = findPath(start, new Set([start]));
    if (cycle) violations.push({ rule: 'runtime-cycle', cycle: cycle.map(relative) });
  };
  for (const file of files) if (!indices.has(file)) visit(file);
  return violations;
}
const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (direct) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const config = ts.readConfigFile(path.join(root, 'tsconfig.app.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const violations = scanFrontend(root, parsed.options);
  for (const v of violations) console.error(JSON.stringify(v));
  console.log(`Frontend import boundaries: ${violations.length} violations`);
  process.exitCode = violations.length ? 1 : 0;
}
