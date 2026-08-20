import { describe, expect, it } from 'vitest';
import { discoverSuites } from './discovery.mjs';
import {
  EXPECTED_BUILTIN_SKILLS,
  EXPECTED_RUNTIME_CAPABILITIES,
  loadCoverageIndex,
} from './coverage-index.mjs';

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

  it('records DSH-owned generic behavior as excluded instead of duplicating Pi-era tests', async () => {
    const coverage = await loadCoverageIndex();
    const dshTargets = coverage.targets.filter(
      (item) => item.kind === 'agent-runtime-capability' && item.id.startsWith('dsh-'),
    );

    expect(dshTargets.map((item) => item.id).sort()).toEqual(
      EXPECTED_RUNTIME_CAPABILITIES.filter((id) => id.startsWith('dsh-')).sort(),
    );
    expect(dshTargets.every((item) => item.disposition === 'excluded')).toBe(true);
    expect(dshTargets.every((item) => item.deterministicValidation.reason.includes('DSH'))).toBe(
      true,
    );
  });

  it('keeps active scenarios free of retired Pi runtime assertions', async () => {
    const suites = await discoverSuites();
    const retired = suites.flatMap((entry) =>
      entry.cases.flatMap((item) =>
        item.scenario.assertions
          .filter((assertion) => assertion.kind === 'pi-runtime')
          .map((assertion) => `${entry.suite.id}/${item.scenario.id}/${assertion.id}`),
      ),
    );
    expect(retired).toEqual([]);
  });

  it('keeps retired OpenNeko queue operations out of active scenarios', async () => {
    const suites = await discoverSuites();
    const retired = suites.flatMap((entry) =>
      entry.cases.flatMap((item) => [
        ...item.scenario.steps
          .filter((step) => step.kind === 'queue' || step.kind === 'send-queued-now')
          .map((step) => `${entry.suite.id}/${item.scenario.id}/step/${step.id}`),
        ...item.scenario.assertions
          .filter((assertion) => assertion.kind === 'queue-state')
          .map((assertion) => `${entry.suite.id}/${item.scenario.id}/assertion/${assertion.id}`),
      ]),
    );
    expect(retired).toEqual([]);
  });

  it('keeps the retired OpenNeko resource-display assertion out of active scenarios', async () => {
    const suites = await discoverSuites();
    const retired = suites.flatMap((entry) =>
      entry.cases.flatMap((item) =>
        item.scenario.assertions
          .filter((assertion) => assertion.kind === 'resource-display-projection')
          .map((assertion) => `${entry.suite.id}/${item.scenario.id}/${assertion.id}`),
      ),
    );
    expect(retired).toEqual([]);
  });
});
