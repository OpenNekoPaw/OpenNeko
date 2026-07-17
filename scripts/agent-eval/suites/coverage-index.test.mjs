import { describe, expect, it } from 'vitest';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { PiSkillHost } from '../../../packages/neko-agent/packages/agent/src/pi/skill-host.ts';
import { discoverSuites } from './discovery.mjs';
import { EXPECTED_BUILTIN_SKILLS, loadCoverageIndex } from './coverage-index.mjs';

describe('Agent Evaluation coverage index', () => {
  it('covers every current builtin Skill with exact Host identity and fingerprint', async () => {
    const suites = await discoverSuites();
    const coverage = await loadCoverageIndex({ suites });
    const env = new NodeExecutionEnv({ cwd: process.cwd() });
    const builtins = (
      await new PiSkillHost(env, {
        isTrusted: () => true,
        isEnabled: () => true,
      }).discover([
        { path: 'packages/neko-skills/skills', source: { kind: 'builtin' } },
      ])
    ).records;
    await env.cleanup();
    expect(builtins.map((skill) => skill.name).sort()).toEqual(
      [...EXPECTED_BUILTIN_SKILLS].sort(),
    );
    for (const skill of builtins) {
      const target = coverage.targets.find(
        (item) => item.kind === 'builtin-skill' && item.id === skill.name,
      );
      expect(target?.disposition).toBe('suite');
      const suite = suites.find((item) => item.suite.id === target.suiteIds[0]);
      expect(suite.suite.target.identity).toMatchObject({
        name: skill.name,
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: skill.name,
        fingerprint: `sha256:${skill.fingerprint}`,
      });
    }
  });

  it('rejects missing suite references and does not exclude model-driven builtin Skills', async () => {
    const suites = await discoverSuites();
    const coverage = await loadCoverageIndex({ suites });
    expect(
      coverage.targets.filter(
        (item) => item.kind === 'builtin-skill' && item.disposition === 'excluded',
      ),
    ).toEqual([]);
    expect(
      coverage.legacyCases.filter((item) => item.disposition === 'excluded').map((item) => item.id),
    ).toEqual([
      'blame-epub-storyboard-to-canvas',
      'blame-epub-canonical-storyboard-skill',
      'lamp-god-epub-animation-plan',
    ]);
  });
});
