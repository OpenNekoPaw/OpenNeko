import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { afterAll, describe, expect, it } from 'vitest';

import { buildSkillActivationId, PiSkillHost, type PiSkillHostSnapshot } from '../skill-host';

const BUILTIN_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../skills/skills',
);
const EXPECTED_BUILTINS = [
  'audio-mixing',
  'character-creator',
  'color-grading',
  'image',
  'media-production',
  'media-quality-review',
  'scene-to-music',
  'script-generation',
  'script-to-timeline',
  'skill-creator',
  'storyboard',
  'subtitle-assistant',
  'video',
  'video-editing',
] as const;

describe('Pi builtin Skill packages', () => {
  const env = new NodeExecutionEnv({ cwd: BUILTIN_ROOT });

  afterAll(async () => env.cleanup());

  it('discovers the canonical builtin catalog directly from SKILL.md packages', async () => {
    const snapshot = await discoverBuiltins(env);

    expect(snapshot.records.map((skill) => skill.name).sort()).toEqual(EXPECTED_BUILTINS);
    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.shadowedRecords).toEqual([]);
  });

  it('keeps creation and storyboard methodology in Skill content without runtime authority', async () => {
    const snapshot = await discoverBuiltins(env);

    expect(invokeSelected(snapshot, 'skill-creator')).toContain(
      'A root `manifest.json` is not part',
    );
    const characterCreation = invokeSelected(snapshot, 'character-creator');
    expect(characterCreation).toContain('source-backed facts from creative inferences');
    expect(characterCreation).toContain('available authoring capability');
    const storyboard = invokeSelected(snapshot, 'storyboard');
    expect(storyboard).toContain('actual pixel-level visual evidence, OCR, or panel boundaries');
    expect(storyboard).not.toContain('ReadDocument');
    expect(storyboard).not.toContain('ReadImage');
    expect(storyboard).not.toContain('QuerySemanticCoverage');
  });

  it('keeps the full builtin catalog free of OpenNeko runtime protocols', async () => {
    const snapshot = await discoverBuiltins(env);
    const forbidden = [
      'CharacterProjectCreate',
      'UpdateCharacterDraft',
      'CreateTask',
      'GetTask',
      'ReadDocument',
      'ReadImage',
      'QuerySemanticCoverage',
      'openneko.',
      'agents/neko.yaml',
      '.neko/skills',
      'Webview',
      'cache paths',
      'provider task handles',
      'polling state',
    ];

    for (const skill of snapshot.skills) {
      for (const token of forbidden) {
        expect(skill.content, `${skill.name} must not contain ${token}`).not.toContain(token);
      }
    }
  });
});

function discoverBuiltins(env: NodeExecutionEnv) {
  return new PiSkillHost(env, {
    isTrusted: () => true,
    isEnabled: () => true,
  }).discover([{ path: BUILTIN_ROOT, source: { kind: 'builtin' } }]);
}

function invokeSelected(snapshot: PiSkillHostSnapshot, name: string): string {
  const record = snapshot.records.find((candidate) => candidate.name === name);
  if (!record) throw new Error(`Fixture Skill '${name}' is unavailable.`);
  return snapshot.invokeExact(name, buildSkillActivationId(record));
}
