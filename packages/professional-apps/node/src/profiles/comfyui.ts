import {
  parseProfessionalApplicationProfile,
  type ProfessionalApplicationProfile,
} from '@neko/professional-apps-contracts';

export const COMFYUI_INTEGRATION_ID = 'comfyui';
export const COMFYUI_DEFAULT_LOOPBACK_ENDPOINT = 'http://127.0.0.1:8188';

export const COMFYUI_PROFESSIONAL_APPLICATION_PROFILE: ProfessionalApplicationProfile =
  parseProfessionalApplicationProfile({
    id: COMFYUI_INTEGRATION_ID,
    name: 'ComfyUI',
    description: 'Local node-based generative media workflows.',
    category: 'workflow-platform',
    supportedPlatforms: ['macos'],
    applicationIdentities: [
      {
        platform: 'macos',
        kind: 'bundle-id',
        value: 'com.todesktop.241012ess7yxs0e',
      },
    ],
    officialDownloadUrl: 'https://github.com/Comfy-Org/Comfy-Desktop/releases',
    configurable: {
      applicationLocator: true,
      endpoint: true,
      defaultWorkflow: true,
    },
    operations: [
      {
        id: 'comfyui.launch',
        label: 'Open ComfyUI',
        kind: 'launch',
        transport: 'host',
        effect: 'launch',
        requiresApproval: false,
        verification: 'launch-receipt',
        inputMimeTypes: [],
      },
      {
        id: 'comfyui.send-input',
        label: 'Send to ComfyUI…',
        kind: 'resource-handoff',
        transport: 'host',
        effect: 'input',
        requiresApproval: true,
        verification: 'launch-receipt',
        inputMimeTypes: ['image/*'],
      },
      {
        id: 'comfyui.inspect-visible',
        label: 'Inspect visible workflow',
        kind: 'inspect-visible',
        transport: 'computer-use',
        effect: 'observe',
        requiresApproval: true,
        verification: 'visual-advisory',
        inputMimeTypes: [],
      },
      {
        id: 'comfyui.run-workflow',
        label: 'Run bound workflow',
        kind: 'run-workflow',
        transport: 'api',
        effect: 'execute',
        requiresApproval: true,
        verification: 'provider-state',
        inputMimeTypes: [],
      },
      {
        id: 'comfyui.observe-workflow',
        label: 'Observe workflow run',
        kind: 'observe-workflow',
        transport: 'api',
        effect: 'observe',
        requiresApproval: false,
        verification: 'provider-state',
        inputMimeTypes: [],
      },
      {
        id: 'comfyui.cancel-workflow',
        label: 'Cancel workflow run',
        kind: 'cancel-workflow',
        transport: 'api',
        effect: 'execute',
        requiresApproval: true,
        verification: 'provider-state',
        inputMimeTypes: [],
      },
      {
        id: 'comfyui.retrieve-output',
        label: 'Retrieve workflow output',
        kind: 'retrieve-output',
        transport: 'api',
        effect: 'retrieve',
        requiresApproval: false,
        verification: 'durable-artifact',
        inputMimeTypes: [],
      },
    ],
  });
