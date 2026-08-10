import type { AutomationProfile } from '@neko/automation-contracts';
import type { AutomationMcpCallResult, AutomationMcpResultProjector } from './mcp-provider';

export const BROWSER_USE_OBSERVE_PROFILE: AutomationProfile = Object.freeze({
  id: 'browser-use.observe',
  provider: Object.freeze({
    extensionId: 'browser-use@openneko',
    providerId: 'browser-use',
    kind: 'browser',
    upstreamRelease: '0.13.7',
    deliverySource: Object.freeze({ kind: 'github-release' as const }),
  }),
  operations: Object.freeze([
    reviewedObserveOperation(
      'browser_get_state',
      'sha256:ac5bc90805141a1a8917bc64ccb1cea0c06646bfca7ec3d811f429600c3201e4',
    ),
    reviewedObserveOperation(
      'browser_get_html',
      'sha256:1f97e90b491aafea0e369501f4917ef365ff2478557b5d0d83d07002fe0de66a',
    ),
    reviewedObserveOperation(
      'browser_screenshot',
      'sha256:3b661d759f56b59d15377c68ec7316d16084eb3ef35182cf2e29ec7f6fb23693',
    ),
    reviewedObserveOperation(
      'browser_list_tabs',
      'sha256:efddc7bd8bbcef73a14eb1ace1ffdaec81e518ef1e13c1e9271d0b8acb694a49',
    ),
    reviewedObserveOperation(
      'browser_list_sessions',
      'sha256:efddc7bd8bbcef73a14eb1ace1ffdaec81e518ef1e13c1e9271d0b8acb694a49',
    ),
  ]),
  requiredPermissions: Object.freeze({}),
});

export const BROWSER_USE_OBSERVE_TOOL_NAMES = Object.freeze(
  BROWSER_USE_OBSERVE_PROFILE.operations.map((operation) => operation.name),
);

const mutableBrowserUseMcpResultProjector: AutomationMcpResultProjector = {
  project({ operation, result }) {
    const text = result.content
      .filter(
        (item): item is { readonly type: 'text'; readonly text: string } => item.type === 'text',
      )
      .map((item) => item.text)
      .join('\n');
    if (result.isError === true || text.startsWith('Error:')) {
      throw new Error(`Browser Use operation '${operation}' failed: ${text || 'unknown error'}`);
    }

    const unsupported = result.content.find(
      (item) => item.type !== 'text' && item.type !== 'image',
    );
    if (unsupported) {
      throw new Error(
        `Browser Use operation '${operation}' returned unsupported ${unsupported.type} content.`,
      );
    }
    const images = result.content.filter(
      (
        item,
      ): item is { readonly type: 'image'; readonly data: string; readonly mimeType: string } =>
        item.type === 'image',
    );
    if (images.length > 1) {
      throw new Error(`Browser Use operation '${operation}' returned multiple screenshots.`);
    }
    const image = images[0];
    const observation = image === undefined ? undefined : projectPngObservation(image);
    return {
      ...(text.length === 0 ? {} : { text }),
      ...(result.structuredContent === undefined
        ? {}
        : { structuredContent: result.structuredContent }),
      ...(observation === undefined ? {} : { observation }),
    };
  },
};

export const browserUseMcpResultProjector = Object.freeze(mutableBrowserUseMcpResultProjector);

function reviewedObserveOperation(name: string, inputSchemaDigest: string) {
  return Object.freeze({
    name,
    inputSchemaDigest,
    modes: Object.freeze(['observe'] as const),
    trait: Object.freeze({
      effect: 'observe' as const,
      readOnly: true,
      destructive: false,
      sensitive: true,
      requiresApproval: false,
    }),
  });
}

function projectPngObservation(image: {
  readonly data: string;
  readonly mimeType: string;
}): NonNullable<ReturnType<AutomationMcpResultProjector['project']>['observation']> {
  if (image.mimeType !== 'image/png') throw new Error('Browser Use screenshot is not PNG.');
  const data = new Uint8Array(Buffer.from(image.data, 'base64'));
  const dimensions = readPngDimensions(data);
  return { data, mimeType: image.mimeType, ...dimensions };
}

function readPngDimensions(data: Uint8Array): { readonly width: number; readonly height: number } {
  if (
    data.byteLength < 24 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47 ||
    data[12] !== 0x49 ||
    data[13] !== 0x48 ||
    data[14] !== 0x44 ||
    data[15] !== 0x52
  ) {
    throw new Error('Browser Use screenshot PNG header is invalid.');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0)
    throw new Error('Browser Use screenshot dimensions are invalid.');
  return { width, height };
}

export type { AutomationMcpCallResult };
