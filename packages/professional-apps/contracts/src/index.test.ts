import { describe, expect, it } from 'vitest';

import {
  parseProfessionalApplicationBinding,
  parseProfessionalApplicationHandoffIntent,
  parseProfessionalApplicationManagementProjection,
  parseProfessionalApplicationProfile,
} from './index';

const profile = {
  id: 'comfyui',
  name: 'ComfyUI',
  description: 'Local node workflow platform.',
  category: 'workflow-platform',
  supportedPlatforms: ['macos'],
  applicationIdentities: [
    { platform: 'macos', kind: 'bundle-id', value: 'com.todesktop.241012ess7yxs0e' },
  ],
  officialDownloadUrl: 'https://github.com/Comfy-Org/Comfy-Desktop/releases',
  configurable: { applicationLocator: true, endpoint: true, defaultWorkflow: true },
  operations: [
    {
      id: 'comfyui.run-workflow',
      label: 'Run workflow',
      kind: 'run-workflow',
      transport: 'api',
      effect: 'execute',
      requiresApproval: true,
      verification: 'provider-state',
      inputMimeTypes: [],
    },
  ],
} as const;

describe('professional application contracts', () => {
  it('accepts a qualified profile without creating Skill or MCP state', () => {
    expect(parseProfessionalApplicationProfile(profile)).toEqual(profile);
    expect(parseProfessionalApplicationProfile(profile)).not.toHaveProperty('skills');
    expect(parseProfessionalApplicationProfile(profile)).not.toHaveProperty('mcp');
    expect(() =>
      parseProfessionalApplicationProfile({
        ...profile,
        operations: [{ ...profile.operations[0], kind: 'install' }],
      }),
    ).toThrow(/operation kind/u);
  });

  it('rejects unsupported application and internal generation fields', () => {
    expect(() => parseProfessionalApplicationProfile({ ...profile, plugins: [] })).toThrow(
      /unsupported fields/u,
    );
    const forbiddenInternalField = ['schema', 'Version'].join('');
    expect(() =>
      parseProfessionalApplicationProfile({ ...profile, [forbiddenInternalField]: 1 }),
    ).toThrow(/unsupported fields/u);
  });

  it('accepts only loopback endpoints and variable-backed paths', () => {
    expect(
      parseProfessionalApplicationBinding({
        integrationId: 'comfyui',
        applicationLocator: { kind: 'variable-path', path: '${APPLICATIONS}/Comfy Desktop.app' },
        endpoint: 'http://127.0.0.1:8188',
        launchPreference: 'reuse-qualified',
      }),
    ).toMatchObject({ endpoint: 'http://127.0.0.1:8188' });

    expect(() =>
      parseProfessionalApplicationBinding({
        integrationId: 'comfyui',
        endpoint: 'https://remote.example.com',
        launchPreference: 'reuse-qualified',
      }),
    ).toThrow(/loopback/u);
    expect(() =>
      parseProfessionalApplicationBinding({
        integrationId: 'comfyui',
        endpoint: 'http://127.0.0.1:8188/untrusted-base',
        launchPreference: 'reuse-qualified',
      }),
    ).toThrow(/API root/u);
    expect(() =>
      parseProfessionalApplicationBinding({
        integrationId: 'comfyui',
        applicationLocator: { kind: 'variable-path', path: '/Applications/Comfy Desktop.app' },
        launchPreference: 'reuse-qualified',
      }),
    ).toThrow(/\$\{VAR\}/u);
    expect(() =>
      parseProfessionalApplicationBinding({
        integrationId: 'comfyui',
        applicationLocator: { kind: 'variable-path', path: '${APPLICATIONS}/../Other.app' },
        launchPreference: 'reuse-qualified',
      }),
    ).toThrow(/\$\{VAR\}/u);
  });

  it('rejects readiness operations not qualified by the exact profile', () => {
    expect(() =>
      parseProfessionalApplicationManagementProjection({
        identity: { windowId: 'window-1' },
        items: [
          {
            profile,
            readiness: {
              integrationId: 'comfyui',
              state: 'ready',
              availableOperationIds: ['comfyui.unreviewed'],
              diagnostics: [],
            },
          },
        ],
      }),
    ).toThrow(/not qualified/u);
  });

  it('requires a canonical ContentLocator and exact source identity for handoff', () => {
    expect(
      parseProfessionalApplicationHandoffIntent({
        handoffId: 'handoff-1',
        integrationId: 'comfyui',
        operationId: 'comfyui.send-input',
        source: {
          kind: 'candidate',
          ownerId: 'generation',
          resourceId: 'image-1',
          candidateId: 'candidate-1',
          mimeType: 'image/png',
        },
        locator: { file: { authority: 'workspace', path: 'neko/generated/image-1.png' } },
      }),
    ).toMatchObject({ handoffId: 'handoff-1' });

    expect(() =>
      parseProfessionalApplicationHandoffIntent({
        handoffId: 'handoff-1',
        integrationId: 'comfyui',
        operationId: 'comfyui.send-input',
        source: {
          kind: 'candidate',
          ownerId: 'generation',
          resourceId: 'image-1',
          candidateId: 'candidate-1',
          mimeType: 'image/png',
        },
        locator: { path: '/tmp/image-1.png' },
      }),
    ).toThrow(/ContentLocator/u);
  });
});
