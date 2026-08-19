import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  findRetiredAgentPathFindings,
  validateDesktopAgentExecutionSurface,
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
    assert.ok(findings.some((finding) => finding.includes(expected)), expected);
  }
});

test('rejects restored retired Agent authorities while accepting empty retired directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-boundary-'));
  try {
    await mkdir(join(root, 'packages/agent/runtime/src/pi'), { recursive: true });
    assert.deepEqual(await findRetiredAgentPathFindings(root), []);

    await writeFile(join(root, 'packages/agent/runtime/src/pi/conversation-runtime.ts'), 'export {};');
    await mkdir(join(root, 'packages/agent/contracts/src'), { recursive: true });
    await writeFile(join(root, 'packages/agent/contracts/src/mcp.ts'), 'export {};');
    await writeFile(join(root, 'packages/agent/contracts/src/conversation-projection.ts'), 'export {};');
    await mkdir(join(root, 'packages/agent/runtime/src/runtime/projection'), { recursive: true });
    await writeFile(
      join(root, 'packages/agent/runtime/src/runtime/projection/conversation-projection-store.ts'),
      'export {};',
    );
    assert.deepEqual(await findRetiredAgentPathFindings(root), [
      'packages/agent/contracts/src/mcp.ts: retired Agent path must remain deleted.',
      'packages/agent/contracts/src/conversation-projection.ts: retired Agent path must remain deleted.',
      'packages/agent/runtime/src/pi: retired Agent directory must remain empty.',
      'packages/agent/runtime/src/runtime/projection: retired Agent directory must remain empty.',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
