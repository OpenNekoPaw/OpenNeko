export interface SourceGuardViolation {
  readonly filePath: string;
  readonly reason: string;
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
