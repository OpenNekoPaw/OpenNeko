import * as vscode from 'vscode';

import { createOpenNekoAiHostRuntime, createOpenNekoCutHostRuntime } from './ai-host-runtime';
import { createVSCodeCapabilityContribution } from './adapters/vscode-capability-availability';
import { configureOpenNekoMediaRuntime } from './media-host-runtime';
import { HostKernel } from './kernel/host-kernel';
import { createLazyCapability } from './kernel/lazy-capability';
import { defineFeature, featureRef } from './kernel/types';
import {
  createFeatureRuntimeChildScope,
  createFeatureRuntimeScope,
  type FeatureRuntimeContext,
  type FeatureRuntimeScope,
  type StateNamespaceId,
} from './feature-runtime-context';
import { bootstrapNekoToolsExtension } from './features/tools/bootstrap';
import {
  activate as activatePreview,
  deactivate as deactivatePreview,
} from './features/preview/extension';
import {
  activate as activateAssets,
  deactivate as deactivateAssets,
} from './features/assets/extension';
import { activate as activateCut, deactivate as deactivateCut } from './features/cut/extension';
import {
  activate as activateCanvas,
  deactivate as deactivateCanvas,
} from './features/canvas/extension';
import {
  deactivate as deactivateAgent,
  startNekoAgentRuntime,
  type NekoAgentAiHostPort,
  type NekoAgentHostServices,
  type NekoAgentRuntime,
} from './features/agent';
import { registerLazyNekoAgentSurface } from './features/agent/lazy-surface';
import { verifyStateLayout } from './state-layout';

const RETIRED_ENGINE_COMMANDS = Object.freeze([
  'neko.engine.ensureFrameServer',
  'neko.engine.extractThumbnail',
  'neko.engine.probeInternal',
]);

const toolsRef = featureRef<void>('neko.tools');
const previewRef = featureRef<Awaited<ReturnType<typeof activatePreview>>>('neko.preview');
const assetsRef = featureRef<Awaited<ReturnType<typeof activateAssets>>>('neko.assets');
const cutRef = featureRef<Awaited<ReturnType<typeof activateCut>>>('neko.cut');
const canvasRef = featureRef<Awaited<ReturnType<typeof activateCanvas>>>('neko.canvas');
const agentRef = featureRef<ReturnType<typeof registerLazyNekoAgentSurface>>('neko.agent');

type NekoAgentStaticHostServices = Omit<NekoAgentHostServices, keyof NekoAgentAiHostPort>;

let kernel: HostKernel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (kernel) throw new Error('OpenNeko is already active.');
  await assertNoStandaloneFeatureConflicts();
  await verifyStateLayout(context.globalState);
  await configureOpenNekoMediaRuntime(context.extensionUri.fsPath);
  for (const command of RETIRED_ENGINE_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        throw new Error(
          `Retired media command ${command} cannot be used. The owning feature must use its Node/FFmpeg media port.`,
        );
      }),
    );
  }

  let agentStartInput:
    | {
        readonly context: FeatureRuntimeContext;
        readonly services: NekoAgentStaticHostServices;
      }
    | undefined;
  const agentRuntimeCapability = createLazyCapability({
    id: 'neko.capability.agent-runtime',
    dependencies: {},
    async start(owner, signal): Promise<NekoAgentRuntime> {
      const input = agentStartInput;
      if (!input) {
        throw new Error('Agent runtime capability was requested before its feature registered.');
      }
      const hostRuntime = await createOpenNekoAiHostRuntime();
      owner.add(hostRuntime);
      signal.throwIfAborted();
      const runtimeScope = createFeatureRuntimeChildScope(input.context, signal);
      owner.add(runtimeScope);
      const runtime = await startNekoAgentRuntime(runtimeScope.context, {
        ...hostRuntime.agent,
        ...input.services,
      });
      owner.add({ dispose: deactivateAgent });
      return runtime;
    },
  });
  const definitions = [
    defineFeature({
      ref: toolsRef,
      dependencies: {},
      async register({ owner, signal }) {
        const scoped = createFeatureContext(context, 'neko.neko-tools', 'neko-tools', signal);
        owner.add(scoped);
        const activation = bootstrapNekoToolsExtension(scoped.context);
        owner.add(activation);
        return { exports: undefined };
      },
    }),
    defineFeature({
      ref: previewRef,
      dependencies: {},
      async register({ owner, signal }) {
        const scoped = createFeatureContext(context, 'neko.neko-preview', 'neko-preview', signal);
        owner.add(scoped);
        const exports = await activatePreview(scoped.context);
        owner.add({ dispose: deactivatePreview });
        return { exports };
      },
    }),
    defineFeature({
      ref: assetsRef,
      dependencies: {},
      async register({ owner, signal }) {
        const scoped = createFeatureContext(context, 'neko.neko-assets', 'neko-assets', signal);
        owner.add(scoped);
        const exports = await activateAssets(scoped.context);
        owner.add({ dispose: deactivateAssets });
        return { exports };
      },
    }),
    defineFeature({
      ref: cutRef,
      dependencies: {},
      async register({ owner, signal }) {
        const scoped = createFeatureContext(context, 'neko.neko-cut', 'neko-cut', signal);
        owner.add(scoped);
        const cutHostRuntime = await createOpenNekoCutHostRuntime();
        owner.add(cutHostRuntime);
        const exports = await activateCut(scoped.context, cutHostRuntime.services);
        owner.add({ dispose: deactivateCut });
        return { exports };
      },
    }),
    defineFeature({
      ref: canvasRef,
      dependencies: {
        preview: previewRef,
        assets: assetsRef,
        cut: cutRef,
      },
      async register({ owner, signal }, { preview, assets, cut }) {
        const scoped = createFeatureContext(context, 'neko.neko-canvas', 'neko-canvas', signal);
        owner.add(scoped);
        const exports = await activateCanvas(scoped.context, {
          mediaRepresentation: assets.mediaRepresentation,
          previewVariants: preview,
          cut,
        });
        owner.add({ dispose: deactivateCanvas });
        return { exports };
      },
    }),
    defineFeature({
      ref: agentRef,
      dependencies: {
        assets: assetsRef,
        canvas: canvasRef,
      },
      async register({ owner, signal }, { assets, canvas }) {
        const scoped = createFeatureContext(context, 'neko.neko-agent', 'neko-agent', signal);
        owner.add(scoped);
        agentStartInput = {
          context: scoped.context,
          services: {
            canvas: canvas.api,
            internalCapabilityProviders: [...assets.agentCapabilities, canvas.agentCapability],
            isFeatureAvailable: isRetainedFeatureAvailable,
          },
        };
        const contribution = await createVSCodeCapabilityContribution({
          capability: agentRuntimeCapability,
          owner,
          contextKey: 'neko.capability.agent-runtime',
          label: 'OpenNeko Agent',
        });
        const exports = registerLazyNekoAgentSurface({
          context: scoped.context,
          capabilityId: agentRuntimeCapability.id,
          contribution,
        });
        return { exports };
      },
    }),
  ] as const;
  const nextKernel = new HostKernel(definitions, {
    capabilities: [agentRuntimeCapability],
  });
  kernel = nextKernel;
  try {
    await nextKernel.registerAll();
  } catch (error) {
    kernel = undefined;
    throw error;
  }
}

function isRetainedFeatureAvailable(featureId: string): boolean {
  return RETAINED_FEATURE_EXTENSION_IDS.has(featureId);
}

const RETAINED_FEATURE_EXTENSION_IDS = new Set([
  'neko.neko-tools',
  'neko.neko-preview',
  'neko.neko-assets',
  'neko.neko-cut',
  'neko.neko-canvas',
  'neko.neko-agent',
]);

export async function deactivate(): Promise<void> {
  const activeKernel = kernel;
  kernel = undefined;
  await activeKernel?.dispose();
}

function createFeatureContext(
  context: vscode.ExtensionContext,
  stateNamespaceId: StateNamespaceId,
  resourceDirectory: string,
  signal: AbortSignal,
): FeatureRuntimeScope {
  return createFeatureRuntimeScope(context, {
    stateNamespaceId,
    resourceUri: vscode.Uri.joinPath(context.extensionUri, 'dist', 'features', resourceDirectory),
    signal,
    joinPath: vscode.Uri.joinPath,
  });
}

async function assertNoStandaloneFeatureConflicts(): Promise<void> {
  const retiredFeatureIds = [
    'neko.neko-tools',
    'neko.neko-preview',
    'neko.neko-assets',
    'neko.neko-cut',
    'neko.neko-canvas',
    'neko.neko-agent',
    'neko.neko-engine',
  ];
  const installed = retiredFeatureIds.filter((id) => vscode.extensions.getExtension(id));
  if (installed.length === 0) return;

  const action = await vscode.window.showErrorMessage(
    `OpenNeko cannot run with separately installed product or retired feature extensions. Remove these extensions and reload VS Code: ${installed.join(', ')}. Workspace files and settings are not deleted; package-local UI state may reset.`,
    { modal: true },
    'Show Extensions',
  );
  if (action === 'Show Extensions') {
    await vscode.commands.executeCommand('workbench.extensions.search', '@installed neko');
  }
  throw new Error(
    `OpenNeko activation blocked by separately installed feature extensions: ${installed.join(', ')}`,
  );
}
