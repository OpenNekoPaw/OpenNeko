import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '..');
const sourceExtensions = new Set(['.ts', '.tsx']);
const forbiddenImportPatterns = [
  /from\s+['"]vscode['"]/,
  /from\s+['"]node:/,
  /from\s+['"]fs['"]/,
  /from\s+['"]path['"]/,
  /from\s+['"]url['"]/,
  /from\s+['"]@neko\/(?:cut|model|puppet|sketch|canvas|agent|market|dashboard|tools|preview|audio|live|story)(?:\/|['"])/,
];
const markdownUiRoot = join(srcRoot, 'markdown');
const markdownCoreRoot = join(srcRoot, '../../neko-markdown/src');

describe('@neko/ui dependency boundary', () => {
  it('does not import vscode, node-only modules, or feature packages from source files', () => {
    const violations = collectSourceFiles(srcRoot).flatMap((filePath) => {
      const text = readFileSync(filePath, 'utf-8');
      const relativePath = relative(srcRoot, filePath);
      const patternViolations = forbiddenImportPatterns
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relativePath}: ${pattern}`);
      const acquireViolation = text.includes('acquireVsCodeApi')
        ? [`${relativePath}: acquireVsCodeApi`]
        : [];

      return [...patternViolations, ...acquireViolation];
    });

    expect(violations).toEqual([]);
  });

  it('does not embed feature-domain UI semantics in production source', () => {
    const forbiddenDomainSemantics = [
      /\bAICapability\b/,
      /\bAIMenuConfig\b/,
      /\bbuildAIMenuSection\b/,
      /\bDEFAULT_AGENT_LABEL\b/,
      /发送到 Agent/,
      /\bEditorKeyframeTrack\b/,
      /from\s+['"]@neko\/shared['"];?\s*$/,
      /\|\s*'(?:morph|ik|bone|blendshape|brush)'/,
    ];

    const violations = collectSourceFiles(srcRoot).flatMap((filePath) => {
      const relativePath = relative(srcRoot, filePath);
      const text = readFileSync(filePath, 'utf-8');
      return forbiddenDomainSemantics
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relativePath}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps markdown UI as a React adapter over the host-agnostic markdown core', () => {
    const markdownUiFiles = collectSourceFiles(markdownUiRoot);
    expect(markdownUiFiles.length).toBeGreaterThan(0);

    const violations = markdownUiFiles.flatMap((filePath) => {
      const text = readFileSync(filePath, 'utf-8');
      const relativePath = relative(srcRoot, filePath);
      const reverseDependency = /from\s+['"]@neko\/ui/.test(text)
        ? [`${relativePath}: @neko/ui`]
        : [];

      return [...reverseDependency];
    });

    expect(violations).toEqual([]);
  });

  it('keeps markdown core free of React and shared UI reverse dependencies', () => {
    const forbiddenMarkdownCorePatterns = [
      /from\s+['"]react(?:\/|['"])/,
      /from\s+['"]react-dom(?:\/|['"])/,
      /from\s+['"]@neko\/ui(?:\/|['"])/,
    ];
    const violations = collectSourceFiles(markdownCoreRoot).flatMap((filePath) => {
      const text = readFileSync(filePath, 'utf-8');
      const relativePath = relative(markdownCoreRoot, filePath);
      return forbiddenMarkdownCorePatterns
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relativePath}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (entry === '__tests__') {
        return [];
      }
      return collectSourceFiles(path);
    }

    if (!Array.from(sourceExtensions).some((extension) => path.endsWith(extension))) {
      return [];
    }

    return [path];
  });
}
