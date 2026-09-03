import {
  parseProfessionalApplicationProfile,
  type ProfessionalApplicationProfile,
} from '@neko/professional-apps-contracts';

export const COMFYUI_INTEGRATION_ID = 'comfyui';
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
      endpoint: false,
      defaultWorkflow: false,
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
    ],
  });
