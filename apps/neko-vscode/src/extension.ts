import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import {
  EmbeddedFeatureRegistry,
  installEmbeddedFeatureRegistry,
} from '@neko/shared/vscode/extension';
import * as vscode from 'vscode';

import {
  createScopedExtensionContext,
  type ScopedExtensionContext,
} from './scoped-extension-context';

const requireFeature = createRequire(__filename);

const FEATURE_ORDER = Object.freeze([
  'neko-engine',
  'neko-tools',
  'neko-preview',
  'neko-assets',
  'neko-cut',
  'neko-canvas',
  'neko-agent',
]);

const FEATURE_IDS = FEATURE_ORDER.map((packageName) => `neko.${packageName}`);

interface EmbeddedFeatureModule {
  activate(context: vscode.ExtensionContext): Promise<unknown> | unknown;
  deactivate?(): Promise<void> | void;
}

interface ActivatedFeature {
  readonly id: string;
  readonly module: EmbeddedFeatureModule;
  readonly scopedContext: ScopedExtensionContext;
}

const activatedFeatures: ActivatedFeature[] = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await assertNoStandaloneFeatureConflicts();

  const registry = new EmbeddedFeatureRegistry();
  context.subscriptions.push(installEmbeddedFeatureRegistry(registry));

  for (const packageName of FEATURE_ORDER) {
    const id = `neko.${packageName}`;
    const featureUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'features', packageName);
    const scopedContext = createScopedExtensionContext(context, {
      featureId: id,
      featureUri,
      joinPath: vscode.Uri.joinPath,
    });
    const featureModule = loadFeatureModule(context, packageName);
    const packageJSON = readFeatureManifest(context, packageName);
    activatedFeatures.push({ id, module: featureModule, scopedContext });
    context.subscriptions.push(
      registry.register({
        id,
        extensionUri: featureUri,
        packageJSON,
        activate: () => featureModule.activate(scopedContext.context),
      }),
    );
  }

  await registry.activateAll(FEATURE_IDS);
}

export async function deactivate(): Promise<void> {
  const errors: unknown[] = [];
  for (const feature of [...activatedFeatures].reverse()) {
    try {
      await feature.module.deactivate?.();
    } catch (error) {
      errors.push(new Error(`Failed to deactivate ${feature.id}`, { cause: error }));
    }
    try {
      feature.scopedContext.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  activatedFeatures.length = 0;
  if (errors.length > 0) {
    throw new AggregateError(errors, 'OpenNeko embedded feature deactivation failed.');
  }
}

async function assertNoStandaloneFeatureConflicts(): Promise<void> {
  const installed = FEATURE_IDS.filter((id) => vscode.extensions.getExtension(id));
  if (installed.length === 0) return;

  const action = await vscode.window.showErrorMessage(
    `OpenNeko now contains all product features in one extension. Remove these separately installed feature extensions and reload VS Code: ${installed.join(', ')}. Workspace files and settings are not deleted; package-local UI state may reset.`,
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

function loadFeatureModule(
  context: vscode.ExtensionContext,
  packageName: string,
): EmbeddedFeatureModule {
  const path = context.asAbsolutePath(`dist/features/${packageName}/dist/extension.js`);
  const moduleValue: unknown = requireFeature(path);
  if (!isEmbeddedFeatureModule(moduleValue)) {
    throw new Error(`Embedded feature ${packageName} does not export activate(): ${path}`);
  }
  return moduleValue;
}

function readFeatureManifest(context: vscode.ExtensionContext, packageName: string): unknown {
  const path = context.asAbsolutePath(`dist/features/${packageName}/package.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isEmbeddedFeatureModule(value: unknown): value is EmbeddedFeatureModule {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof Reflect.get(value, 'activate') === 'function'
  );
}
