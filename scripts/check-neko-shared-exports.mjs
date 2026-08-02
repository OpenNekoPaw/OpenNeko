import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const DEFAULT_LEDGER_PATH = 'quality/ledgers/neko-shared-retired-module-ledger.json';
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'reports',
]);

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function moduleStem(source) {
  return source.replace(/^packages\/shared\/src\//u, '').replace(/\.(?:ts|tsx)$/u, '');
}

function directPublicEntry(source) {
  return `@neko/shared/${moduleStem(source)}`;
}

function relativeModuleTarget(importer, specifier) {
  return normalizePath(path.resolve(path.dirname(importer), specifier)).replace(
    /\.(?:js|jsx|mjs|mts|ts|tsx)$/u,
    '',
  );
}

async function collectSourceFiles(rootDir, relativeDirectory, output) {
  const directory = path.join(rootDir, relativeDirectory);
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(rootDir, relativePath, output);
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(normalizePath(relativePath));
    }
  }
}

function validateLedger(ledger) {
  const errors = [];
  if (ledger.schemaVersion !== 1 || ledger.package !== '@neko/shared') {
    errors.push('retired module ledger must use schemaVersion 1 for @neko/shared');
  }
  if (!Array.isArray(ledger.retiredRootExports) || ledger.retiredRootExports.length === 0) {
    errors.push('retired module ledger must contain retiredRootExports');
  } else {
    const uniqueRootExports = new Set(ledger.retiredRootExports);
    if (
      uniqueRootExports.size !== ledger.retiredRootExports.length ||
      ledger.retiredRootExports.some((name) => typeof name !== 'string' || name.length === 0)
    ) {
      errors.push('retiredRootExports must contain unique non-empty symbol names');
    }
  }
  if (!Array.isArray(ledger.modules) || ledger.modules.length === 0) {
    errors.push('retired module ledger must contain at least one module');
    return errors;
  }

  const sources = new Set();
  for (const row of ledger.modules) {
    if (typeof row.source !== 'string' || !row.source.startsWith('packages/shared/src/')) {
      errors.push(`invalid retired source: ${String(row.source)}`);
      continue;
    }
    if (sources.has(row.source)) {
      errors.push(`duplicate retired source: ${row.source}`);
    }
    sources.add(row.source);
    if (
      row.disposition !== 'remove' ||
      row.target !== null ||
      row.dataImpact !== 'none' ||
      typeof row.semanticOwner !== 'string' ||
      typeof row.reason !== 'string'
    ) {
      errors.push(`incomplete remove disposition: ${row.source}`);
    }
  }

  return errors;
}

function collectModuleReferences(source, fileName) {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const references = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names =
        node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
          ? node.importClause.namedBindings.elements.map(
              (element) => element.propertyName?.text ?? element.name.text,
            )
          : [];
      references.push({ specifier: node.moduleSpecifier.text, names });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const names =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map(
              (element) => element.propertyName?.text ?? element.name.text,
            )
          : [];
      references.push({ specifier: node.moduleSpecifier.text, names });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      references.push({ specifier: node.arguments[0].text, names: [] });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function collectCurrentSharedRootExports(rootDir, sourceFiles) {
  const sharedSourceFiles = sourceFiles
    .filter(
      (file) =>
        file.startsWith('packages/shared/src/') &&
        (file.endsWith('.ts') || file.endsWith('.tsx')),
    )
    .map((file) => path.join(rootDir, file));
  const rootEntry = path.join(rootDir, 'packages/shared/src/index.ts');
  if (!sharedSourceFiles.includes(rootEntry)) {
    return null;
  }

  const program = ts.createProgram(sharedSourceFiles, {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  });
  const checker = program.getTypeChecker();
  const rootSource = program.getSourceFile(rootEntry);
  const rootSymbol = rootSource ? checker.getSymbolAtLocation(rootSource) : undefined;
  return rootSymbol
    ? new Set(checker.getExportsOfModule(rootSymbol).map((symbol) => symbol.getName()))
    : null;
}

export async function checkRetiredSharedModules({
  rootDir = process.cwd(),
  ledgerPath = DEFAULT_LEDGER_PATH,
} = {}) {
  const absoluteLedgerPath = path.join(rootDir, ledgerPath);
  const ledger = JSON.parse(await readFile(absoluteLedgerPath, 'utf8'));
  const errors = validateLedger(ledger);
  if (errors.length > 0) {
    return errors;
  }

  const retiredByEntry = new Map();
  const retiredAbsoluteStems = new Map();
  for (const row of ledger.modules) {
    const entry = directPublicEntry(row.source);
    retiredByEntry.set(entry, row.source);
    retiredAbsoluteStems.set(
      normalizePath(path.join(rootDir, row.source)).replace(/\.(?:ts|tsx)$/u, ''),
      row.source,
    );
    if (existsSync(path.join(rootDir, row.source))) {
      errors.push(`retired Shared source still exists: ${row.source}`);
    }
  }

  const sourceFiles = [];
  await Promise.all(
    ['apps', 'packages', 'scripts'].map((directory) =>
      collectSourceFiles(rootDir, directory, sourceFiles),
    ),
  );

  const retiredRootExports = new Set(ledger.retiredRootExports);
  const currentRootExports = collectCurrentSharedRootExports(rootDir, sourceFiles);
  if (currentRootExports === null) {
    errors.push('cannot resolve packages/shared/src/index.ts for root export validation');
  } else {
    for (const name of retiredRootExports) {
      if (currentRootExports.has(name)) {
        errors.push(`retired Shared root export is public again: ${name}`);
      }
    }
  }

  for (const relativeFile of sourceFiles) {
    const absoluteFile = path.join(rootDir, relativeFile);
    const source = await readFile(absoluteFile, 'utf8');
    for (const { specifier, names } of collectModuleReferences(source, relativeFile)) {
      const directSource = retiredByEntry.get(specifier);
      if (directSource) {
        errors.push(`${relativeFile} imports retired Shared entry ${specifier} (${directSource})`);
        continue;
      }
      if (specifier === '@neko/shared' || specifier === '@neko/shared/types/index') {
        for (const name of names) {
          if (retiredRootExports.has(name)) {
            errors.push(`${relativeFile} imports retired Shared root export ${name}`);
          }
        }
      }
      if (!specifier.startsWith('.')) {
        continue;
      }
      const resolvedStem = relativeModuleTarget(absoluteFile, specifier);
      const relativeSource = retiredAbsoluteStems.get(resolvedStem);
      if (relativeSource) {
        errors.push(`${relativeFile} imports retired Shared source ${relativeSource}`);
      }
    }
  }

  return errors;
}

async function main() {
  const errors = await checkRetiredSharedModules();
  if (errors.length > 0) {
    console.error('[shared-exports] retired Shared export boundary failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('[shared-exports] retired Shared export boundary passed');
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  await main();
}
