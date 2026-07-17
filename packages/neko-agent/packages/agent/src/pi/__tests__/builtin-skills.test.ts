import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { afterAll, describe, expect, it } from 'vitest';

import { PiSkillHost } from '../skill-host';

const BUILTIN_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../neko-skills/skills',
);
const EXPECTED_BUILTINS = [
  'audio-mixing',
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

    expect(snapshot.invoke('skill-creator')).toContain('A root `manifest.json` is not part');
    const storyboard = snapshot.invoke('storyboard');
    expect(storyboard).toContain('actual pixel-level visual evidence, OCR, or panel boundaries');
    expect(storyboard).not.toContain('ReadDocument');
    expect(storyboard).not.toContain('ReadImage');
    expect(storyboard).not.toContain('QuerySemanticCoverage');
  });
});

function discoverBuiltins(env: NodeExecutionEnv) {
  return new PiSkillHost(env, {
    isTrusted: () => true,
    isEnabled: () => true,
  }).discover([{ path: BUILTIN_ROOT, source: { kind: 'builtin' } }]);
}
