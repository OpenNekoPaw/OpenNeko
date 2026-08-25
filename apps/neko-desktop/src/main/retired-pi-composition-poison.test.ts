import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const mainRoot = import.meta.dirname;

describe('Desktop Main retired Pi composition poison', () => {
  it('does not compose Pi catalog, credential, Skill creation, or protected auth paths', () => {
    const index = readFileSync(path.join(mainRoot, 'index.ts'), 'utf8');
    const mediaProvider = readFileSync(
      path.join(mainRoot, 'desktop-media-execution-provider.ts'),
      'utf8',
    );

    for (const source of [index, mediaProvider]) {
      expect(source).not.toContain('@neko/agent-runtime/pi');
      expect(source).not.toContain('NodePiConversationCatalogReader');
      expect(source).not.toContain('createAgentCredentialRuntime');
      expect(source).not.toContain('createNodeSkillPackageCreationService');
      expect(source).not.toContain('resolveAgentSkillsDir');
    }
    expect(index).not.toContain("'agent-credentials.json'");
    expect(index).not.toContain('removeRetiredPiStorage');
    expect(index).not.toContain('DesktopRetiredPiStorageFilePort');
    expect(index).toContain('DSH Conversation reference authority is not composed.');
    expect(existsSync(path.join(mainRoot, 'macos-protected-auth-prompt.ts'))).toBe(false);
  });

  it('composes Character Conversations through the live DSH application service', () => {
    const index = readFileSync(path.join(mainRoot, 'index.ts'), 'utf8');

    expect(index).toContain('dshDomainConversations = createDshDomainConversationService({');
    expect(index).toContain('publication: dshProduct.runtime.conversations.publication');
    expect(index).toContain('turnContext: dshPromptContext');
    expect(index).toContain('projection: dshProduct.runtime.client.projection');
    expect(index).not.toContain('AgentDomainConversationService');
    expect(index).not.toContain('agentDomainConversations');
  });
});
