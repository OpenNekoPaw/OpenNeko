import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  findForbiddenArchitectureClaims,
  findRetiredAgentSkillToolClaims,
  readOpenNekoProfilePluginNames,
  validateCanonicalAgentRegistrationGraph,
  validateDshExtensionManagementHostSource,
  validateSurfaceStructure,
} from './check-agent-extension-surface.mjs';

const surface = JSON.parse(
  await readFile(new URL('../quality/agent-extension-surface.json', import.meta.url), 'utf8'),
);

test('accepts the canonical minimal extension surface', () => {
  assert.deepEqual(validateSurfaceStructure(surface), []);
  assert.equal('pluginState' in surface, false);
  assert.equal('skillAuthoringMetadata' in surface, false);
  assert.deepEqual(surface.extensionManagement.visibleTypes, ['skill', 'mcp']);
  assert.equal(surface.extensionManagement.pluginVisible, false);
  assert.deepEqual(surface.portableSkill.layouts, ['directory-skill-md', 'flat-markdown']);
  assert.equal(surface.portableSkill.multiSkill, true);
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

test('rejects OpenNeko restrictions that narrow DSH Skill semantics', () => {
  for (const [claim, diagnostic] of [
    ['Skill 正文不得写具体工具名教程。', 'DSH-valid public Tool guidance is forbidden'],
    ['每次只允许一个 primary Skill。', 'single-primary-Skill restriction'],
    ['Skill 数量最多为 4。', 'fixed Skill-count restriction'],
    ['必须选择 Artifact Profile 才能加载 Skill。', 'artifact-profile-first Skill restriction'],
  ]) {
    assert.deepEqual(findForbiddenArchitectureClaims(claim, 'adr.md'), [
      `adr.md: ${diagnostic}`,
    ]);
  }
});

test('rejects retired Agent Skill Tool instructions in stable architecture', () => {
  for (const toolName of ['GetContext', 'ActivateSkill', 'DeactivateSkill']) {
    assert.deepEqual(findRetiredAgentSkillToolClaims(`必要时调用 ${toolName}。`, 'adr.md'), [
      'adr.md: retired Agent Skill Tool protocol',
    ]);
  }
});

test('requires Extension Management to project only DSH Skill and MCP catalogs', () => {
  assert.deepEqual(
    validateDshExtensionManagementHostSource(
      'const snapshot = await this.options.runtime.client.readExtensions(); return { skills: snapshot.skills, mcp: snapshot.mcp };',
    ),
    [],
  );
  assert.deepEqual(validateDshExtensionManagementHostSource('const snapshot = plugin_states;'), [
    'Extension Management host must project the canonical DSH extension snapshot',
    'Extension Management host must project both Skill and MCP catalogs',
    'Extension Management host retains retired authority plugin_states',
  ]);
  assert.deepEqual(
    validateDshExtensionManagementHostSource(
      'const snapshot = await this.options.runtime.client.readExtensions(); return { skills: snapshot.skills, mcp: snapshot.mcp, plugins: snapshot.plugins };',
    ),
    ['Extension Management host retains retired authority plugins:'],
  );
});

test('rejects dual runtime, duplicate Tool or MCP, and wildcard Plugin registrations', () => {
  const canonical = {
    runtimes: ['dsh'],
    tools: [
      'CreateSkill',
      'openneko.generation',
      'openneko.canvas',
      'openneko.cut',
      'openneko.document',
      'openneko.character',
    ],
    mcpContributions: ['official.browser'],
    plugins: [
      '@neko/agent-dsh-plugin',
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
  poisoned.tools.push('openneko.assets');
  poisoned.mcpContributions.push('official.browser');
  poisoned.plugins[2] = '@neko/*';
  poisoned.plugins.push('@neko/assets-dsh-plugin');

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
