import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  findForbiddenArchitectureClaims,
  findRetiredAgentSkillToolClaims,
  readOpenNekoProfilePluginNames,
  validateCanonicalAgentRegistrationGraph,
  validateSurfaceStructure,
} from './check-agent-extension-surface.mjs';

const surface = JSON.parse(
  await readFile(new URL('../quality/agent-extension-surface.json', import.meta.url), 'utf8'),
);

test('accepts the canonical minimal extension surface', () => {
  assert.deepEqual(validateSurfaceStructure(surface), []);
  assert.equal('pluginState' in surface, false);
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

test('rejects dual runtime, duplicate Tool or MCP, and wildcard Plugin registrations', () => {
  const canonical = {
    runtimes: ['dsh'],
    tools: [
      'openneko.generation',
      'openneko.canvas',
      'openneko.cut',
      'openneko.document',
      'openneko.character',
    ],
    mcpContributions: ['official.browser'],
    plugins: [
      '@neko/dsh-bridge',
      '@neko/generation-dsh-plugin',
      '@neko/canvas-dsh-plugin',
      '@neko/cut-dsh-plugin',
      '@neko/content-dsh-plugin',
      '@neko/chara-dsh-plugin',
      '@neko/world-dsh-plugin',
    ],
  };
  assert.deepEqual(validateCanonicalAgentRegistrationGraph(canonical), []);

  const poisoned = structuredClone(canonical);
  poisoned.runtimes.push('pi');
  poisoned.tools.push('openneko.generation');
  poisoned.mcpContributions.push('official.browser');
  poisoned.plugins[2] = '@neko/*';

  const findings = validateCanonicalAgentRegistrationGraph(poisoned);
  assert.ok(findings.some((finding) => finding.includes('exactly one DSH runtime')));
  assert.ok(findings.some((finding) => finding.includes('duplicate Tool identity')));
  assert.ok(findings.some((finding) => finding.includes('duplicate MCP contribution identity')));
  assert.ok(findings.some((finding) => finding.includes('wildcard Plugin identity')));
});

test('keeps third-party DSH infrastructure outside the OpenNeko Plugin identity set', () => {
  assert.deepEqual(
    readOpenNekoProfilePluginNames(`
      name: '@deepseek-ai/dsh-agent-presets'
      name: '@neko/dsh-bridge'
      name: '@neko/generation-dsh-plugin'
    `),
    ['@neko/dsh-bridge', '@neko/generation-dsh-plugin'],
  );
});
