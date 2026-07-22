import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  EXTERNAL_PROCESSOR_SCHEMA,
  EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND,
  NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND,
  type ExternalProcessorManifest,
} from '@neko-agent/types';
import {
  ExternalProcessorRegistryService,
  type ExternalProcessorRegistryServiceFs,
} from '../externalProcessorRegistryService';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('ExternalProcessorRegistryService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(vscode.commands.registerCommand).mockClear();
    vi.mocked(vscode.commands.executeCommand).mockClear();
  });

  it('refreshes project and personal processors into one registry', async () => {
    mockWorkspace('/workspace/project');
    const projectManifestPath = '/workspace/project/.neko/processors/project.neko-processor.json';
    const personalRegistryPath = '/home/.neko/processors/registry.json';
    const personalManifestPath = '/home/.neko/processors/personal.neko-processor.json';
    const fs = createMemoryFs({
      dirs: {
        '/workspace/project/.neko/processors': ['project.neko-processor.json'],
      },
      files: {
        [projectManifestPath]: JSON.stringify(processorManifest({ id: 'project-upscale' })),
        [personalRegistryPath]: JSON.stringify({
          version: 1,
          entries: [
            {
              id: 'personal-upscale',
              manifestPath: '${NEKO_HOME}/processors/personal.neko-processor.json',
              enabled: true,
            },
          ],
        }),
        [personalManifestPath]: JSON.stringify(processorManifest({ id: 'personal-upscale' })),
      },
    });
    const service = createService({ fs });

    const result = await service.refresh();

    expect(result.diagnostics).toEqual([]);
    expect(service.registry.list({ includeDisabled: true }).processors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'project-upscale',
          sourceScope: 'project',
          locationRef: '.neko/processors/project.neko-processor.json',
        }),
        expect.objectContaining({
          id: 'personal-upscale',
          sourceScope: 'personal',
          enabled: true,
          locationRef: '${NEKO_HOME}/processors/personal.neko-processor.json',
        }),
      ]),
    );
  });

  it('registers refresh and extension contribution lifecycle commands', async () => {
    const service = createService();

    const commands = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.map(([command]) => command);

    expect(commands).toEqual(
      expect.arrayContaining([
        NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND,
        NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND,
      ]),
    );
    service.dispose();
  });

  it('removes stale project registrations when a manifest file disappears', async () => {
    mockWorkspace('/workspace/project');
    const fs = createMutableMemoryFs({
      dirs: {
        '/workspace/project/.neko/processors': ['project.neko-processor.json'],
      },
      files: {
        '/workspace/project/.neko/processors/project.neko-processor.json': JSON.stringify(
          processorManifest({ id: 'project-upscale' }),
        ),
      },
    });
    const service = createService({ fs });
    await service.refresh();
    expect(service.registry.resolve('project-upscale')).toEqual(
      expect.objectContaining({ id: 'project-upscale' }),
    );

    fs.setDir('/workspace/project/.neko/processors', []);
    await service.refresh();

    expect(service.registry.resolve('project-upscale')).toEqual(
      expect.objectContaining({
        code: 'disabled-processor',
        message: 'Processor "project-upscale" is not registered.',
      }),
    );
  });

  it('registers extension contributions through Host registry and disposes them', () => {
    const service = createService();

    const registration = service.registerExtensionContribution({
      extensionId: 'neko.neko-tools',
      contributionId: 'upscale',
      trustLevel: 'community',
      manifest: processorManifest({ id: 'extension-upscale' }),
    });

    expect(service.registry.resolve('extension-upscale')).toEqual(
      expect.objectContaining({
        registrationId: 'extension:neko.neko-tools:extension-upscale',
        sourceScope: 'extension',
        trustLevel: 'community',
      }),
    );

    registration.dispose();

    expect(service.registry.resolve('extension-upscale')).toEqual(
      expect.objectContaining({ code: 'disabled-processor' }),
    );
  });
});

function createService(
  options: {
    readonly fs?: ExternalProcessorRegistryServiceFs;
  } = {},
): ExternalProcessorRegistryService {
  return new ExternalProcessorRegistryService({
    context: { subscriptions: [] } as unknown as vscode.ExtensionContext,
    homeDir: '/home',
    fs: options.fs ?? createMemoryFs(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  });
}

function mockWorkspace(root: string): void {
  vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([
    { uri: { fsPath: root } as vscode.Uri, name: 'fixture', index: 0 },
  ]);
}

function createMemoryFs(
  input: {
    readonly files?: Record<string, string>;
    readonly dirs?: Record<string, readonly string[]>;
  } = {},
): ExternalProcessorRegistryServiceFs {
  return {
    async readFile(filePath) {
      const value = input.files?.[filePath];
      if (value === undefined) {
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      }
      return value;
    },
    async readdir(dirPath) {
      const entries = input.dirs?.[dirPath];
      if (!entries) {
        throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: 'ENOENT' });
      }
      return entries.map((name) => ({
        name,
        isDirectory: () => false,
        isFile: () => true,
      }));
    },
  };
}

function createMutableMemoryFs(
  input: {
    readonly files?: Record<string, string>;
    readonly dirs?: Record<string, readonly string[]>;
  } = {},
): ExternalProcessorRegistryServiceFs & {
  setDir(dirPath: string, entries: readonly string[]): void;
} {
  const files = { ...(input.files ?? {}) };
  const dirs: Record<string, readonly string[]> = { ...(input.dirs ?? {}) };
  return {
    setDir(dirPath, entries) {
      dirs[dirPath] = entries;
    },
    async readFile(filePath) {
      const value = files[filePath];
      if (value === undefined) {
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      }
      return value;
    },
    async readdir(dirPath) {
      const entries = dirs[dirPath];
      if (!entries) {
        throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: 'ENOENT' });
      }
      return entries.map((name) => ({
        name,
        isDirectory: () => false,
        isFile: () => true,
      }));
    },
  };
}

function processorManifest(input: { readonly id: string }): ExternalProcessorManifest {
  return {
    schema: EXTERNAL_PROCESSOR_SCHEMA,
    schemaVersion: EXTERNAL_PROCESSOR_SCHEMA_VERSION,
    id: input.id,
    kind: 'external-processor',
    displayName: input.id,
    version: '1.0.0',
    entry: {
      executable: '${TOOLS}/upscale',
      args: ['-i', '${input.image}', '-o', '${output.image}'],
    },
    inputs: {
      image: { accepts: ['image/*'], required: true },
    },
    outputs: {
      image: { produces: ['image/png'], ownership: 'candidate', pathHint: 'result.png' },
    },
    policy: {
      requiresApproval: true,
      allowNetwork: false,
      allowedInputRoots: ['workspace', 'mediaLibrary'],
      allowedOutputOwnerships: ['candidate'],
      timeoutMs: 120_000,
    },
  };
}
