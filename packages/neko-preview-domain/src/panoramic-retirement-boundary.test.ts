import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../');
const BOUNDARY_SOURCE_ROOTS = [
  'apps/neko-desktop/src',
  'packages/neko-preview-domain/package.json',
  'packages/neko-preview-domain/src',
  'packages/neko-preview-webview/src',
  'packages/neko-canvas-domain/src',
  'packages/neko-canvas-webview/src',
  'packages/neko-agent-webview/src',
  'packages/neko-agent-runtime/src',
  'packages/neko-agent-contracts/src',
  'packages/neko-ai-sdk/src',
];
const PROHIBITED_PATTERNS = [
  /neko\.preview\.panoramic(?:Image|Video)/,
  /neko\.preview\.open(?:Best)?Panoramic/,
  /getPanoramicPreviewRoute/,
  /panoramic-(?:image|video)/,
  /panorama-image\/PanoramicViewer/,
  /src\/panorama-image/,
  /PanoramicViewer/,
  /from ['"][^'"]*neko-preview[^'"]*packages\/webview/,
  /from ['"][^'"]*neko-preview[^'"]*providers\/Panoramic/,
];

describe('panoramic preview boundary', () => {
  it('keeps the retired panoramic Preview vertical slice absent', () => {
    const offenders: string[] = [];

    for (const root of BOUNDARY_SOURCE_ROOTS) {
      const sourceRoot = join(REPO_ROOT, root);
      for (const filePath of collectSourceFiles(sourceRoot)) {
        const content = readFileSync(filePath, 'utf8');
        if (PROHIBITED_PATTERNS.some((pattern) => pattern.test(content))) {
          offenders.push(relative(REPO_ROOT, filePath));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

function collectSourceFiles(dir: string): string[] {
  if (statSync(dir).isFile()) return [dir];
  const entries = readdirSync(dir);
  const result: string[] = [];

  for (const entry of entries) {
    if (
      entry === 'dist' ||
      entry === 'node_modules' ||
      entry === '__tests__' ||
      /\.test\.(?:ts|tsx)$/u.test(entry)
    ) {
      continue;
    }
    const filePath = join(dir, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      result.push(...collectSourceFiles(filePath));
    } else if (/\.(ts|tsx|json)$/.test(entry)) {
      result.push(filePath);
    }
  }

  return result;
}
