import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = findRepoRoot(__dirname);

describe('project file I/O guardrails', () => {
  it('keeps browser-visible add-source helpers free of Node builtins', () => {
    const browserVisibleFiles = [
      'packages/neko-types/src/project-file-io/add-source.ts',
      'packages/neko-types/src/project-file-io/ingest.ts',
    ];

    for (const file of browserVisibleFiles) {
      const source = readSource(file);
      expect(source, `${file} must not import node:path`).not.toMatch(
        /from ['"](?:node:)?path['"]/,
      );
      expect(source, `${file} must not require path`).not.toMatch(
        /require\(['"](?:node:)?path['"]\)/,
      );
    }
  });

  it('keeps migrated nk* editor persistence on the shared project file store', () => {
    const migratedFiles = [
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
      'packages/neko-cut/packages/extension/src/services/ProjectSessionService.ts',
    ];

    for (const file of migratedFiles) {
      expect(readSource(file), file).toContain('ProjectFileStore');
      expect(readSource(file), file).toContain('createDefaultProjectFormatCodecRegistry');
    }
  });

  it('keeps migrated nk* save lifecycles on the shared save session', () => {
    const sessionFiles = [
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
      'packages/neko-cut/packages/extension/src/editor/video/cutProjectFilePersistence.ts',
      'packages/neko-cut/packages/extension/src/services/ProjectSessionService.ts',
    ];

    for (const file of sessionFiles) {
      expect(readSource(file), file).toContain('ProjectFileSaveSession');
    }

    const customEditorFiles = sessionFiles.filter(
      (file) => !file.includes('cutProjectFilePersistence'),
    );
    for (const file of customEditorFiles) {
      const source = readSource(file);
      expect(source, `${file} must not bypass ProjectFileSaveSession with raw save`).not.toMatch(
        /projectFileStore\.save(?:As)?\(/,
      );
      expect(source, `${file} must not bypass ProjectFileSaveSession with raw backup`).not.toMatch(
        /projectFileStore\.backup\(/,
      );
      expect(source, `${file} must not bypass ProjectFileSaveSession with raw save`).not.toMatch(
        /_projectFileStore\.save(?:As)?\(/,
      );
      expect(source, `${file} must not bypass ProjectFileSaveSession with raw backup`).not.toMatch(
        /_projectFileStore\.backup\(/,
      );
    }
  });

  it('prevents migrated editor paths from reintroducing direct nk* JSON persistence', () => {
    const forbiddenByFile: Record<string, readonly RegExp[]> = {
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts': [
        /content\.trim\(\)\s*\?\s*loadNkc\(content\)/,
        /workspace\.fs\.writeFile\(targetUri,\s*Buffer\.from\(content/,
      ],
    };

    for (const [file, patterns] of Object.entries(forbiddenByFile)) {
      const source = readSource(file);
      for (const pattern of patterns) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps open/load project paths read-only until an explicit save/import request', () => {
    const readOnlyMethods: Record<string, readonly string[]> = {
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts': [
        'openCustomDocument',
        'loadCanvasProject',
      ],
    };

    const forbiddenWrites = [
      /\.save(?:As)?\(/,
      /\.backup\(/,
      /workspace\.fs\.writeFile\(/,
      /fs\.writeFile\(/,
      /JSON\.stringify\(/,
    ];

    for (const [file, methodNames] of Object.entries(readOnlyMethods)) {
      const source = readSource(file);
      for (const methodName of methodNames) {
        const body = extractMethodBody(source, methodName);
        expect(body, `${file}#${methodName} should exist`).not.toBe('');
        for (const pattern of forbiddenWrites) {
          expect(body, `${file}#${methodName} must not match ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it('prevents custom editor save from acknowledging before a durable record is available', () => {
    const saveContracts: Record<string, RegExp> = {
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts':
        /projectFileSession\.save\(/,
    };

    for (const [file, requiredPattern] of Object.entries(saveContracts)) {
      const source = readSource(file);
      const saveBody = extractMethodBody(source, 'saveCustomDocument');
      expect(saveBody || source, `${file} must satisfy ${requiredPattern}`).toMatch(
        requiredPattern,
      );
      expect(saveBody, `${file} must not only request a webview save`).not.toMatch(
        /postMessage\(\{\s*type:\s*['"](?:save|document:save)['"]/,
      );
    }

    expect(
      readSource('packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts'),
      'Canvas save must request a live Webview snapshot before ProjectFileSaveSession.save',
    ).toMatch(/requestCanvasProjectSnapshot\(/);
  });

  it('keeps migrated editor source acquisition on the canonical project:addSource path', () => {
    const migratedProductionFiles = [
      'packages/neko-canvas/packages/webview/src/hooks/useDragDrop.ts',
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
    ];

    const forbiddenLegacyPatterns = [
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
      /createModelAssetFromBytes/,
      /createPuppetAssetFromBytes/,
    ];

    for (const file of migratedProductionFiles) {
      const source = readSource(file);
      for (const pattern of forbiddenLegacyPatterns) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }

    const durableWebviewSourceAddFiles = [
      'packages/neko-canvas/packages/webview/src/hooks/useDragDrop.ts',
    ];
    for (const file of durableWebviewSourceAddFiles) {
      expect(
        readSource(file),
        `${file} must not create object URLs for durable source adds`,
      ).not.toMatch(/URL\.createObjectURL\(\s*file\s*\)/);
    }

    const canonicalSourceAddFiles = [
      'packages/neko-canvas/packages/webview/src/hooks/useDragDrop.ts',
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
    ];
    for (const file of canonicalSourceAddFiles) {
      expect(readSource(file), `${file} should use the canonical add-source protocol`).toMatch(
        /project:addSource|ProjectSourceAddRequest|createProjectSourceAddClient|handleProjectSourceAddRequest|handleProjectSourceAddHostRequest/,
      );
    }
  });

  it('keeps picker/import source acquisition on the canonical add-source path', () => {
    const canvasSource = readSource(
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
    );
    const canvasNodeLibraryPolicySource = readSource(
      'packages/neko-canvas/packages/webview/src/utils/nodeLibraryPolicy.ts',
    );
    const canvasNodeLibraryPanelSource = readSource(
      'packages/neko-canvas/packages/webview/src/components/panels/NodeLibraryPanel.tsx',
    );
    const canvasAppSource = readSource('packages/neko-canvas/packages/webview/src/CanvasApp.tsx');
    expect(canvasSource).toContain('private async resolveCanvasProjectSourceAddRequest(');
    expect(canvasSource).toContain('private createCanvasProjectSourcePickerFilters(');
    expect(canvasSource).toContain('this.createCanvasPickerSourceAddRequest(uri, documentUri');
    expect(canvasSource).not.toContain('createCanvasDroppedAssetFromProjectAddSource(');
    expect(canvasNodeLibraryPolicySource).toContain('requiresSourceAdd');
    expect(canvasAppSource).toContain('createCanvasFilePickerAddSourceInput(type, position)');
    for (const caseName of [
      'pickMedia',
      'pickCanvasDocument',
      'pickMediaFile',
      'pickProjectDocument',
      'pickScriptDocument',
      'pickReferenceDocument',
      'pickModelReference',
      'pickFile',
    ]) {
      expect(
        canvasSource,
        `Canvas ${caseName} must be removed in favor of project:addSource`,
      ).not.toContain(`case '${caseName}'`);
    }
    expect(canvasSource).not.toContain('rejectLegacyCanvasPickerMessage');
    expect(canvasSource).not.toMatch(
      /createCanvasDroppedAssetFromProjectAddSource|postMessage\(\{\s*type:\s*'dropAssets'|path:\s*uri\.(?:fsPath|path)/,
    );
    const canvasWebviewMessagesSource = readSource(
      'packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.ts',
    );
    expect(canvasWebviewMessagesSource).not.toMatch(
      /case ['"](?:addMedia|dropMedia|dropAssets)['"]/,
    );
    expect(canvasWebviewMessagesSource).not.toMatch(/onAddMediaFromExtension|onDropAssets/);
    for (const source of [
      canvasNodeLibraryPolicySource,
      canvasNodeLibraryPanelSource,
      canvasAppSource,
    ]) {
      expect(source).not.toMatch(
        /pickMediaFile|pickScriptDocument|pickReferenceDocument|pickModelReference|pickCanvasDocument|pickProjectDocument/,
      );
    }
  });

  it('keeps save-reason diagnostics broad enough to distinguish add-source saves', () => {
    expect(readSource('packages/neko-types/src/project-file-io/store.ts')).toContain(
      "| 'add-source'",
    );
    expect(
      readSource('packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts'),
    ).toContain("value === 'add-source'");
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
