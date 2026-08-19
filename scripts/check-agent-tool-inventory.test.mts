import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { CANVAS_DSH_TOOL_NAME, CANVAS_DSH_TOOL_OPERATIONS } from '@neko/canvas-domain';
import { CUT_DSH_TOOL_NAME, CUT_DSH_TOOL_OPERATIONS } from '@neko/cut-domain';
import { GENERATION_DSH_TOOL_NAME, GENERATION_DSH_TOOL_OPERATIONS } from '@neko/generation';

const repositoryRoot = resolve(import.meta.dirname, '..');

interface AgentToolInventoryEntry {
  readonly tool: string;
  readonly operations: readonly string[];
  readonly registration: string;
  readonly schemaOwner: string;
  readonly validator: string;
  readonly permissionOwner: string;
  readonly authorizationOwner: string;
  readonly applicationService: string;
  readonly durableOwner: string;
}

test('production Agent Tool inventory matches every DSH plugin registration', async () => {
  const inventory = JSON.parse(
    await readFile(join(repositoryRoot, 'quality/agent-tool-inventory.json'), 'utf8'),
  ) as { readonly tools: readonly AgentToolInventoryEntry[] };
  assert.deepEqual(
    inventory.tools.map((entry) => [entry.tool, entry.operations]),
    [
      [GENERATION_DSH_TOOL_NAME, [...GENERATION_DSH_TOOL_OPERATIONS]],
      [CANVAS_DSH_TOOL_NAME, [...CANVAS_DSH_TOOL_OPERATIONS]],
      [CUT_DSH_TOOL_NAME, [...CUT_DSH_TOOL_OPERATIONS]],
    ],
  );

  const registrations = await findDshToolRegistrations(join(repositoryRoot, 'packages'));
  assert.deepEqual(registrations.sort(), inventory.tools.map((entry) => entry.registration).sort());
  for (const entry of inventory.tools) {
    for (const field of [entry.schemaOwner, entry.permissionOwner, entry.authorizationOwner]) {
      assert.equal(existsSync(join(repositoryRoot, field)), true, `${field} must exist`);
    }
    const schema = await readFile(join(repositoryRoot, entry.schemaOwner), 'utf8');
    assert.match(schema, new RegExp(`export function ${entry.validator}\\b`, 'u'));
    assert.ok(entry.applicationService.length > 0);
    assert.ok(entry.durableOwner.length > 0);
  }
});

test('retired Character and World capability providers cannot return as Agent Tools', async () => {
  const retiredPaths = [
    'packages/chara/src/application/character-authoring-capability-provider.ts',
    'packages/world/src/application/world-authoring-capability-provider.ts',
  ];
  for (const path of retiredPaths)
    assert.equal(existsSync(join(repositoryRoot, path)), false, path);

  const source = await Promise.all(
    [
      'packages/chara/src/application/index.ts',
      'packages/world/src/application/index.ts',
      'packages/agent/contracts/src/tool-names.ts',
    ].map((path) => readFile(join(repositoryRoot, path), 'utf8')),
  );
  assert.doesNotMatch(
    source.join('\n'),
    /AuthoringCapabilityProvider|TOOL_NAMES_CHARA|TOOL_NAMES_WORLD/u,
  );
  assert.doesNotMatch(source.join('\n'), /chara\.character\.fillDraft|world\.world\.fillDraft/u);
});

async function findDshToolRegistrations(directory: string): Promise<string[]> {
  const registrations: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      registrations.push(...(await findDshToolRegistrations(path)));
      continue;
    }
    if (!path.endsWith('/dsh-plugin/src/index.ts')) continue;
    if ((await readFile(path, 'utf8')).includes('ctx.tools.register')) {
      registrations.push(relative(repositoryRoot, path));
    }
  }
  return registrations;
}
