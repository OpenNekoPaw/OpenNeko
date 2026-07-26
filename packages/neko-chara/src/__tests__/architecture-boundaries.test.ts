import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../..');

describe('neko-chara architecture boundaries', () => {
  it('keeps core and application independent from Host, UI, and Agent implementations', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/application')),
    ];
    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]react/,
      /from ['"]@neko-agent\/extension/,
      /from ['"]@neko\/agent(?:\/|['"])/,
      /from ['"]@neko\/platform/,
      /from ['"]@neko\/entity\/host-vscode/,
      /from ['"]@neko\/search\/host-vscode/,
      /from ['"]@neko\/content/,
      /from ['"][^'"]*webview[^'"]*['"]/i,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps the VS Code adapter independent from Agent Extension implementation', () => {
    const files = listTypeScriptFiles(resolve(packageRoot, 'src/host-vscode'));
    const forbidden = [
      /from ['"]@neko-agent\/extension/,
      /packages\/neko-agent\/packages\/extension/,
      /from ['"][^'"]*\/chat\/chatProvider['"]/,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('removes the retired Entity and Agent Character implementation paths', () => {
    const retired = [
      'packages/neko-entity/src/character-runtime-policy.ts',
      'packages/neko-entity/src/character-evidence.ts',
      'packages/neko-entity/src/character-dialogue-profile-projector.ts',
      'packages/neko-entity/src/character-dialogue-session.ts',
      'packages/neko-entity/src/character-dialogue-runtime.ts',
      'packages/neko-entity/src/characterPurposeOperations.ts',
      'packages/neko-entity/src/embody-character-session.ts',
      'packages/neko-entity/src/projections/npcProfileAssembler.ts',
      'packages/neko-agent/packages/extension/src/chat/characterDialogueController.ts',
      'packages/neko-agent/packages/extension/src/chat/embodyCharacterController.ts',
      'packages/neko-agent/packages/extension/src/evidence/characterEvidenceLoader.ts',
    ];

    expect(retired.filter((file) => existsSync(resolve(workspaceRoot, file)))).toEqual([]);
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}
