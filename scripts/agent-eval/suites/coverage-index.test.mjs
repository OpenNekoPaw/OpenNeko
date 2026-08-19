import { describe, expect, it } from 'vitest';
import { discoverSuites } from './discovery.mjs';
import { EXPECTED_BUILTIN_SKILLS, loadCoverageIndex } from './coverage-index.mjs';

describe('Agent Evaluation coverage index', () => {
  it('covers every current builtin Skill with exact portable Host identity and fingerprint', async () => {
    const suites = await discoverSuites();
    const coverage = await loadCoverageIndex({ suites });
    const builtinSuites = suites.filter(
      (entry) =>
        entry.suite.target.kind === 'skill' &&
        entry.suite.target.identity.source === 'builtin' &&
        entry.suite.target.identity.provenance === 'builtin',
    );

    expect(builtinSuites.map((entry) => entry.suite.target.identity.name).sort()).toEqual(
      [...EXPECTED_BUILTIN_SKILLS].sort(),
    );

    for (const entry of builtinSuites) {
      const identity = entry.suite.target.identity;
      const target = coverage.targets.find(
        (item) => item.kind === 'builtin-skill' && item.id === identity.name,
      );
      expect(target?.disposition).toBe('suite');
      expect(target?.suiteIds).toContain(entry.suite.id);
      expect(identity).toMatchObject({
        name: identity.name,
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: identity.name,
        fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
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
  });
});
