import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';
import { runV2Case } from './run-v2-case.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const SKILL_FILE = `---
name: eval-v2-created-skill
description: Evaluation v2 created portable Skill.
---

# Evaluation V2 Created Skill

Use canonical portable Skill guidance.
`;
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function selection() {
  return selectSuiteCases(await discoverSuites(), {
    suiteId: 'skill.evaluation-artifact-author',
    caseId: 'create-portable-skill-artifact',
  })[0];
}

function pilotFacts(identity) {
  return {
    model: { providerId: 'openai', modelId: 'gpt-5' },
    configuration: {
      digest: HASH,
      runtime: {
        temperature: 0.7,
        maxTokens: 8192,
        thinkingBudget: 0,
        outputFormat: 'text',
      },
      chat: { providerId: 'openai', modelId: 'gpt-5' },
      modelPurposes: {},
    },
    runtimeErrors: [],
    idle: { fullyIdle: true },
    turns: [
      { id: 'u1', role: 'user', source: 'user', content: 'create the Skill' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Created successfully.',
        toolCalls: [
          {
            id: 'create-skill-1',
            name: 'CreateSkill',
            status: 'success',
            resultObservation: 'available',
            diagnostics: [],
          },
        ],
      },
    ],
    skillReceipts: [
      {
        toolCallId: 'read-skill-1',
        skillName: identity.name,
        source: identity.source,
        fingerprint: identity.fingerprint,
        locatorKind: 'skill',
      },
    ],
    promptComposition: [],
    tasks: [],
    continuations: [],
    artifacts: [],
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    retries: { taskRetryCount: 0, tasksWithRetries: 0 },
    evidenceCompleteness: {
      runtimeErrors: { limit: 256, droppedCount: 0 },
      turns: { limit: 512, droppedCount: 0 },
      turnToolCalls: { limit: 256, droppedCount: 0 },
      skillReceipts: { limit: 128, droppedCount: 0 },
      tasks: { limit: 512, droppedCount: 0 },
      continuations: { limit: 512, droppedCount: 0 },
      promptComposition: { limit: 256, droppedCount: 0 },
      artifacts: { limit: 512, droppedCount: 0 },
    },
  };
}

describe('v2 Skill and artifact pilot', () => {
  it('runs the migrated Skill path, contained artifact check, and report pipeline', async () => {
    const outputRoot = await createOutputRoot();
    const selected = await selection();
    const spawn = vi.fn(() => ({ stdout: null }));
    const run = await runV2Case(selected, {
      outputRoot,
      runId: 'run-skill-artifact-pass',
      spawn,
      runDriver: async () => {
        await writeExpectedSkillFile(spawn);
        return pilotFacts(selected.suite.target.identity);
      },
    });

    expect(run.outcome).toBe('pass');
    expect(run.result.assertions.every((assertion) => assertion.status === 'pass')).toBe(true);
    await expect(fs.readFile(run.files.artifactManifest, 'utf8')).resolves.toContain(
      '.agents/skills/eval-v2-created-skill/SKILL.md',
    );
  });

  it.each([
    [
      'Skill receipt',
      (selected, facts) => {
        facts.skillReceipts[0].fingerprint = HASH;
      },
    ],
    [
      'model binding',
      (_selected, facts) => {
        facts.model.modelId = 'fallback-model';
      },
    ],
    [
      'task result observation',
      (selected, facts) => {
        selected.scenario.assertions.push({
          id: 'task-terminal-test',
          kind: 'task-terminal',
          taskType: 'skill-authoring',
          status: 'completed',
          evidenceRef: 'tool-facts',
        });
        facts.tasks.push({
          id: 'task-1',
          type: 'skill-authoring',
          status: 'completed',
          resultObservation: { status: 'missing', observationIds: [] },
          diagnostics: [],
        });
      },
    ],
    [
      'artifact validation',
      (_selected, _facts, control) => {
        control.writeArtifact = false;
      },
    ],
    [
      'no-fallback',
      (_selected, facts) => {
        facts.turns[1].toolCalls.push({ id: 'write-1', name: 'Write' });
      },
    ],
  ])('fails despite a success answer when %s evidence is wrong', async (_label, mutate) => {
    const outputRoot = await createOutputRoot();
    const selected = await selection();
    const facts = pilotFacts(selected.suite.target.identity);
    const control = { writeArtifact: true };
    mutate(selected, facts, control);
    const spawn = vi.fn(() => ({ stdout: null }));
    const run = await runV2Case(selected, {
      outputRoot,
      runId: `run-skill-artifact-fail-${_label.replace(/\s+/gu, '-').toLowerCase()}`,
      spawn,
      runDriver: async () => {
        if (control.writeArtifact) await writeExpectedSkillFile(spawn);
        return facts;
      },
    });

    expect(facts.turns.at(-1).content).toBe('Created successfully.');
    expect(run.outcome).toBe('case-fail');
    expect(run.result.assertions.some((assertion) => assertion.status === 'fail')).toBe(true);
  });
});

async function createOutputRoot() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-skill-pilot-'));
  temporaryDirectories.push(root);
  return root;
}

async function writeExpectedSkillFile(spawn) {
  const workspace = spawn.mock.calls[0][1].at(-1);
  const directory = join(workspace, '.agents/skills/eval-v2-created-skill');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, 'SKILL.md'), SKILL_FILE);
}
