import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createPackage } from '@electron/asar';

import {
  findRetiredAgentBuiltOutputFindings,
  findRetiredAgentEvaluationFindings,
  findRetiredAgentPathFindings,
  validateDesktopAgentExecutionSurface,
  validateRetiredAgentArtifactSources,
} from './check-neko-agent-boundaries.mjs';

test('accepts a Desktop Agent surface that delegates only through package-owned ACP', () => {
  assert.deepEqual(
    validateDesktopAgentExecutionSurface({
      sources: {
        'apps/neko-desktop/src/main/desktop-dsh-runtime.ts':
          "import { DshAcpApplicationClient } from '@neko/agent-runtime/acp';",
      },
      manifests: {
        'apps/neko-desktop/package.json': {
          dependencies: { '@neko/agent-runtime': 'workspace:*' },
        },
      },
    }),
    [],
  );
});

test('rejects Pi, SDK, embedded Cordis, RunAsNode and retired direct bridges', () => {
  const findings = validateDesktopAgentExecutionSurface({
    sources: {
      'apps/neko-desktop/src/main/desktop-dsh-runtime.ts': [
        "import '@deepseek-ai/cordis';",
        "import '@deepseek-ai/dsh-sdk-client';",
        'DeepSeekHarness',
        'deepseek_harness',
        'ELECTRON_RUN_AS_NODE',
        'process.execPath',
        'ctx.agents.create()',
        'agentLaunch confirmTool agentAutomation',
      ].join('\n'),
    },
    manifests: {
      'apps/neko-desktop/package.json': {
        dependencies: {
          '@deepseek-ai/cordis': '4.0.1',
          '@deepseek-ai/dsh-sdk-client': '0.1.0',
          '@mariozechner/pi-agent-core': '1.0.0',
        },
      },
    },
  });

  for (const expected of [
    'embedded Cordis',
    'DSH TypeScript SDK',
    'DSH SDK client',
    'DSH Python SDK',
    'Electron RunAsNode',
    'Electron executable as Node',
    'embedded DSH Agent runtime',
    'retired direct runtime bridge',
    '@mariozechner/pi-agent-core',
  ]) {
    assert.ok(
      findings.some((finding) => finding.includes(expected)),
      expected,
    );
  }
});

test('rejects retired Agent markers in Evaluation and built artifacts', async () => {
  assert.deepEqual(
    validateRetiredAgentArtifactSources({
      'current.js': 'dshSessions.submit(conversationId, input)',
    }),
    [],
  );
  assert.deepEqual(
    validateRetiredAgentArtifactSources({
      'retired.js': 'agentLaunch(); draft.input.submit; messageQueue.push(input);',
    }),
    [
      "retired.js: contains retired Agent launch bridge marker 'agentLaunch'",
      "retired.js: contains retired Draft submit operation marker 'draft.input.submit'",
      "retired.js: contains retired OpenNeko queue facts marker 'messageQueue'",
    ],
  );

  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-artifact-boundary-'));
  try {
    const evaluationRoot = join(root, 'scripts/agent-eval');
    await mkdir(evaluationRoot, { recursive: true });
    await writeFile(join(evaluationRoot, 'workflow.mjs'), 'export const path = "dsh-session";');
    await writeFile(join(evaluationRoot, 'poison.test.mjs'), 'export const old = "pi-runtime";');
    assert.deepEqual(await findRetiredAgentEvaluationFindings(root), {
      checkedFiles: 1,
      findings: [],
    });

    await writeFile(join(evaluationRoot, 'workflow.mjs'), 'export const old = "Pi runtime";');
    assert.deepEqual((await findRetiredAgentEvaluationFindings(root)).findings, [
      "scripts/agent-eval/workflow.mjs: contains retired Pi authority marker 'Pi '",
    ]);

    await writeFile(join(evaluationRoot, 'workflow.mjs'), 'export const old = "draft-bind";');
    assert.deepEqual((await findRetiredAgentEvaluationFindings(root)).findings, [
      "scripts/agent-eval/workflow.mjs: contains retired Draft binding step marker 'draft-bind'",
    ]);

    const buildRoot = join(root, 'apps/neko-desktop/.vite/build');
    const rendererRoot = join(root, 'apps/neko-desktop/dist/assets');
    await mkdir(buildRoot, { recursive: true });
    await mkdir(rendererRoot, { recursive: true });
    await writeFile(join(buildRoot, 'main.cjs'), 'const runtime = "pi-runtime";');
    await writeFile(join(rendererRoot, 'main-root-current.js'), 'dshSessions.submit();');

    const asarSource = join(root, 'asar-source');
    const packagedBuild = join(asarSource, '.vite/build');
    const packagedRenderer = join(asarSource, '.vite/renderer/main_window/assets');
    await mkdir(packagedBuild, { recursive: true });
    await mkdir(packagedRenderer, { recursive: true });
    await writeFile(join(packagedBuild, 'preload.cjs'), 'const old = "confirmTool";');
    await writeFile(join(packagedRenderer, 'main-root-fixture.js'), 'dshSessions.submit();');
    const asarPath = join(
      root,
      'apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app/Contents/Resources/app.asar',
    );
    await mkdir(dirname(asarPath), { recursive: true });
    await createPackage(asarSource, asarPath);

    const built = await findRetiredAgentBuiltOutputFindings(root);
    assert.equal(built.checkedFiles, 4);
    assert.deepEqual(built.findings, [
      "apps/neko-desktop/.vite/build/main.cjs: contains retired Pi Evaluation assertion marker 'pi-runtime'",
      "apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app/Contents/Resources/app.asar/.vite/build/preload.cjs: contains retired Tool confirmation bridge marker 'confirmTool'",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects restored retired Agent authorities while accepting empty retired directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-boundary-'));
  try {
    await mkdir(join(root, 'packages/agent/runtime/src/pi'), { recursive: true });
    assert.deepEqual(await findRetiredAgentPathFindings(root), []);

    await writeFile(
      join(root, 'packages/agent/runtime/src/pi/conversation-runtime.ts'),
      'export {};',
    );
    await mkdir(join(root, 'packages/agent/contracts/src'), { recursive: true });
    await writeFile(join(root, 'packages/agent/contracts/src/agent-draft-submit.ts'), 'export {};');
    await writeFile(join(root, 'packages/agent/contracts/src/external-research.ts'), 'export {};');
    await writeFile(join(root, 'packages/agent/contracts/src/mcp.ts'), 'export {};');
    for (const retiredContract of [
      'agent-capability-diagnostics.ts',
      'agent-capability-lifecycle.ts',
      'agent-capability.ts',
      'capability.ts',
      'domain-routing.ts',
      'perception-tool.ts',
      'plugin-command-contract.ts',
      'plugin-slash-command.ts',
      'portable-skill.ts',
      'prompt-fragment.ts',
      'reference-contributor.ts',
      'resource-display-projection.ts',
      'skill.ts',
    ]) {
      await writeFile(join(root, 'packages/agent/contracts/src', retiredContract), 'export {};');
    }
    await writeFile(
      join(root, 'packages/agent/contracts/src/conversation-projection.ts'),
      'export {};',
    );
    await mkdir(join(root, 'packages/agent/runtime/src/runtime/projection'), { recursive: true });
    await writeFile(
      join(root, 'packages/agent/runtime/src/runtime/projection/conversation-projection-store.ts'),
      'export {};',
    );
    await mkdir(join(root, 'packages/host/src/settings/types'), { recursive: true });
    await writeFile(join(root, 'packages/host/src/settings/mcp-server-config.ts'), 'export {};');
    await writeFile(join(root, 'packages/host/src/settings/types/config.ts'), 'export {};');
    await mkdir(join(root, 'apps/neko-desktop/resources/extensions/plugins/retired'), {
      recursive: true,
    });
    await writeFile(
      join(root, 'apps/neko-desktop/resources/extensions/plugins/retired/plugin.json'),
      '{}',
    );
    assert.deepEqual(await findRetiredAgentPathFindings(root), [
      'packages/agent/contracts/src/mcp.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/external-research.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/agent-capability-diagnostics.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/agent-capability-lifecycle.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/agent-capability.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/agent-draft-submit.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/capability.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/conversation-projection.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/domain-routing.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/perception-tool.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/plugin-command-contract.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/plugin-slash-command.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/portable-skill.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/prompt-fragment.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/reference-contributor.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/resource-display-projection.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/skill.ts: retired Agent path must remain deleted.',
      'packages/host/src/settings/mcp-server-config.ts: retired Agent path must remain deleted.',
      'packages/host/src/settings/types/config.ts: retired Agent path must remain deleted.',
      'apps/neko-desktop/resources/extensions/plugins: retired Agent directory must remain empty.',
      'packages/agent/runtime/src/pi: retired Agent directory must remain empty.',
      'packages/agent/runtime/src/runtime/projection: retired Agent directory must remain empty.',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
