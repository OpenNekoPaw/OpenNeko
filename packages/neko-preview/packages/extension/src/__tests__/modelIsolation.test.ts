import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modelRoot = resolve(__dirname, '../providers/model');
const productionFiles = [
  'ModelPreviewProvider.ts',
  'ModelPreviewSourceSession.ts',
  'modelAgentContext.ts',
  'modelFormatAdapters.ts',
  'modelPreviewProtocol.ts',
  'modelSourceInspection.ts',
  'modelStagingState.ts',
];

describe('model preview canonical path isolation', () => {
  it('does not import or dispatch Engine Model/Scene paths or external viewers', () => {
    const source = productionFiles
      .map((fileName) => readFileSync(resolve(modelRoot, fileName), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/EngineClient|PreviewService|neko\.model\.|neko\.scene\./);
    expect(source).not.toMatch(/vscode\.openWith|3D Viewer for VSCode|external viewer/i);
    expect(source).not.toMatch(/providerId\s*:|modelId\s*:|generateVideo|mediaTask/i);
  });

  it('has exactly one Agent delivery command endpoint', () => {
    const source = readFileSync(resolve(modelRoot, 'modelAgentContext.ts'), 'utf8');
    expect(source.match(/neko\.agent\.sendContext/g)).toHaveLength(2);
    expect(source).not.toContain('neko.ai.generateVideo');
  });
});
