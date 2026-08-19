import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  findForbiddenArchitectureClaims,
  findRetiredAgentSkillToolClaims,
  validateSurfaceStructure,
} from './check-agent-extension-surface.mjs';

const surface = JSON.parse(
  await readFile(new URL('../quality/agent-extension-surface.json', import.meta.url), 'utf8'),
);

test('accepts the canonical minimal extension surface', () => {
  assert.deepEqual(validateSurfaceStructure(surface), []);
});

test('rejects coupling portable Skills to Host packaging or MCP', () => {
  const coupled = structuredClone(surface);
  coupled.portableSkill.hostManifestRequired = true;
  coupled.portableSkill.mcpRequired = true;

  assert.deepEqual(validateSurfaceStructure(coupled), [
    'quality/agent-extension-surface.json: portableSkill.hostManifestRequired must be false',
    'quality/agent-extension-surface.json: portableSkill.mcpRequired must be false',
  ]);
});

test('rejects retired private Skill overlay claims', () => {
  assert.deepEqual(findForbiddenArchitectureClaims('Skill 使用 agents/neko.yaml。', 'adr.md'), [
    'adr.md: retired private Skill overlay',
  ]);
});

test('rejects retired Agent Skill Tool instructions in stable architecture', () => {
  for (const toolName of ['GetContext', 'ActivateSkill', 'DeactivateSkill']) {
    assert.deepEqual(findRetiredAgentSkillToolClaims(`必要时调用 ${toolName}。`, 'adr.md'), [
      'adr.md: retired Agent Skill Tool protocol',
    ]);
  }
});
