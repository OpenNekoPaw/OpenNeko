import path from 'node:path';
import type { AutomationProviderOperation } from '@neko/automation-contracts';
import type { AutomationMcpToolDefinition } from '@neko/automation-node';
import {
  createDesktopBrowserUseMcpClientFactory,
  type DesktopBrowserUseMcpClientFactory,
} from './desktop-browser-use-mcp-client-factory';
import {
  createDesktopCuaDriverMcpClientFactory,
  type DesktopCuaDriverMcpClientFactory,
} from './desktop-cua-driver-mcp-client-factory';
import type { DesktopAutomationLocalRuntimeResolution } from './desktop-automation-local-runtime-host';

type InspectableMcpFactory = Pick<DesktopBrowserUseMcpClientFactory, 'inspectProvider'>;

export function createDesktopAutomationLocalRuntimeProviderInspector(options: {
  readonly storageRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly createBrowserFactory?: (input: {
    readonly executablePath: string;
    readonly browserExecutablePath: string;
    readonly storageRoot: string;
  }) => Pick<DesktopBrowserUseMcpClientFactory, 'inspectProvider'>;
  readonly createCuaFactory?: (input: {
    readonly appBundlePath: string;
    readonly executablePath: string;
    readonly storageRoot: string;
    readonly platform: NodeJS.Platform;
  }) => Pick<DesktopCuaDriverMcpClientFactory, 'inspectProvider'>;
}): (
  input: DesktopAutomationLocalRuntimeResolution,
  signal?: AbortSignal,
) => Promise<{
  readonly server: { readonly name: string };
  readonly operations: readonly AutomationProviderOperation[];
}> {
  const platform = options.platform ?? process.platform;
  const createBrowserFactory =
    options.createBrowserFactory ??
    ((input) =>
      createDesktopBrowserUseMcpClientFactory({
        runtime: {
          executablePath: input.executablePath,
          browserExecutablePath: input.browserExecutablePath,
        },
        storageRoot: input.storageRoot,
      }));
  const createCuaFactory =
    options.createCuaFactory ??
    ((input) =>
      createDesktopCuaDriverMcpClientFactory({
        runtime: {
          appBundlePath: input.appBundlePath,
          executablePath: input.executablePath,
        },
        storageRoot: input.storageRoot,
        platform: input.platform,
      }));

  return async (input, signal) => {
    let factory: InspectableMcpFactory;
    switch (input.sourceId) {
      case 'browser-use.observe.local': {
        const executablePath = requireAsset(input, 'provider-runtime');
        const browserExecutablePath = requireAsset(input, 'browser-executable');
        factory = createBrowserFactory({
          executablePath,
          browserExecutablePath,
          storageRoot: path.join(options.storageRoot, 'browser-use'),
        });
        break;
      }
      case 'computer-use.observe.local': {
        const appBundlePath = requireAsset(input, 'provider-runtime');
        factory = createCuaFactory({
          appBundlePath,
          executablePath: path.join(appBundlePath, 'Contents', 'MacOS', 'cua-driver'),
          storageRoot: path.join(options.storageRoot, 'cua-driver'),
          platform,
        });
        break;
      }
      default:
        throw new Error(
          `Desktop Automation local runtime source '${input.sourceId}' is unavailable.`,
        );
    }
    const inspection = await factory.inspectProvider(signal);
    return Object.freeze({
      server: Object.freeze({ name: inspection.server.name }),
      operations: Object.freeze(inspection.tools.map(projectOperation)),
    });
  };
}

function requireAsset(
  input: DesktopAutomationLocalRuntimeResolution,
  key: 'provider-runtime' | 'browser-executable',
): string {
  const value = input.assets[key];
  if (!value) {
    throw new Error(`Desktop Automation local runtime asset '${key}' is unavailable.`);
  }
  return value;
}

function projectOperation(tool: AutomationMcpToolDefinition): AutomationProviderOperation {
  return Object.freeze({
    name: tool.name,
    inputSchema: tool.inputSchema,
    annotations: Object.freeze({
      ...(tool.annotations?.readOnlyHint === undefined
        ? {}
        : { readOnlyHint: tool.annotations.readOnlyHint }),
      ...(tool.annotations?.destructiveHint === undefined
        ? {}
        : { destructiveHint: tool.annotations.destructiveHint }),
    }),
  });
}
