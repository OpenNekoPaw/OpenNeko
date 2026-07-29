import * as vscode from 'vscode';

import {
  createCapabilityContribution,
  type CapabilityContribution,
} from '../kernel/capability-contribution';
import type {
  CapabilityDiagnostic,
  CapabilityState,
  LazyCapability,
  RegistrationOwner,
} from '../kernel/types';

export interface VSCodeCapabilityContributionOptions<TValue> {
  readonly capability: LazyCapability<TValue>;
  readonly owner: RegistrationOwner;
  readonly contextKey: `neko.capability.${string}`;
  readonly label: string;
}

export async function createVSCodeCapabilityContribution<TValue>(
  options: VSCodeCapabilityContributionOptions<TValue>,
): Promise<CapabilityContribution<TValue>> {
  return createCapabilityContribution({
    capability: options.capability,
    owner: options.owner,
    availability: {
      project: (state) => projectState(options.contextKey, state),
      reportProjectionFailure: async (error, state) => {
        await vscode.window.showErrorMessage(
          `OpenNeko could not project ${options.label} capability state ${state.status}: ${errorMessage(error)}`,
        );
      },
    },
    reportUnavailable: async (diagnostic) => {
      await vscode.window.showErrorMessage(formatUnavailableDiagnostic(options.label, diagnostic));
    },
  });
}

async function projectState(
  contextKey: `neko.capability.${string}`,
  state: CapabilityState,
): Promise<void> {
  await Promise.all([
    vscode.commands.executeCommand('setContext', `${contextKey}.status`, state.status),
    vscode.commands.executeCommand(
      'setContext',
      `${contextKey}.available`,
      state.status !== 'unavailable' && state.status !== 'disposed',
    ),
  ]);
}

function formatUnavailableDiagnostic(label: string, diagnostic: CapabilityDiagnostic): string {
  return (
    `${label} is unavailable [${diagnostic.capabilityId}/${diagnostic.code}]. ` +
    `${diagnostic.message} Cause: ${diagnostic.causalChain.join(' -> ')}`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
