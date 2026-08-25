import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = findRepoRoot(__dirname);
const desktopCanvasRuntimePath = 'apps/neko-desktop/src/main/desktop-canvas-runtime.ts';

describe('project file I/O guardrails', () => {
  it('keeps browser-visible add-source helpers free of Node builtins', () => {
    const browserVisibleFiles = [
      'packages/content/domain/src/project-file-io/add-source.ts',
      'packages/content/domain/src/project-file-io/ingest.ts',
      'packages/content/domain/src/project-file-io/add-source-flow.ts',
      'packages/canvas/webview/src/hooks/useDragDrop.ts',
    ];

    for (const file of browserVisibleFiles) {
      const source = readSource(file);
      expect(source, `${file} must not import node:path`).not.toMatch(
        /from ['"](?:node:)?path['"]/,
      );
      expect(source, `${file} must not import node:fs`).not.toMatch(/from ['"](?:node:)?fs['"]/);
      expect(source, `${file} must not require Node path/fs`).not.toMatch(
        /require\(['"](?:node:)?(?:path|fs)['"]\)/,
      );
    }
  });

  it('keeps Desktop Canvas persistence on the authorized Host port and NKC codec', () => {
    const source = readSource(desktopCanvasRuntimePath);

    expect(source).toContain("import type { NekoHostPorts } from '@neko/host/ports'");
    expect(source).toContain('loadNkc(');
    expect(source).toContain('saveNkc(');
    expect(source).toContain('this.options.host.files');
    expect(source).not.toMatch(/from ['"](?:node:)?fs['"]/);
    expect(source).not.toMatch(/from ['"]vscode['"]/);
  });

  it('keeps open/load paths read-only while Host session policy owns every save', () => {
    const source = readSource(desktopCanvasRuntimePath);
    const loadBody = extractMethodBody(source, 'private async loadDocument(');

    expect(loadBody, 'DesktopCanvasRuntime#loadDocument should exist').not.toBe('');
    expect(loadBody).toContain('this.options.host.files.readText(documentPath)');
    for (const pattern of [
      /\.writeText\(/,
      /\.rename\(/,
      /\.delete\(/,
      /saveNkc\(/,
      /JSON\.stringify\(/,
    ]) {
      expect(loadBody, `loadDocument must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it('commits Canvas saves through a temporary file before atomic replacement', () => {
    const source = readSource(desktopCanvasRuntimePath);
    const saveBody = extractMethodBody(source, 'private async saveDocument(');

    expect(saveBody, 'DesktopCanvasRuntime#saveDocument should exist').not.toBe('');
    expect(saveBody).toContain('await this.options.host.files.createDirectory(directory)');
    expect(saveBody).toContain(
      'await this.options.host.files.writeText(temporaryPath, saveNkc(canvas))',
    );
    expect(saveBody).toContain('await this.options.host.files.rename(temporaryPath, documentPath)');
    expect(saveBody).toContain('delete(temporaryPath, { idempotent: true })');
    expect(saveBody).not.toContain('writeText(documentPath');
  });

  it('routes Canvas persistence through the instance-scoped Host runtime session', () => {
    const source = readSource(desktopCanvasRuntimePath);

    expect(source).toContain('const session = new CanvasHostRuntimeSession({');
    expect(source).toMatch(
      /saveDocument:\s*async\s*\(\{\s*canvas,\s*removedNodeIds\s*\}\)\s*=>\s*\{[\s\S]*await this\.saveDocument\(documentPath, canvas\)/,
    );
    expect(source).not.toMatch(/postMessage\(\{\s*type:\s*['"](?:save|document:save)['"]/);
  });

  it('keeps drag-and-drop acquisition on the canonical project:addSource path', () => {
    const dragDropPath = 'packages/canvas/webview/src/hooks/useDragDrop.ts';
    const dragDropSource = readSource(dragDropPath);
    const protocolSource = readSource(
      'packages/content/domain/src/project-file-io/add-source-flow.ts',
    );

    expect(dragDropSource).toContain('createProjectSourceAddClient({');
    expect(protocolSource).toContain("readonly type: 'project:addSource'");
    expect(dragDropSource).not.toMatch(/Extension Host|acquireVsCodeApi|\bvscode\b/);
    expect(dragDropSource).not.toMatch(/URL\.createObjectURL\(\s*file\s*\)/);

    for (const pattern of [
      /['"]project:dropImportAudio['"]/,
      /['"]project:importAudio['"]/,
      /['"]puppet:dropFile['"]/,
      /['"]puppet:import['"]/,
      /['"]model:dropFile['"]/,
      /['"]model:import['"]/,
      /['"]file:dropRequest['"]/,
      /['"]file:import['"]/,
      /resolveDroppedFiles/,
      /linkAudioSourceForProject/,
      /linkModelSourcePath/,
      /linkPuppetSourcePath/,
    ]) {
      expect(dragDropSource, `${dragDropPath} must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it('keeps picker acquisition on the Desktop request-source intent path', () => {
    const canvasAppSource = readSource('packages/canvas/webview/src/CanvasApp.tsx');
    const webviewHostSource = readSource(
      'packages/canvas/webview/src/host-runtime/canvas-webview-host.ts',
    );
    const domainSessionSource = readSource(
      'packages/canvas/domain/src/canvas-host-runtime-session.ts',
    );
    const desktopSource = readSource(desktopCanvasRuntimePath);

    expect(canvasAppSource).toContain('.requestSource(action.sourceKind, sourceMode, position)');
    expect(webviewHostSource).toContain("type: 'request-source'");
    expect(domainSessionSource).toContain(
      'const requestSource = this.options.effects.requestSource',
    );
    expect(desktopSource).toContain('requestSource: requestSource');
    expect(desktopSource).toContain('sourceMode,');

    const activeSources = [canvasAppSource, webviewHostSource, domainSessionSource, desktopSource];
    for (const source of activeSources) {
      expect(source).not.toMatch(/acquireVsCodeApi|Extension Host/);
    }
  });

  it('keeps save-reason diagnostics broad enough to distinguish add-source saves', () => {
    expect(readSource('packages/content/domain/src/project-file-io/store.ts')).toContain(
      "| 'add-source'",
    );
  });
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

function extractMethodBody(source: string, methodName: string): string {
  const methodIndex = source.indexOf(methodName);
  if (methodIndex < 0) return '';
  const braceIndex = source.indexOf('{', methodIndex);
  if (braceIndex < 0) return '';

  let depth = 0;
  for (let index = braceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceIndex + 1, index);
      }
    }
  }
  return '';
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to locate repo root from ${startDir}`);
}
