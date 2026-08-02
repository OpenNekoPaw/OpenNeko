export interface SourceGuardViolation {
  readonly filePath: string;
  readonly reason: string;
}

export interface SharedComponentsImportAllowance {
  readonly filePath: string;
  readonly importNames: readonly string[];
}

export function findInlineSvgControlViolations(
  sources: ReadonlyMap<string, string>,
): SourceGuardViolation[] {
  return collectViolations(sources, [
    {
      pattern: /<svg[\s>]/,
      reason: 'inline svg',
    },
    {
      pattern: /(['"`])[\u25A0-\u25FF\u2600-\u27BF]\1/,
      reason: 'unicode glyph icon',
    },
  ]);
}

export function findPackageSpecificTokenViolations(
  sources: ReadonlyMap<string, string>,
  prefixes: readonly string[] = ['--nk-', '--sketch-', '--model-', '--tools-'],
): SourceGuardViolation[] {
  return collectViolations(
    sources,
    prefixes.map((prefix) => ({
      pattern: new RegExp(escapeRegExp(prefix)),
      reason: `package token ${prefix}`,
    })),
  );
}

export function findSharedComponentsImportViolations(
  sources: ReadonlyMap<string, string>,
  allowedImports: readonly SharedComponentsImportAllowance[],
): SourceGuardViolation[] {
  const allowedByPath = new Map(
    allowedImports.map((entry) => [
      normalizeSourcePath(entry.filePath),
      new Set(entry.importNames),
    ]),
  );
  const violations: SourceGuardViolation[] = [];

  for (const [filePath, source] of sources) {
    const normalizedPath = normalizeSourcePath(filePath);
    const allowedNames = allowedByPath.get(normalizedPath);
    const importNames = findSharedComponentsImportNames(source);

    if (importNames.length === 0) {
      continue;
    }

    if (!allowedNames) {
      violations.push({
        filePath,
        reason: 'legacy @neko/shared/components import is not exempted',
      });
      continue;
    }

    for (const importName of importNames) {
      if (!allowedNames.has(importName)) {
        violations.push({
          filePath,
          reason: `unlisted @neko/shared/components import ${importName}`,
        });
      }
    }
  }

  return violations;
}

function collectViolations(
  sources: ReadonlyMap<string, string>,
  rules: readonly { pattern: RegExp; reason: string }[],
): SourceGuardViolation[] {
  const violations: SourceGuardViolation[] = [];

  for (const [filePath, source] of sources) {
    for (const rule of rules) {
      if (rule.pattern.test(source)) {
        violations.push({ filePath, reason: rule.reason });
      }
    }
  }

  return violations;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSharedComponentsImportNames(source: string): string[] {
  const sourceWithoutComments = stripComments(source);
  const importNames = new Set<string>();
  const statementPattern =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^;]*?\s+from\s+['"]@neko\/shared\/components['"]/g;
  const sideEffectImportPattern = /(?:^|\n)\s*import\s+['"]@neko\/shared\/components['"]/g;

  if (sideEffectImportPattern.test(sourceWithoutComments)) {
    importNames.add('side-effect');
  }

  for (const match of sourceWithoutComments.matchAll(statementPattern)) {
    const statement = match[0];
    const namespaceMatch = statement.match(/\*\s+as\s+[A-Za-z_$][\w$]*/);
    const importBody = statement
      .replace(/^\s*(?:import|export)\s+(?:type\s+)?/, '')
      .replace(/\s+from\s+['"]@neko\/shared\/components['"]$/, '')
      .trim();

    if (namespaceMatch) {
      importNames.add('*');
    }

    if (
      statement.trim().startsWith('import') &&
      importBody &&
      !importBody.startsWith('{') &&
      !importBody.startsWith('*')
    ) {
      importNames.add('default');
    }

    for (const braceMatch of statement.matchAll(/\{([\s\S]*?)\}/g)) {
      const specifierList = braceMatch[1];

      if (!specifierList) {
        continue;
      }

      for (const rawSpecifier of specifierList.split(',')) {
        const importName = rawSpecifier
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          ?.trim();

        if (importName) {
          importNames.add(importName);
        }
      }
    }
  }

  return Array.from(importNames).sort();
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function normalizeSourcePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
